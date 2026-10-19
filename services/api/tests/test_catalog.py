"""Public catalog behavior against PostgreSQL, cross-checked with a reference over the fixtures."""

from datetime import date, datetime
from typing import Any

import pytest
from conftest import EXAMPLES, MANIFEST, SEED_LENDER, TAXONOMY, error_code
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

PRODUCTS = MANIFEST["products"]
ROOTS = {root["slug"]: root for root in TAXONOMY["categories"]["items"]}
LEAVES = {leaf["slug"]: leaf for root in ROOTS.values() for leaf in root["children"]}
BRANDS = TAXONOMY["facets"]["brands"]
SIZES = TAXONOMY["facets"]["sizes"]
METROS = {metro["slug"]: metro for metro in TAXONOMY["locations"]["items"]}
DATETIME_FIELDS = {"created_at", "updated_at"}


def normalize(value: Any) -> Any:
    # Compare instants rather than ISO spellings (+00:00 versus Z).
    if isinstance(value, dict):
        return {
            k: datetime.fromisoformat(v.replace("Z", "+00:00"))
            if k in DATETIME_FIELDS and isinstance(v, str)
            else normalize(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value


def members(root_slugs: list[str]) -> set[str]:
    ids = set()
    for slug in root_slugs:
        ids.add(ROOTS[slug]["id"])
        ids |= {child["id"] for child in ROOTS[slug]["children"]}
    return ids


def in_categories(product: dict[str, Any], category_ids: set[str]) -> bool:
    return product["primary_category_id"] in category_ids or bool(
        category_ids & set(product["secondary_category_ids"])
    )


def overlaps(product: dict[str, Any], start: date, end: date) -> bool:
    return any(
        date.fromisoformat(b["start"]) <= end and date.fromisoformat(b["end"]) >= start
        for b in product["date_blocks"]
    )


def reference(**query: Any) -> list[str]:
    """Independent restatement of contracts/README.md catalog semantics."""
    items = list(PRODUCTS)
    if query.get("subcategory"):
        items = [p for p in items if in_categories(p, {LEAVES[query["subcategory"]]["id"]})]
    elif query.get("category"):
        items = [p for p in items if in_categories(p, members(query["category"]))]
    elif query.get("collection"):
        items = [p for p in items if in_categories(p, members([query["collection"]]))]
    if q := query.get("q"):
        q = q.lower()
        items = [
            p
            for p in items
            if q in p["title"].lower()
            or q in p["description"].lower()
            or q in p["brand"]["label"].lower()
        ]
    if query.get("brand"):
        items = [p for p in items if p["brand"]["id"] in query["brand"]]
    if query.get("color"):
        items = [p for p in items if {c["slug"] for c in p["colors"]} & set(query["color"])]
    if query.get("band"):
        items = [p for p in items if p["band"] in query["band"]]
    if query.get("size"):
        items = [p for p in items if p["size"]["id"] in query["size"]]
    if query.get("metro"):
        items = [p for p in items if p["metro"]["slug"] == query["metro"]]
    if query.get("start"):
        start, end = date.fromisoformat(query["start"]), date.fromisoformat(query["end"])
        items = [p for p in items if p["is_available"] and not overlaps(p, start, end)]
    sort = query.get("sort", "featured")
    if sort == "price_asc":
        items.sort(key=lambda p: (p["rental_price_minor"], p["id"]))
    elif sort == "price_desc":
        items.sort(key=lambda p: (-p["rental_price_minor"], p["id"]))
    elif sort == "newest":
        items.sort(key=lambda p: p["id"])
        items.sort(key=lambda p: datetime.fromisoformat(p["created_at"]), reverse=True)
    elif sort == "top_rated":
        items.sort(key=lambda p: (p["sample_rating"] is None, -(p["sample_rating"] or 0), p["id"]))
    else:
        items.sort(key=lambda p: (p["featured_rank"], p["id"]))
    return [p["id"] for p in items]


QUERIES: list[dict[str, Any]] = [
    {},
    {"collection": "designer"},
    {"collection": "women"},
    {"category": ["women", "designer"]},
    {"collection": "men", "category": ["bridal"]},
    {"collection": "women", "subcategory": "women-dresses"},
    {"category": ["women", "designer"], "subcategory": "designer-gowns"},
    {"q": "GOWNS"},
    {"q": "sample studio 3"},
    {"q": "fictional sample"},
    {"brand": [BRANDS[0]["id"], BRANDS[3]["id"]]},
    {"color": ["black", "gold"], "band": ["A", "D"]},
    {"size": [SIZES[0]["id"], SIZES[5]["id"]], "collection": "suits-tuxedos"},
    {"metro": "houston"},
    {"start": "2026-11-02", "end": "2026-11-05"},
    {"start": "2026-11-08", "end": "2026-11-11"},
    {"start": "2026-11-09", "end": "2026-11-12", "band": ["B"]},
    {"sort": "price_asc"},
    {"sort": "price_desc", "collection": "bridal"},
    {"sort": "newest"},
    {"sort": "top_rated"},
    {"q": "dress", "color": ["red", "navy", "ivory"], "sort": "top_rated"},
]


@pytest.mark.parametrize(
    "query", QUERIES, ids=lambda q: "&".join(f"{k}={v}" for k, v in q.items()) or "default"
)
def test_filters_and_sorts_match_reference(client: TestClient, query: dict[str, Any]) -> None:
    response = client.get("/api/v1/catalog/products", params={**query, "page_size": 100})
    assert response.status_code == 200, response.text
    body = response.json()
    expected = reference(**query)
    assert [item["id"] for item in body["items"]] == expected
    assert body["total"] == len(expected)
    assert len({item["id"] for item in body["items"]}) == len(body["items"])


def test_default_listing_equals_canonical_example(client: TestClient) -> None:
    example = EXAMPLES["listCatalogProducts"]
    response = client.get("/api/v1/catalog/products", params="page=1&page_size=40&sort=featured")
    assert response.status_code == 200
    assert normalize(response.json()) == normalize(example["response"]["body"])


def test_counts_are_deduplicated_and_scoped(client: TestClient) -> None:
    body = client.get("/api/v1/catalog/products", params={"collection": "designer"}).json()
    # Five primary garments plus two secondary memberships, each counted once.
    assert body["collection_total"] == body["total"] == 7
    assert body["available_total"] == sum(
        1 for p in PRODUCTS if p["id"] in {i["id"] for i in body["items"]} and p["is_available"]
    )
    narrowed = client.get(
        "/api/v1/catalog/products", params={"collection": "designer", "band": "A"}
    ).json()
    assert narrowed["collection_total"] == 7
    assert narrowed["total"] == len(reference(collection="designer", band=["A"]))


def test_unavailable_items_visible_without_dates_but_excluded_with_dates(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/catalog/products", params={"page_size": 100}).json()
    unavailable = [p["id"] for p in PRODUCTS if not p["is_available"]]
    assert unavailable and set(unavailable) <= {item["id"] for item in body["items"]}
    assert body["available_total"] == len(PRODUCTS) - len(unavailable)
    dated = client.get(
        "/api/v1/catalog/products", params={"start": "2026-11-02", "end": "2026-11-05"}
    ).json()
    assert not set(unavailable) & {item["id"] for item in dated["items"]}
    assert dated["available_total"] == dated["total"]


def test_touching_block_endpoint_overlaps(client: TestClient) -> None:
    blocked = {p["id"] for p in PRODUCTS if p["date_blocks"]}
    body = client.get(
        "/api/v1/catalog/products",
        params={"start": "2026-11-08", "end": "2026-11-11", "page_size": 100},
    ).json()
    assert not blocked & {item["id"] for item in body["items"]}


def test_pagination_filters_before_paging(client: TestClient) -> None:
    pages = [
        client.get("/api/v1/catalog/products", params={"page": n, "page_size": 15}).json()
        for n in (1, 2, 3, 4)
    ]
    ids = [item["id"] for page in pages for item in page["items"]]
    assert ids == reference()
    assert [len(page["items"]) for page in pages] == [15, 15, 10, 0]
    assert all(page["total"] == 40 and page["page_size"] == 15 for page in pages)


@pytest.mark.parametrize(
    "params",
    [
        {"page_size": 101},
        {"page": 0},
        {"sort": "cheapest"},
        {"collection": "unknown"},
        {"category": "nope"},
        {"subcategory": "unknown"},
        {"collection": "men", "subcategory": "women-dresses"},
        {"brand": "00000000-0000-0000-0000-000000000000"},
        {"brand": "not-a-uuid"},
        {"color": "plaid"},
        {"band": "E"},
        {"metro": "atlantis"},
        {"zip": "7870"},
        {"zip": "78701", "metro": "houston"},
        {"start": "2026-11-02"},
        {"start": "2026-11-02", "end": "2026-11-04"},
        {"start": "2026-11-05", "end": "2026-11-02"},
        {"start": "2026-02-30", "end": "2026-03-05"},
        {"start": "11/02/2026", "end": "11/05/2026"},
        {"q": "x" * 201},
    ],
)
def test_invalid_queries_are_rejected(client: TestClient, params: dict[str, Any]) -> None:
    response = client.get("/api/v1/catalog/products", params=params)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert response.json()["error"]["details"]


def test_zip_resolves_metro_and_unmapped_zip_uses_other_texas(client: TestClient) -> None:
    austin = client.get("/api/v1/catalog/products", params={"zip": "78701", "page_size": 100})
    assert [i["id"] for i in austin.json()["items"]] == reference(metro="austin")
    both = client.get("/api/v1/catalog/products", params={"zip": "78701", "metro": "austin"})
    assert both.json()["total"] == len(reference(metro="austin"))
    other = client.get("/api/v1/catalog/products", params={"zip": "10001", "page_size": 100})
    assert [i["id"] for i in other.json()["items"]] == reference(metro="other-texas")


@pytest.mark.parametrize("q", ["%", "_", "\\", "'; DROP TABLE products; --", "%' OR '1'='1"])
def test_search_text_is_literal_and_safe(client: TestClient, engine: Engine, q: str) -> None:
    response = client.get("/api/v1/catalog/products", params={"q": q})
    assert response.status_code == 200
    assert response.json()["total"] == 0
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM products")).scalar() == 40


def test_category_tree_equals_canonical_example(client: TestClient) -> None:
    response = client.get("/api/v1/catalog/categories")
    assert response.status_code == 200
    assert response.json() == EXAMPLES["getCategoryTree"]["response"]["body"]
    designer = next(i for i in response.json()["items"] if i["slug"] == "designer")
    assert designer["product_count"] == 7
    assert sum(len(i["children"]) for i in response.json()["items"]) == 40


def test_facets_equal_canonical_example_and_scope_by_category(client: TestClient) -> None:
    response = client.get("/api/v1/catalog/facets")
    assert response.status_code == 200
    assert response.json() == EXAMPLES["getCatalogFacets"]["response"]["body"]
    men = client.get("/api/v1/catalog/facets", params={"category": "men"}).json()
    men_products = [p for p in PRODUCTS if in_categories(p, members(["men"]))]
    assert {s["id"] for s in men["sizes"]} == {p["size"]["id"] for p in men_products}
    assert men["fabrics"] == sorted({p["fabric"] for p in men_products})
    assert [b["id"] for b in men["bands"]] == ["A", "B", "C", "D"]
    bad = client.get("/api/v1/catalog/facets", params={"category": "unknown"})
    assert bad.status_code == 422 and error_code(bad) == "validation_error"


def test_metros_equal_canonical_example(client: TestClient) -> None:
    response = client.get("/api/v1/locations/metros")
    assert response.status_code == 200
    assert response.json() == EXAMPLES["getMetros"]["response"]["body"]


def test_product_detail_equals_example_and_unknown_slug_is_404(client: TestClient) -> None:
    example = EXAMPLES["getCatalogProduct"]
    response = client.get(example["request"]["path"])
    assert response.status_code == 200
    assert normalize(response.json()) == normalize(example["response"]["body"])
    missing = client.get("/api/v1/catalog/products/not-a-real-garment")
    assert missing.status_code == 404 and error_code(missing) == "not_found"


def test_drafts_archived_and_inactive_lenders_are_not_public(
    client: TestClient, engine: Engine
) -> None:
    draft, archived = PRODUCTS[0], PRODUCTS[1]
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE products SET status = 'draft' WHERE id = :id"), {"id": draft["id"]}
        )
        connection.execute(
            text("UPDATE products SET status = 'archived' WHERE id = :id"), {"id": archived["id"]}
        )
    body = client.get("/api/v1/catalog/products", params={"page_size": 100}).json()
    assert body["total"] == body["collection_total"] == 38
    for product in (draft, archived):
        assert client.get(f"/api/v1/catalog/products/{product['slug']}").status_code == 404
    tree = client.get("/api/v1/catalog/categories").json()
    assert sum(root["product_count"] for root in tree["items"]) == 38 + 1  # one Designer secondary
    # Deactivating the seed account hides every listing it owns.
    assert client.delete("/api/v1/me", headers=SEED_LENDER).status_code == 200
    assert client.get("/api/v1/catalog/products").json()["total"] == 0
