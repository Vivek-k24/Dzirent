"""Clerk session verification through the official SDK, using locally generated test keys."""

import time
from collections.abc import Callable
from typing import Any

import jwt
import pytest
from clerk_backend_api.security import verifytoken
from clerk_backend_api.security.types import TokenVerificationError, TokenVerificationErrorReason
from conftest import TAXONOMY, error_code
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

ISSUER = "https://clerk.dzirent.test"
ORIGIN = "http://127.0.0.1:3000"


def keypair() -> tuple[Any, str]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private, public_pem.decode()


PRIVATE, PUBLIC_PEM = keypair()
OTHER_PRIVATE, _ = keypair()


def token(private: Any = PRIVATE, **claims: Any) -> str:
    now = int(time.time())
    payload = {
        "sub": "user_2abcDEF",
        "iss": ISSUER,
        "azp": ORIGIN,
        "sid": "sess_123",
        "iat": now - 5,
        "nbf": now - 5,
        "exp": now + 60,
        "v": 2,
    }
    payload.update(claims)
    payload = {k: v for k, v in payload.items() if v is not None}
    return jwt.encode(payload, private, algorithm="RS256", headers={"kid": "ins_test"})


def bearer(value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


CLERK = {
    "identity_mode": "clerk",
    "clerk_issuer": ISSUER,
    "clerk_authorized_parties": [ORIGIN],
    "clerk_jwt_key": PUBLIC_PEM,
}


@pytest.fixture
def clerk_client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client(**CLERK)


def test_verified_subject_bootstraps_application_profile(clerk_client: TestClient) -> None:
    headers = bearer(token(email="member@example.invalid"))
    response = clerk_client.post("/api/v1/me/bootstrap", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["email"] == "member@example.invalid"
    again = clerk_client.get("/api/v1/me", headers=bearer(token()))
    assert again.json()["id"] == response.json()["id"]
    other = clerk_client.post("/api/v1/me/bootstrap", headers=bearer(token(sub="user_other")))
    assert other.json()["id"] != response.json()["id"]


@pytest.mark.parametrize(
    "name,value,reason",
    [
        ("expired", lambda: token(exp=int(time.time()) - 120), "token-expired"),
        ("future nbf", lambda: token(nbf=int(time.time()) + 600), "token-not-active-yet"),
        ("wrong key", lambda: token(private=OTHER_PRIVATE), "token-invalid-signature"),
        (
            "wrong azp",
            lambda: token(azp="https://evil.example"),
            "token-invalid-authorized-parties",
        ),
        ("missing azp", lambda: token(azp=None), "token-invalid-authorized-parties"),
        ("wrong issuer", lambda: token(iss="https://clerk.other.test"), "token-invalid-issuer"),
        ("missing sub", lambda: token(sub=None), "token-invalid"),
        ("missing exp", lambda: token(exp=None), "token-invalid"),
        ("unexpected audience", lambda: token(aud="other-api"), "token-invalid-audience"),
        (
            "unsigned",
            lambda: jwt.encode({"sub": "user_x", "iss": ISSUER}, None, algorithm="none"),
            None,
        ),
        ("machine token", lambda: "mt_abcdef0123456789", "token-type-not-supported"),
        ("mock token", lambda: "mock:alice", None),
        ("garbage", lambda: "not.a.jwt", None),
    ],
)
def test_invalid_tokens_are_unauthenticated(
    clerk_client: TestClient, name: str, value: Callable[[], str], reason: str | None
) -> None:
    response = clerk_client.post("/api/v1/me/bootstrap", headers=bearer(value()))
    assert response.status_code == 401, name
    assert error_code(response) == "unauthenticated"
    if reason:
        assert response.json()["error"]["details"] == [{"reason": reason}]


def test_cookie_session_is_not_accepted(clerk_client: TestClient) -> None:
    clerk_client.cookies.set("__session", token())
    response = clerk_client.post("/api/v1/me/bootstrap")
    assert response.status_code == 401
    assert response.json()["error"]["details"] == [{"reason": "missing"}]


def test_client_supplied_roles_and_ids_are_ignored(clerk_client: TestClient) -> None:
    headers = bearer(
        token(sub="user_claims", role="admin", user_id="someone-else", org_role="admin")
    )
    me = clerk_client.post("/api/v1/me/bootstrap", headers=headers).json()
    assert me["roles"] == ["renter"]
    metro = TAXONOMY["locations"]["items"][0]["id"]
    enrolled = clerk_client.post(
        "/api/v1/me/lender-profile",
        headers=headers,
        json={"display_name": "Claims", "metro_id": metro},
    )
    assert enrolled.status_code == 200
    me = clerk_client.get("/api/v1/me", headers=headers).json()
    assert me["roles"] == ["renter", "lender"]


def test_jwks_outage_is_a_dependency_failure(
    make_client: Callable[..., TestClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    def unreachable(options: Any) -> Any:
        raise TokenVerificationError(TokenVerificationErrorReason.JWK_FAILED_TO_LOAD)

    monkeypatch.setattr(verifytoken, "_fetch_jwks", unreachable)
    client = make_client(
        **{**CLERK, "clerk_jwt_key": "", "clerk_secret_key": "sk_test_placeholder"}
    )
    response = client.post("/api/v1/me/bootstrap", headers=bearer(token(sub="user_outage")))
    assert response.status_code == 503 and error_code(response) == "dependency_unavailable"
    assert "sk_test" not in response.text


def test_connected_mode_rejects_fixture_images_and_mock_tokens(
    make_client: Callable[..., TestClient],
) -> None:
    client = make_client(**CLERK, mode="connected")
    assert (
        client.post("/api/v1/me/bootstrap", headers=bearer("mock:sample-lender")).status_code == 401
    )
    headers = bearer(token(sub="user_connected"))
    client.post("/api/v1/me/bootstrap", headers=headers)
    metro = TAXONOMY["locations"]["items"][0]["id"]
    client.post(
        "/api/v1/me/lender-profile", headers=headers, json={"display_name": "C", "metro_id": metro}
    )
    from conftest import write_body

    response = client.post("/api/v1/lender/products", headers=headers, json=write_body())
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["issue"] == "image_not_allowed"
    created = client.post("/api/v1/lender/products", headers=headers, json=write_body(image_ids=[]))
    assert created.status_code == 201
