"""Integrator checks of the handoff artifacts; not independent Phase 1 acceptance."""

import json
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs
from uuid import UUID

from jsonschema import Draft202012Validator, FormatChecker

from dzirent_api.models import (
    CategoryTree,
    CurrentUser,
    Error,
    Facets,
    LenderProfile,
    MetroList,
    ProductDetail,
    ProductWrite,
)

ROOT = Path(__file__).resolve().parents[1]


def read(name: str) -> dict:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


manifest = read("fixtures/catalog/manifest.json")
taxonomy = read("fixtures/catalog/taxonomy.json")
examples = read("fixtures/catalog/examples.json")
contract = read("contracts/openapi.json")
version = contract["info"]["version"]
assert all(doc["contract_version"] == version for doc in [manifest, taxonomy, examples])
CategoryTree.model_validate(taxonomy["categories"])
Facets.model_validate(taxonomy["facets"])
MetroList.model_validate(taxonomy["locations"])
LenderProfile.model_validate(manifest["seed_lender"])
for profile in manifest["sample_profiles"].values():
    CurrentUser.model_validate(profile)
assert (ROOT / "CODEOWNERS").read_bytes() == (ROOT / ".github/CODEOWNERS").read_bytes()
roots = taxonomy["categories"]["items"]
products = manifest["products"]
assert len(roots) == 8 and all(len(root["children"]) == 5 for root in roots)
leaves = {leaf["id"]: root["id"] for root in roots for leaf in root["children"]}
assert len(leaves) == 40
assert len(products) == len({p["id"] for p in products}) == len({p["slug"] for p in products}) == 40
assert set(Counter(p["primary_collection_id"] for p in products).values()) == {5}
assert set(Counter(p["primary_category_id"] for p in products).values()) == {1}
assert {p["lender_profile_id"] for p in products} == {manifest["seed_lender"]["id"]}
references = taxonomy["facets"]
for raw in products:
    product = ProductDetail.model_validate(raw)
    assert leaves[raw["primary_category_id"]] == raw["primary_collection_id"]
    assert raw["brand"] in references["brands"] and raw["size"] in references["sizes"]
    assert raw["metro"] in taxonomy["locations"]["items"]
    assert all(color in references["colors"] for color in raw["colors"])
    assert set(raw["secondary_category_ids"]) <= set(leaves) | {r["id"] for r in roots}
    band = next(b for b in references["bands"] if b["id"] == raw["band"])
    assert band["min_minor"] <= product.rental_price_minor
    assert (
        band["max_minor_exclusive"] is None
        or product.rental_price_minor < band["max_minor_exclusive"]
    )
    for block in product.date_blocks:
        assert block.end >= block.start
    assert raw["image"] == raw["images"][0]
    assert all(img.width * 4 == img.height * 3 for img in product.images)
for root in roots:
    ids = {
        p["id"]
        for p in products
        if p["primary_collection_id"] == root["id"]
        or root["id"] in p["secondary_category_ids"]
        or any(c["id"] in p["secondary_category_ids"] for c in root["children"])
    }
    assert root["product_count"] == len(ids)
assert {p["band"] for p in products} == {"A", "B", "C", "D"}
assert {p["is_available"] for p in products} == {True, False}
assert any(p["sample_rating"] is None for p in products) and any(p["date_blocks"] for p in products)
assert (
    date.fromisoformat(manifest["demo_end_date"]) - date.fromisoformat(manifest["demo_start_date"])
).days == 3
operations = {
    op["operationId"]: (path, method, op)
    for path, methods in contract["paths"].items()
    for method, op in methods.items()
    if method in {"get", "post", "put", "patch", "delete"}
}
assert (
    len(operations) == len(examples["cases"]) == len({e["operation_id"] for e in examples["cases"]})
)


def validate(schema: dict, value: object) -> None:
    # Resolve local refs against the entire generated document, not a detached schema.
    Draft202012Validator({**contract, **schema}, format_checker=FormatChecker()).validate(value)


for example in examples["cases"]:
    template, method, op = operations[example["operation_id"]]
    request = example["request"]
    assert request["method"].lower() == method
    assert len(template.split("/")) == len(request["path"].split("/"))
    for expected, actual in zip(template.split("/"), request["path"].split("/"), strict=True):
        if expected == "{id}":
            UUID(actual)
        elif not expected.startswith("{"):
            assert expected == actual
    query = parse_qs(request["query"])
    params = op.get("parameters", [])
    assert set(query) <= {p["name"] for p in params if p["in"] == "query"}
    if "requestBody" in op:
        validate(op["requestBody"]["content"][request.get("content_type", "application/json")]["schema"], request["body"])
    else:
        assert request["body"] is None
    response = example["response"]
    validate(
        op["responses"][str(response["status"])]["content"]["application/json"]["schema"],
        response["body"],
    )
    if template.startswith(("/api/v1/me", "/api/v1/lender")):
        assert op.get("security"), f"Protected operation lacks security: {op['operationId']}"
for case in examples["errors"]:
    Error.model_validate(case["body"])
for example in examples["cases"]:
    if example["operation_id"] == "createLenderProduct":
        ProductWrite.model_validate(example["request"]["body"])
    if example["operation_id"] in {"getMe", "deactivateMe", "updateMe", "bootstrapMe"}:
        CurrentUser.model_validate(example["response"]["body"])
subprocess.run([sys.executable, str(ROOT / "fixtures/catalog/generate.py"), "--check"], check=True)
print(
    f"PASS: {len(roots)} roots, {len(leaves)} leaves, {len(products)} garments; {len(operations)} operations with schema-valid request/response examples; deterministic regeneration"
)
