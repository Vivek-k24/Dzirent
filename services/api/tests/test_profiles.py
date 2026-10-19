"""Own-profile, preferences and lender enrollment: persistence, identity and allowlists."""

from collections.abc import Callable

import pytest
from conftest import PRODUCTS_PATH_EXAMPLE, SEED_LENDER, TAXONOMY, auth, enroll, error_code
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

METROS = {m["slug"]: m["id"] for m in TAXONOMY["locations"]["items"]}
PROTECTED = [
    ("POST", "/api/v1/me/bootstrap"),
    ("GET", "/api/v1/me"),
    ("PATCH", "/api/v1/me"),
    ("DELETE", "/api/v1/me"),
    ("GET", "/api/v1/me/preferences"),
    ("PATCH", "/api/v1/me/preferences"),
    ("POST", "/api/v1/me/lender-profile"),
    ("GET", "/api/v1/lender/products"),
    ("POST", "/api/v1/lender/products"),
    ("GET", PRODUCTS_PATH_EXAMPLE),
    ("PATCH", PRODUCTS_PATH_EXAMPLE),
    ("DELETE", PRODUCTS_PATH_EXAMPLE + "?expected_version=1"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "Bearer",
        "Basic bW9jazphbGljZQ==",
        "Bearer mock:",
        "Bearer mock:Bad Subject",
        "Bearer x y",
    ],
)
def test_protected_routes_require_identity(
    client: TestClient, method: str, path: str, authorization: str | None
) -> None:
    headers = {"Authorization": authorization} if authorization else {}
    response = client.request(method, path, headers=headers, json={})
    assert response.status_code == 401
    assert error_code(response) == "unauthenticated"
    assert response.headers["www-authenticate"] == "Bearer"


def test_profile_requires_bootstrap_which_is_idempotent(client: TestClient) -> None:
    headers = auth("alice")
    missing = client.get("/api/v1/me", headers=headers)
    assert missing.status_code == 404 and error_code(missing) == "profile_not_found"
    first = client.post("/api/v1/me/bootstrap", headers=headers)
    second = client.post("/api/v1/me/bootstrap", headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["roles"] == ["renter"]
    assert first.json()["lender_profile"] is None
    assert client.get("/api/v1/me", headers=headers).json()["id"] == first.json()["id"]


def test_profile_update_persists_across_sessions(
    make_client: Callable[..., TestClient],
) -> None:
    writer, reader = make_client(), make_client()
    headers = auth("bob")
    writer.post("/api/v1/me/bootstrap", headers=headers)
    updated = writer.patch("/api/v1/me", headers=headers, json={"display_name": "  Bob B.  "})
    assert updated.status_code == 200 and updated.json()["display_name"] == "Bob B."
    assert reader.get("/api/v1/me", headers=headers).json()["display_name"] == "Bob B."


@pytest.mark.parametrize(
    "body",
    [
        {"display_name": "   "},
        {"display_name": ""},
        {"display_name": "x" * 101},
        {"display_name": "line\nbreak"},
        {"display_name": "Eve", "roles": ["admin"]},
        {"display_name": "Eve", "status": "active", "id": "00000000-0000-0000-0000-000000000000"},
        {"display_name": "Eve", "admin": True},
        {},
    ],
)
def test_profile_update_allowlist(client: TestClient, body: dict[str, object]) -> None:
    headers = auth("eve")
    client.post("/api/v1/me/bootstrap", headers=headers)
    response = client.patch("/api/v1/me", headers=headers, json=body)
    assert response.status_code == 422 and error_code(response) == "validation_error"
    me = client.get("/api/v1/me", headers=headers).json()
    assert me["roles"] == ["renter"] and me["display_name"] == "New member"


def test_preferences_partial_update_and_validation(client: TestClient) -> None:
    headers = auth("carol")
    client.post("/api/v1/me/bootstrap", headers=headers)
    assert client.get("/api/v1/me/preferences", headers=headers).json() == {
        "metro_id": None,
        "postal_code": None,
    }
    set_both = client.patch(
        "/api/v1/me/preferences",
        headers=headers,
        json={"metro_id": METROS["austin"], "postal_code": "78701"},
    )
    assert set_both.status_code == 200
    assert set_both.json() == {"metro_id": METROS["austin"], "postal_code": "78701"}
    # Only supplied fields change; explicit null clears.
    cleared = client.patch("/api/v1/me/preferences", headers=headers, json={"postal_code": None})
    assert cleared.json() == {"metro_id": METROS["austin"], "postal_code": None}
    for body in (
        {"postal_code": "77002"},  # Houston ZIP conflicts with stored Austin metro
        {"metro_id": "00000000-0000-0000-0000-000000000000"},
        {"postal_code": "7870"},
        {"postal_code": "abcde"},
        {"metro_id": METROS["austin"], "user_id": "00000000-0000-0000-0000-000000000000"},
    ):
        response = client.patch("/api/v1/me/preferences", headers=headers, json=body)
        assert response.status_code == 422, body
        assert error_code(response) == "validation_error"
    unmapped = client.patch(
        "/api/v1/me/preferences",
        headers=headers,
        json={"metro_id": METROS["other-texas"], "postal_code": "10001"},
    )
    assert unmapped.status_code == 200


def test_lender_enrollment_is_idempotent_and_never_accepts_owner_ids(client: TestClient) -> None:
    headers = auth("dana")
    client.post("/api/v1/me/bootstrap", headers=headers)
    forbidden = client.get("/api/v1/lender/products", headers=headers)
    assert forbidden.status_code == 403 and error_code(forbidden) == "lender_required"
    for body in (
        {"display_name": "Dana", "metro_id": "00000000-0000-0000-0000-000000000000"},
        {"display_name": " ", "metro_id": METROS["dallas-fort-worth"]},
        {"display_name": "Dana", "metro_id": METROS["austin"], "user_id": "x"},
        {"display_name": "Dana", "metro_id": METROS["austin"], "role": "admin"},
    ):
        response = client.post("/api/v1/me/lender-profile", headers=headers, json=body)
        assert response.status_code == 422, body
    first = client.post(
        "/api/v1/me/lender-profile",
        headers=headers,
        json={"display_name": "Dana's closet", "metro_id": METROS["dallas-fort-worth"]},
    )
    again = client.post(
        "/api/v1/me/lender-profile",
        headers=headers,
        json={"display_name": "Renamed", "metro_id": METROS["houston"]},
    )
    assert first.status_code == again.status_code == 200
    assert again.json() == first.json()
    assert first.json()["status"] == "active"
    me = client.get("/api/v1/me", headers=headers).json()
    assert me["roles"] == ["renter", "lender"] and me["lender_profile"] == first.json()
    listing = client.get("/api/v1/lender/products", headers=headers)
    assert listing.status_code == 200 and listing.json()["total"] == 0


def test_enrollment_requires_bootstrapped_profile(client: TestClient) -> None:
    response = client.post(
        "/api/v1/me/lender-profile",
        headers=auth("no-profile"),
        json={"display_name": "Nope", "metro_id": METROS["austin"]},
    )
    assert response.status_code == 404 and error_code(response) == "profile_not_found"


def test_deactivation_hides_listings_and_blocks_writes(client: TestClient, engine: Engine) -> None:
    headers = enroll(client, "frank")
    deactivated = client.delete("/api/v1/me", headers=headers)
    assert deactivated.status_code == 200
    assert deactivated.json()["status"] == "inactive"
    assert deactivated.json()["lender_profile"]["status"] == "inactive"
    assert client.delete("/api/v1/me", headers=headers).json() == deactivated.json()
    assert client.get("/api/v1/me", headers=headers).json()["status"] == "inactive"
    assert client.post("/api/v1/me/bootstrap", headers=headers).json()["status"] == "inactive"
    blocked = client.patch("/api/v1/me", headers=headers, json={"display_name": "Frank"})
    assert blocked.status_code == 403 and error_code(blocked) == "account_inactive"
    lender = client.get("/api/v1/lender/products", headers=headers)
    assert lender.status_code == 403 and error_code(lender) == "account_inactive"
    with engine.connect() as connection:
        # The row still exists: deactivation is not deletion and no password column exists.
        columns = (
            connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
                )
            )
            .scalars()
            .all()
        )
    assert not {c for c in columns if "pass" in c or "secret" in c}


def test_seed_lender_mock_identity_owns_seed_listings(client: TestClient) -> None:
    me = client.get("/api/v1/me", headers=SEED_LENDER)
    assert me.status_code == 200 and me.json()["roles"] == ["renter", "lender"]
    listing = client.get("/api/v1/lender/products", headers=SEED_LENDER)
    assert listing.json()["total"] == 40
