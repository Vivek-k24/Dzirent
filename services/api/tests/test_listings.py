"""Owner-scoped listing CRUD: persistence, validation, optimistic concurrency and ownership."""

import threading
from collections.abc import Callable
from typing import Any

import pytest
from conftest import MANIFEST, SEED_LENDER, TAXONOMY, auth, enroll, error_code, write_body
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

ROOTS = {root["slug"]: root for root in TAXONOMY["categories"]["items"]}
LEAF = ROOTS["women"]["children"][1]["id"]
SEED_PRODUCT = MANIFEST["products"][4]
COLORS = {c["slug"]: c["id"] for c in TAXONOMY["facets"]["colors"]}
BRAND = TAXONOMY["facets"]["brands"][2]["id"]
SIZE = TAXONOMY["facets"]["sizes"][3]["id"]
METRO = TAXONOMY["locations"]["items"][2]["id"]
MISSING = "00000000-0000-0000-0000-000000000000"


def create(client: TestClient, headers: dict[str, str], **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/v1/lender/products", headers=headers, json=write_body(**overrides))
    assert response.status_code == 201, response.text
    return dict(response.json())


def test_create_persists_and_server_assigns_identity(
    make_client: Callable[..., TestClient],
) -> None:
    writer, reader = make_client(), make_client()
    headers = enroll(writer, "gina")
    me = writer.get("/api/v1/me", headers=headers).json()
    created = create(writer, headers, title="Emerald Silk Gown", status="draft", image_ids=[])
    assert created["lender_profile_id"] == me["lender_profile"]["id"]
    assert created["version"] == 1 and created["status"] == "draft"
    assert created["slug"].startswith("emerald-silk-gown-")
    assert created["sample_rating"] is None and created["sample_rating_count"] == 0
    # No images yet: a deterministic local placeholder fills the required card image.
    assert created["images"] == [] and created["image"]["media_status"] == "fixture"
    fetched = reader.get(f"/api/v1/lender/products/{created['id']}", headers=headers)
    assert fetched.status_code == 200 and fetched.json() == created
    owned = reader.get("/api/v1/lender/products", headers=headers).json()
    assert [item["id"] for item in owned["items"]] == [created["id"]] and owned["total"] == 1
    # Drafts are private.
    assert reader.get(f"/api/v1/catalog/products/{created['slug']}").status_code == 404


def test_published_listing_appears_in_public_catalog(client: TestClient) -> None:
    headers = enroll(client, "hana")
    created = create(client, headers, status="published", title="Ruby Party Set")
    public = client.get(f"/api/v1/catalog/products/{created['slug']}")
    assert public.status_code == 200 and public.json()["id"] == created["id"]
    listing = client.get("/api/v1/catalog/products", params={"q": "ruby party"}).json()
    assert [item["id"] for item in listing["items"]] == [created["id"]]
    assert client.get("/api/v1/catalog/products").json()["collection_total"] == 41


def test_full_write_round_trip(client: TestClient) -> None:
    headers = enroll(client, "ivy")
    body = write_body(
        primary_category_id=LEAF,
        secondary_category_ids=[ROOTS["designer"]["id"], ROOTS["bridal"]["children"][0]["id"]],
        brand_id=BRAND,
        size_id=SIZE,
        color_ids=[COLORS["green"], COLORS["gold"]],
        metro_id=METRO,
        band="C",
        rental_price_minor=12000,
        retail_price_minor=80000,
        measurements=[
            {"key": "Bust", "value": 86.456, "unit": "cm"},
            {"key": "length", "value": 140, "unit": "cm"},
        ],
        date_blocks=[
            {"start": "2026-12-20", "end": "2026-12-22", "reason": "owner-unavailable"},
            {"start": "2026-12-01", "end": "2026-12-01", "reason": "owner-unavailable"},
        ],
        status="published",
        is_available=False,
    )
    created = client.post("/api/v1/lender/products", headers=headers, json=body).json()
    assert created["primary_collection_id"] == ROOTS["women"]["id"]
    assert created["secondary_category_ids"] == body["secondary_category_ids"]
    assert [c["slug"] for c in created["colors"]] == ["green", "gold"]
    assert created["measurements"] == [
        {"key": "bust", "value": 86.46, "unit": "cm"},
        {"key": "length", "value": 140.0, "unit": "cm"},
    ]
    assert [b["start"] for b in created["date_blocks"]] == ["2026-12-01", "2026-12-20"]
    assert created["band"] == "C" and created["rental_price_minor"] == 12000
    assert created["is_available"] is False
    # Secondary membership makes it discoverable from Designer without duplicating cards.
    designer = client.get("/api/v1/catalog/products", params={"collection": "designer"}).json()
    assert designer["total"] == 8 and created["id"] in {i["id"] for i in designer["items"]}


INVALID_WRITES: list[tuple[str, dict[str, Any]]] = [
    ("root as primary", {"primary_category_id": ROOTS["women"]["id"]}),
    ("unknown category", {"primary_category_id": MISSING}),
    (
        "redundant secondary",
        {"primary_category_id": LEAF, "secondary_category_ids": [ROOTS["women"]["id"]]},
    ),
    ("secondary is primary", {"primary_category_id": LEAF, "secondary_category_ids": [LEAF]}),
    ("duplicate secondary", {"secondary_category_ids": [ROOTS["bridal"]["id"]] * 2}),
    ("unknown secondary", {"secondary_category_ids": [MISSING]}),
    ("band mismatch", {"band": "A", "rental_price_minor": 5000}),
    ("band upper bound exclusive", {"band": "B", "rental_price_minor": 10000}),
    ("negative price", {"rental_price_minor": -1}),
    ("fractional price", {"rental_price_minor": 7500.5}),
    ("string price", {"rental_price_minor": "7500"}),
    ("huge price", {"band": "D", "rental_price_minor": 10**12}),
    ("non-USD", {"currency": "EUR"}),
    ("unknown brand", {"brand_id": MISSING}),
    ("unknown size", {"size_id": MISSING}),
    ("unknown metro", {"metro_id": MISSING}),
    ("unknown color", {"color_ids": [MISSING]}),
    ("duplicate color", {"color_ids": [COLORS["red"], COLORS["red"]]}),
    ("no colors", {"color_ids": []}),
    ("zero measurement", {"measurements": [{"key": "chest", "value": 0, "unit": "cm"}]}),
    ("huge measurement", {"measurements": [{"key": "chest", "value": 5000, "unit": "cm"}]}),
    (
        "decimal precision overflow",
        {"measurements": [{"key": "chest", "value": 1e30, "unit": "cm"}]},
    ),
    (
        "non-finite measurement",
        {"measurements": [{"key": "chest", "value": "Infinity", "unit": "cm"}]},
    ),
    ("inch unit", {"measurements": [{"key": "chest", "value": 30, "unit": "in"}]}),
    ("bad measurement key", {"measurements": [{"key": "chest size!", "value": 80, "unit": "cm"}]}),
    (
        "duplicate measurement",
        {
            "measurements": [
                {"key": "Chest", "value": 80, "unit": "cm"},
                {"key": "chest", "value": 81, "unit": "cm"},
            ]
        },
    ),
    (
        "reversed block",
        {
            "date_blocks": [
                {"start": "2026-12-05", "end": "2026-12-01", "reason": "owner-unavailable"}
            ]
        },
    ),
    (
        "overlapping blocks",
        {
            "date_blocks": [
                {"start": "2026-12-01", "end": "2026-12-05", "reason": "owner-unavailable"},
                {"start": "2026-12-05", "end": "2026-12-07", "reason": "owner-unavailable"},
            ]
        },
    ),
    (
        "bad block reason",
        {"date_blocks": [{"start": "2026-12-01", "end": "2026-12-02", "reason": "booked"}]},
    ),
    (
        "block timestamp",
        {
            "date_blocks": [
                {
                    "start": "2026-12-01T05:00:00Z",
                    "end": "2026-12-02",
                    "reason": "owner-unavailable",
                }
            ]
        },
    ),
    ("blank title", {"title": "   "}),
    ("long fabric", {"fabric": "x" * 121}),
    ("bad status", {"status": "approved"}),
    ("owner override", {"lender_profile_id": MISSING}),
    ("user override", {"user_id": MISSING}),
    ("inline image url", {"image_urls": ["https://evil.example/x.jpg"]}),
    ("unknown image", {"image_ids": [MISSING]}),
]


@pytest.mark.parametrize(
    "overrides", [case[1] for case in INVALID_WRITES], ids=[case[0] for case in INVALID_WRITES]
)
def test_invalid_writes_rejected_without_persisting(
    client: TestClient, engine: Engine, overrides: dict[str, Any]
) -> None:
    headers = enroll(client, "jules")
    response = client.post("/api/v1/lender/products", headers=headers, json=write_body(**overrides))
    assert response.status_code == 422, response.text
    assert error_code(response) == "validation_error"
    assert response.json()["error"]["details"]
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM products")).scalar() == 40


def test_availability_toggle_and_stale_version(client: TestClient) -> None:
    headers = enroll(client, "kai")
    created = create(client, headers)
    path = f"/api/v1/lender/products/{created['id']}"
    toggled = client.patch(
        path, headers=headers, json={"expected_version": 1, "is_available": False}
    )
    assert toggled.status_code == 200
    assert toggled.json()["is_available"] is False and toggled.json()["version"] == 2
    stale = client.patch(path, headers=headers, json={"expected_version": 1, "is_available": True})
    assert stale.status_code == 409 and error_code(stale) == "stale_version"
    assert stale.json()["error"]["details"] == [{"field": "expected_version", "current_version": 2}]
    assert client.get(path, headers=headers).json()["is_available"] is False


@pytest.mark.parametrize(
    "body",
    [
        {"expected_version": 1},
        {"is_available": True},
        {"expected_version": 0, "is_available": True},
        {
            "expected_version": 1,
            "data": {**write_body(), "is_available": True},
            "is_available": False,
        },
        {"expected_version": 1, "is_available": [True]},
        {"expected_version": 1, "is_available": True, "version": 5},
    ],
)
def test_malformed_patches_rejected(client: TestClient, body: dict[str, Any]) -> None:
    headers = enroll(client, "lee")
    created = create(client, headers)
    response = client.patch(f"/api/v1/lender/products/{created['id']}", headers=headers, json=body)
    assert response.status_code == 422 and error_code(response) == "validation_error"
    assert (
        client.get(f"/api/v1/lender/products/{created['id']}", headers=headers).json()["version"]
        == 1
    )


def test_full_data_update_replaces_allowlisted_fields(client: TestClient) -> None:
    headers = enroll(client, "mia")
    created = create(
        client,
        headers,
        image_ids=[MANIFEST["products"][7]["image"]["id"], MANIFEST["products"][8]["image"]["id"]],
    )
    assert len(created["images"]) == 2
    first, second = (image["id"] for image in created["images"])
    replacement = write_body(
        title="Updated title",
        color_ids=[COLORS["navy"]],
        measurements=[{"key": "waist", "value": 70, "unit": "cm"}],
        date_blocks=[],
        secondary_category_ids=[],
        image_ids=[second],
        status="published",
    )
    updated = client.patch(
        f"/api/v1/lender/products/{created['id']}",
        headers=headers,
        json={"expected_version": 1, "data": replacement},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["title"] == "Updated title" and body["version"] == 2
    assert body["slug"] == created["slug"]  # stable URL after title edits
    assert [c["slug"] for c in body["colors"]] == ["navy"]
    assert body["measurements"] == [{"key": "waist", "value": 70.0, "unit": "cm"}]
    assert body["date_blocks"] == [] and body["secondary_category_ids"] == []
    assert [i["id"] for i in body["images"]] == [second] and body["image"]["id"] == second
    assert body["images"][0]["sort_order"] == 0 and first != second
    assert body["status"] == "published" and body["created_at"] == created["created_at"]


def test_concurrent_edits_with_same_version_admit_exactly_one(
    make_client: Callable[..., TestClient],
) -> None:
    setup = make_client()
    headers = enroll(setup, "noor")
    created = create(setup, headers)
    path = f"/api/v1/lender/products/{created['id']}"
    barrier = threading.Barrier(4)
    statuses: list[int] = []

    def edit(value: bool) -> None:
        client = make_client()
        barrier.wait()
        response = client.patch(
            path, headers=headers, json={"expected_version": 1, "is_available": value}
        )
        statuses.append(response.status_code)

    threads = [threading.Thread(target=edit, args=(i % 2 == 0,)) for i in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(statuses) == [200, 409, 409, 409]
    assert setup.get(path, headers=headers).json()["version"] == 2


def test_cross_owner_access_is_non_enumerating_404(client: TestClient) -> None:
    owner = enroll(client, "olga")
    other = enroll(client, "pete")
    created = create(client, owner, status="draft")
    path = f"/api/v1/lender/products/{created['id']}"
    for method, kwargs in (
        ("GET", {}),
        ("PATCH", {"json": {"expected_version": 1, "is_available": False}}),
        ("DELETE", {"params": {"expected_version": 1}}),
    ):
        response = client.request(method, path, headers=other, **kwargs)
        assert response.status_code == 404 and error_code(response) == "not_found", method
    seed = client.patch(
        f"/api/v1/lender/products/{SEED_PRODUCT['id']}",
        headers=other,
        json={"expected_version": 1, "is_available": False},
    )
    assert seed.status_code == 404
    assert client.get("/api/v1/lender/products", headers=other).json()["total"] == 0
    unchanged = client.get(path, headers=owner).json()
    assert unchanged["version"] == 1 and unchanged["is_available"] is True
    renter = auth("renter-only")
    client.post("/api/v1/me/bootstrap", headers=renter)
    denied = client.get(path, headers=renter)
    assert denied.status_code == 403 and error_code(denied) == "lender_required"


def test_archive_preserves_history_and_hides_publicly(client: TestClient) -> None:
    headers = enroll(client, "quinn")
    created = create(client, headers, status="published")
    path = f"/api/v1/lender/products/{created['id']}"
    missing_version = client.delete(path, headers=headers)
    assert missing_version.status_code == 422
    archived = client.delete(path, headers=headers, params={"expected_version": 1})
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived" and archived.json()["version"] == 2
    again = client.delete(path, headers=headers, params={"expected_version": 2})
    assert again.status_code == 200 and again.json()["version"] == 2
    stale = client.delete(path, headers=headers, params={"expected_version": 1})
    assert stale.status_code == 409 and error_code(stale) == "stale_version"
    assert client.get(f"/api/v1/catalog/products/{created['slug']}").status_code == 404
    owned = client.get("/api/v1/lender/products", headers=headers).json()
    assert owned["items"][0]["status"] == "archived"


def test_unknown_and_malformed_ids(client: TestClient) -> None:
    headers = enroll(client, "rae")
    assert client.get(f"/api/v1/lender/products/{MISSING}", headers=headers).status_code == 404
    malformed = client.get("/api/v1/lender/products/not-a-uuid", headers=headers)
    assert malformed.status_code == 422 and error_code(malformed) == "validation_error"


def test_seed_lender_can_edit_seed_listing_in_demo(client: TestClient) -> None:
    path = f"/api/v1/lender/products/{SEED_PRODUCT['id']}"
    response = client.patch(
        path, headers=SEED_LENDER, json={"expected_version": 1, "is_available": False}
    )
    assert response.status_code == 200 and response.json()["version"] == 2
    public = client.get(f"/api/v1/catalog/products/{SEED_PRODUCT['slug']}").json()
    assert public["is_available"] is False and public["version"] == 2


def test_owner_list_pagination_and_search(client: TestClient) -> None:
    page = client.get(
        "/api/v1/lender/products", headers=SEED_LENDER, params={"page": 2, "page_size": 15}
    ).json()
    assert page["total"] == 40 and len(page["items"]) == 15
    found = client.get(
        "/api/v1/lender/products", headers=SEED_LENDER, params={"q": "SAREES"}
    ).json()
    assert found["total"] == 1 and "Sarees" in found["items"][0]["title"]
    literal = client.get("/api/v1/lender/products", headers=SEED_LENDER, params={"q": "%"}).json()
    assert literal["total"] == 0
