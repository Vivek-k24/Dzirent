"""Studio workflow against real PostgreSQL. Four bounded integration cases (ADR 0004)."""

from collections.abc import Callable

from conftest import MANIFEST, SEED_LENDER, auth, enroll, error_code, write_body
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

SEED = MANIFEST["seed_studio"]
PUBLIC_KEYS = {"id", "handle", "display_name", "bio", "state_code", "published_product_count"}


def test_owner_settings_persist_with_stable_handle_and_versioning(
    make_client: Callable[..., TestClient], engine: Engine
) -> None:
    writer, reader = make_client(), make_client()
    owner = enroll(writer, "studio-owner")
    assert writer.get("/api/v1/me/studio", headers=owner).json()["error"]["code"] == (
        "studio_not_found"
    )
    created = writer.put(
        "/api/v1/me/studio",
        headers=owner,
        json={"display_name": "  Linen & Lace  ", "bio": "Occasion wear.", "is_public": False},
    )
    assert created.status_code == 200, created.text
    first = created.json()
    assert first["handle"] == "linen-lace" and first["display_name"] == "Linen & Lace"
    assert first["version"] == 1 and first["is_public"] is False
    assert first["published_product_count"] == 0
    # Renaming keeps the server-assigned handle, so public URLs survive.
    renamed = writer.put(
        "/api/v1/me/studio",
        headers=owner,
        json={"display_name": "Lace Atelier", "bio": "", "is_public": True, "expected_version": 1},
    )
    assert renamed.status_code == 200 and renamed.json()["version"] == 2
    assert renamed.json()["handle"] == "linen-lace"
    # A second client and a direct database session both observe the committed values.
    assert reader.get("/api/v1/me/studio", headers=owner).json() == renamed.json()
    with engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT display_name, bio, is_public, version FROM studios WHERE handle = 'linen-lace'"
            )
        ).one()
    assert tuple(row) == ("Lace Atelier", "", True, 2)
    for body, status, code in (
        ({"display_name": "Old", "is_public": True, "expected_version": 1}, 409, "stale_version"),
        ({"display_name": "Again", "is_public": True}, 409, "stale_version"),
        (
            {"display_name": "   ", "is_public": True, "expected_version": 2},
            422,
            "validation_error",
        ),
        (
            {"display_name": "x" * 81, "is_public": True, "expected_version": 2},
            422,
            "validation_error",
        ),
        (
            {"display_name": "Ok", "bio": "b" * 601, "is_public": True, "expected_version": 2},
            422,
            "validation_error",
        ),
        (
            {"display_name": "Ok", "is_public": True, "expected_version": 2, "handle": "taken"},
            422,
            "validation_error",
        ),
    ):
        response = writer.put("/api/v1/me/studio", headers=owner, json=body)
        assert response.status_code == status and error_code(response) == code, body
    stale = writer.put(
        "/api/v1/me/studio",
        headers=owner,
        json={"display_name": "Old", "is_public": True, "expected_version": 1},
    )
    assert stale.json()["error"]["details"] == [{"field": "expected_version", "current_version": 2}]
    assert reader.get("/api/v1/me/studio", headers=owner).json()["version"] == 2


def test_studio_ownership_comes_from_the_verified_identity(client: TestClient) -> None:
    other = enroll(client, "other-lender")
    seed_before = client.get("/api/v1/me/studio", headers=SEED_LENDER).json()
    assert seed_before["handle"] == SEED["handle"] and seed_before["version"] == 1
    # Client-supplied owner identifiers are rejected; the subject decides whose Studio is written.
    for forged in (
        {"lender_profile_id": seed_before["id"]},
        {"id": seed_before["id"]},
        {"user_id": "x"},
    ):
        response = client.put(
            "/api/v1/me/studio",
            headers=other,
            json={"display_name": "Forged", "is_public": True, **forged},
        )
        assert response.status_code == 422, forged
    mine = client.put(
        "/api/v1/me/studio",
        headers=other,
        json={"display_name": "Sample Lender", "is_public": True},
    )
    assert mine.status_code == 200
    # Same display name as the seed Studio, yet a distinct record and a non-colliding handle.
    assert mine.json()["id"] != seed_before["id"]
    assert mine.json()["handle"].startswith("sample-lender-")
    assert client.get("/api/v1/me/studio", headers=SEED_LENDER).json() == seed_before
    renter = auth("studio-renter")
    client.post("/api/v1/me/bootstrap", headers=renter)
    denied = client.put(
        "/api/v1/me/studio", headers=renter, json={"display_name": "R", "is_public": True}
    )
    assert denied.status_code == 403 and error_code(denied) == "lender_required"
    anonymous = client.get("/api/v1/me/studio")
    assert anonymous.status_code == 401 and error_code(anonymous) == "unauthenticated"


def test_public_directory_hides_private_empty_and_inactive_studios(client: TestClient) -> None:
    directory = client.get("/api/v1/studios").json()
    assert directory["total"] == 1 and directory["items"] == [{k: SEED[k] for k in PUBLIC_KEYS}]
    assert set(directory["items"][0]) == PUBLIC_KEYS  # no email, subject, address or settings
    # Zero published products: a real profile page, excluded from the default directory.
    empty = enroll(client, "empty-studio")
    client.put(
        "/api/v1/me/studio", headers=empty, json={"display_name": "Empty Rack", "is_public": True}
    )
    profile = client.get("/api/v1/studios/empty-rack")
    assert profile.status_code == 200 and profile.json()["published_product_count"] == 0
    assert client.get("/api/v1/studios/empty-rack/products").json()["items"] == []
    # Drafts and archived listings never count; published-but-unavailable listings do.
    draft = client.post(
        "/api/v1/lender/products", headers=empty, json=write_body(status="draft", image_ids=[])
    )
    published = client.post(
        "/api/v1/lender/products",
        headers=empty,
        json=write_body(status="published", is_available=False, image_ids=[]),
    )
    archived = client.post(
        "/api/v1/lender/products", headers=empty, json=write_body(status="published", image_ids=[])
    )
    assert {r.status_code for r in (draft, published, archived)} == {201}
    archive = client.delete(
        f"/api/v1/lender/products/{archived.json()['id']}",
        headers=empty,
        params={"expected_version": 1},
    )
    assert archive.status_code == 200
    assert client.get("/api/v1/studios/empty-rack").json()["published_product_count"] == 1
    listed = client.get("/api/v1/studios/empty-rack/products").json()
    assert [item["id"] for item in listed["items"]] == [published.json()["id"]]
    assert listed["items"][0]["is_available"] is False
    assert client.get("/api/v1/studios").json()["total"] == 2
    # Private and deactivated Studios disappear and are indistinguishable from missing ones.
    settings = client.get("/api/v1/me/studio", headers=empty).json()
    client.put(
        "/api/v1/me/studio",
        headers=empty,
        json={
            "display_name": "Empty Rack",
            "is_public": False,
            "expected_version": settings["version"],
        },
    )
    for path in (
        "/api/v1/studios/empty-rack",
        "/api/v1/studios/empty-rack/products",
        "/api/v1/studios/NOT_A_HANDLE",
    ):
        response = client.get(path)
        assert response.status_code == 404 and error_code(response) == "not_found", path
    assert client.delete("/api/v1/me", headers=SEED_LENDER).status_code == 200
    assert client.get(f"/api/v1/studios/{SEED['handle']}").status_code == 404
    assert client.get("/api/v1/studios").json() == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 24,
    }


def test_studio_products_paginate_every_published_outfit(client: TestClient) -> None:
    seen: list[str] = []
    for page in range(1, 8):
        body = client.get(
            f"/api/v1/studios/{SEED['handle']}/products", params={"page": page, "page_size": 7}
        ).json()
        assert body["total"] == 40 and body["page_size"] == 7
        seen.extend(item["id"] for item in body["items"])
    published = [p for p in MANIFEST["products"] if p["status"] == "published"]
    # Every published outfit exactly once across later pages, newest first then id.
    assert len(seen) == len(set(seen)) == 40 and set(seen) == {p["id"] for p in published}
    expected = sorted(published, key=lambda p: p["id"])
    expected.sort(key=lambda p: p["created_at"], reverse=True)
    assert seen == [p["id"] for p in expected]
    beyond = client.get(
        f"/api/v1/studios/{SEED['handle']}/products", params={"page": 9, "page_size": 7}
    )
    assert (
        beyond.status_code == 200 and beyond.json()["items"] == [] and beyond.json()["total"] == 40
    )
    for params in ({"page_size": 101}, {"page": 0}, {"page_size": "all"}):
        response = client.get(f"/api/v1/studios/{SEED['handle']}/products", params=params)
        assert response.status_code == 422 and error_code(response) == "validation_error", params
    assert client.get("/api/v1/studios/unknown-studio/products").status_code == 404
