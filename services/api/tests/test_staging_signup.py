"""Issue84: explicit protected staging exception; only owned disposable loopback PG17.

No real identities, cloud connection or email transport is used by this test module.
"""

import secrets
from typing import Any

import pytest
from conftest import TAXONOMY
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import Engine, func, select
from test_native_auth import csrf, login, mutate
from test_native_auth import password as password

from dzirent_api import orm
from dzirent_api.auth import crypto, security
from dzirent_api.settings import STAGING_AUTH_ORIGIN, Settings

EMAIL = "issue84-local@mail.dzirent.com"
PROXY_KEY = secrets.token_urlsafe(48)
CSRF_KEY = secrets.token_urlsafe(32)


def staging_values(**overrides: Any) -> dict[str, Any]:
    values: dict[str, Any] = {
        "mode": "connected",
        "identity_mode": "native",
        "environment": "staging",
        "auth_web_origin": STAGING_AUTH_ORIGIN,
        "cors_origins": [],
        "auth_staging_signup_without_email": True,
        "auth_staging_proxy_key": PROXY_KEY,
        "auth_email_backend": "disabled",
        "auth_email_worker_enabled": False,
    }
    values.update(overrides)
    return values


@pytest.fixture
def staging(make_client: Any) -> TestClient:
    client = make_client(client_base_url=STAGING_AUTH_ORIGIN, **staging_values())
    client.headers[security.STAGING_PROXY_HEADER] = PROXY_KEY
    return client


def register(client: TestClient, password: SecretStr, email: str = EMAIL) -> Any:
    return mutate(
        client,
        "/auth/register",
        {"email": email, "password": password.get_secret_value(), "display_name": "Local renter"},
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"environment": "production"},
        {"environment": "local"},
        {"environment": "test"},
        {"mode": "demo"},
        {"identity_mode": "mock"},
        {"auth_web_origin": "https://dzirent.com"},
        {"auth_web_origin": "https://unreviewed-preview.vercel.app"},
        {"auth_staging_proxy_key": ""},
        {"auth_staging_proxy_key": "short"},
        {"auth_staging_proxy_key": "é" * 64},
        {"auth_email_worker_enabled": True},
        {"auth_email_backend": "smtp"},
    ],
)
def test_exception_startup_refuses_unprotected_or_nonstaging_configuration(
    overrides: dict[str, Any],
) -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgresql://unused@127.0.0.1/unused_test",
            auth_csrf_key=CSRF_KEY,
            **staging_values(**overrides),
        )


def test_flag_defaults_off_and_staging_key_cannot_escape_to_production() -> None:
    assert Settings(_env_file=None).auth_staging_signup_without_email is False
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="postgresql://unused@127.0.0.1/unused_test",
            auth_csrf_key=CSRF_KEY,
            **staging_values(environment="production", auth_staging_signup_without_email=False),
        )


def test_real_local_account_without_mail_then_normal_login(
    staging: TestClient, password: SecretStr, db: Engine
) -> None:
    response = register(staging, password)
    assert response.status_code == 202
    assert staging.get("/api/v1/auth/session").status_code == 401
    result = login(staging, password, EMAIL)
    assert result.status_code == 200
    body = result.json()
    assert body["email_verified"] is False and body["synthetic"] is False
    assert body["capabilities"] == [] and body["user"]["roles"] == ["renter"]
    assert body["user"]["lender_profile"] is None
    assert staging.get("/api/v1/me").json()["id"] == body["user"]["id"]
    with db.connect() as connection:
        row = connection.execute(select(orm.AuthCredential)).one()
        assert row.email_verified_at is None and row.synthetic is False
        assert row.password_hash.startswith("$argon2id$")
        assert crypto.verify_password(row.password_hash, password.get_secret_value())
        assert connection.scalar(select(func.count()).select_from(orm.AuthToken)) == 0
        assert connection.scalar(select(func.count()).select_from(orm.AuthEmailOutbox)) == 0
    cookie = result.headers.get("set-cookie", "").lower()
    assert "__host-dzirent_session=" in cookie
    assert all(flag in cookie for flag in ("httponly", "secure", "samesite=lax", "path=/"))


def test_unverified_staging_lender_enrolls_without_granting_admin(
    staging: TestClient, password: SecretStr, db: Engine
) -> None:
    assert register(staging, password).status_code == 202
    assert login(staging, password, EMAIL).status_code == 200
    assert (
        mutate(staging, "/me", {"display_name": "Updated renter"}, method="PATCH").status_code
        == 200
    )
    assert (
        mutate(staging, "/me/preferences", {"postal_code": None}, method="PATCH").status_code == 200
    )
    metro = TAXONOMY["locations"]["items"][0]["id"]
    response = mutate(
        staging,
        "/me/lender-profile",
        {"display_name": "Local lender", "metro_id": metro},
    )
    assert response.status_code == 200
    assert response.json()["metro_id"] == metro
    assert staging.get("/api/v1/lender/products").status_code == 200
    assert staging.get("/api/v1/admin/access").status_code == 403
    current = staging.get("/api/v1/auth/session").json()
    assert current["email_verified"] is False
    assert current["capabilities"] == []
    assert current["user"]["lender_profile"] is not None
    with db.connect() as connection:
        assert (
            connection.scalar(
                select(func.count())
                .select_from(orm.LenderProfile)
                .join(orm.User)
                .where(orm.User.email == EMAIL)
            )
            == 1
        )
        credential = connection.scalar(
            select(orm.AuthCredential).join(orm.User).where(orm.User.email == EMAIL)
        )
        assert credential is not None and credential.email_verified_at is None
        assert connection.scalar(select(func.count()).select_from(orm.PlatformAdminGrant)) == 0
        roles = sorted(
            connection.execute(
                select(orm.UserRole.role).join(orm.User).where(orm.User.email == EMAIL)
            )
            .scalars()
            .all()
        )
        assert roles == ["lender", "renter"]


def test_duplicate_does_not_replace_password_or_reveal_existing_subject(
    staging: TestClient, password: SecretStr, db: Engine
) -> None:
    first = register(staging, password)
    other = SecretStr(secrets.token_urlsafe(24))
    duplicate = register(staging, other, EMAIL.upper())
    assert first.status_code == duplicate.status_code == 202
    assert first.json() == duplicate.json()
    known = login(staging, other, EMAIL)
    unknown = login(staging, other, "absent-issue84@mail.dzirent.com")
    assert known.status_code == unknown.status_code == 401
    assert known.json()["error"] == unknown.json()["error"]
    assert login(staging, password, EMAIL).status_code == 200
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 1


@pytest.mark.parametrize("claim", ["email_verified", "roles", "capabilities"])
def test_client_cannot_enable_verification_or_privileges(
    staging: TestClient, password: SecretStr, claim: str, db: Engine
) -> None:
    response = mutate(
        staging,
        "/auth/register",
        {
            "email": EMAIL,
            "password": password.get_secret_value(),
            "display_name": "Local",
            claim: True,
        },
    )
    assert response.status_code == 422
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 0


def test_direct_api_denial_is_independent_of_origin_and_csrf(
    staging: TestClient, password: SecretStr, db: Engine
) -> None:
    token = csrf(staging)
    staging.headers.pop(security.STAGING_PROXY_HEADER)
    assert staging.get("/api/v1/auth/csrf").status_code == 403
    response = mutate(
        staging,
        "/auth/register",
        {"email": EMAIL, "password": password.get_secret_value(), "display_name": "Local"},
        token=token,
        headers={"X-Forwarded-Host": STAGING_AUTH_ORIGIN, "X-Role": "platform_admin"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth_staging_access_required"
    assert (
        staging.get(
            "/api/v1/auth/session", headers={security.STAGING_PROXY_HEADER: "x" * 64}
        ).status_code
        == 403
    )
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 0
        assert connection.scalar(select(func.count()).select_from(orm.AuthRateLimit)) == 0


def test_proxy_key_does_not_replace_csrf_or_origin(staging: TestClient) -> None:
    token = csrf(staging)
    for headers in (
        {"Origin": "https://foreign.invalid", "X-Dzirent-CSRF": token},
        {"Origin": STAGING_AUTH_ORIGIN, "X-Dzirent-CSRF": "forged"},
    ):
        response = staging.post("/api/v1/auth/logout", json={}, headers=headers)
        assert response.status_code == 403


def test_rate_limits_survive_failed_logins(staging: TestClient, password: SecretStr) -> None:
    statuses = [
        login(staging, password, "absent-issue84@mail.dzirent.com").status_code for _ in range(10)
    ]
    assert statuses == [401] * 10
    response = login(staging, password, "absent-issue84@mail.dzirent.com")
    assert response.status_code == 429 and response.headers["retry-after"] == "900"


def test_session_survives_new_app_and_logout_revokes_old_cookie(
    staging: TestClient, password: SecretStr, make_client: Any
) -> None:
    assert register(staging, password).status_code == 202
    identity = login(staging, password, EMAIL).json()["user"]["id"]
    restarted = make_client(client_base_url=STAGING_AUTH_ORIGIN, **staging_values())
    restarted.headers[security.STAGING_PROXY_HEADER] = PROXY_KEY
    restarted.cookies.update(staging.cookies)
    assert restarted.get("/api/v1/auth/session").json()["user"]["id"] == identity
    assert mutate(restarted, "/auth/logout").status_code == 204
    assert staging.get("/api/v1/auth/session").status_code == 401
    assert login(staging, password, EMAIL).status_code == 200
    assert (
        mutate(
            staging, "/auth/logout-all", {"current_password": password.get_secret_value()}
        ).status_code
        == 204
    )
    assert staging.get("/api/v1/auth/session").status_code == 401


def test_turning_setting_off_restores_required_verification(
    staging: TestClient, password: SecretStr, make_client: Any
) -> None:
    assert register(staging, password).status_code == 202
    assert login(staging, password, EMAIL).status_code == 200
    assert (
        mutate(
            staging,
            "/me/lender-profile",
            {"display_name": "Staging lender", "metro_id": TAXONOMY["locations"]["items"][0]["id"]},
        ).status_code
        == 200
    )
    strict = make_client(
        client_base_url=STAGING_AUTH_ORIGIN,
        **staging_values(auth_staging_signup_without_email=False),
    )
    strict.headers[security.STAGING_PROXY_HEADER] = PROXY_KEY
    strict.cookies.update(staging.cookies)
    assert strict.get("/api/v1/auth/session").json()["email_verified"] is False
    response = mutate(strict, "/me", {"display_name": "Must verify first"}, method="PATCH")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "email_verification_required"
    assert strict.get("/api/v1/lender/products").status_code == 403
    assert (
        mutate(
            strict,
            "/me/lender-profile",
            {"display_name": "Staging lender", "metro_id": TAXONOMY["locations"]["items"][0]["id"]},
        ).status_code
        == 403
    )
    assert register(strict, password, "other-issue84@mail.dzirent.com").status_code == 503
    assert mutate(strict, "/auth/email/request").status_code == 503
