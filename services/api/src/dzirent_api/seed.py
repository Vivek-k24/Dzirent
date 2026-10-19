"""Idempotent deterministic demo seed from fixtures/catalog. Disposable databases only.

Upserts stable IDs and restores seed-owned rows to their canonical values. Rows created by other
users are never modified or deleted. Production is always refused.

Usage: python -m dzirent_api.seed [--disposable-staging]
"""

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

from sqlalchemy import delete, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from . import orm
from .db import create_db_engine, session_factory
from .reference import FIXTURE_NAMESPACE
from .settings import Settings

FIXTURES = Path(__file__).resolve().parents[4] / "fixtures/catalog"
SEED_SUBJECT = "sample-lender"


class SeedRefused(RuntimeError):
    pass


@dataclass(frozen=True)
class SeedResult:
    roots: int
    subcategories: int
    products: int
    lenders: int
    studios: int


def check_allowed(settings: Settings, *, disposable_staging: bool = False) -> None:
    if settings.environment in {"local", "test"}:
        return
    if settings.environment == "staging" and disposable_staging:
        return
    raise SeedRefused(
        f"Seeding is restricted to disposable local/test databases (environment={settings.environment})"
    )


def load_fixtures() -> tuple[dict[str, Any], dict[str, Any]]:
    taxonomy = json.loads((FIXTURES / "taxonomy.json").read_text(encoding="utf-8"))
    manifest = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
    return taxonomy, manifest


def upsert(session: Session, model: Any, rows: list[dict[str, Any]], key: str = "id") -> None:
    if not rows:
        return
    statement = pg_insert(model).values(rows)
    updates = {name: statement.excluded[name] for name in rows[0] if name != key}
    session.execute(statement.on_conflict_do_update(index_elements=[key], set_=updates))


def seed(session: Session) -> SeedResult:
    taxonomy, manifest = load_fixtures()
    metros = taxonomy["locations"]["items"]
    upsert(
        session,
        orm.Metro,
        [
            {
                "id": UUID(m["id"]),
                "slug": m["slug"],
                "label": m["label"],
                "region": m["region"],
                "country_code": m["country_code"],
                "sort_order": index,
                "active": True,
            }
            for index, m in enumerate(metros)
        ],
    )
    upsert(
        session,
        orm.MetroPostalCode,
        [
            {"postal_code": code, "metro_id": UUID(metro_id)}
            for code, metro_id in taxonomy["locations"]["demo_zip_map"].items()
        ],
        key="postal_code",
    )
    roots = taxonomy["categories"]["items"]
    upsert(session, orm.Category, [_category(root) for root in roots])
    upsert(session, orm.Category, [_category(c) for root in roots for c in root["children"]])

    facets = taxonomy["facets"]
    upsert(
        session,
        orm.Brand,
        [
            {"id": UUID(b["id"]), "normalized_name": b["slug"], "display_name": b["label"]}
            for b in facets["brands"]
        ],
    )
    upsert(
        session,
        orm.Color,
        [
            {
                "id": UUID(c["id"]),
                "slug": c["slug"],
                "name": c["label"],
                "swatch_hex": c["swatch_hex"],
            }
            for c in facets["colors"]
        ],
    )
    upsert(
        session,
        orm.Size,
        [
            {"id": UUID(s["id"]), "sizing_system": s["sizing_system"], "label": s["label"]}
            for s in facets["sizes"]
        ],
    )

    profile = manifest["sample_profiles"]["lender"]
    lender = manifest["seed_lender"]
    stamp = datetime.fromisoformat(profile["created_at"])
    user_id = UUID(manifest["seed_user_id"])
    upsert(
        session,
        orm.User,
        [
            {
                "id": user_id,
                "auth_provider": "mock",
                "auth_subject": SEED_SUBJECT,
                "display_name": profile["display_name"],
                "email": profile["email"],
                "status": "active",
                "created_at": stamp,
                "updated_at": stamp,
            }
        ],
    )
    session.execute(
        pg_insert(orm.UserRole)
        .values([{"user_id": user_id, "role": role} for role in profile["roles"]])
        .on_conflict_do_nothing()
    )
    upsert(
        session,
        orm.LenderProfile,
        [
            {
                "id": UUID(lender["id"]),
                "user_id": user_id,
                "display_name": lender["display_name"],
                "metro_id": UUID(lender["metro_id"]),
                "status": lender["status"],
                "created_at": stamp,
                "updated_at": stamp,
            }
        ],
    )

    studio = manifest["seed_studio"]
    upsert(
        session,
        orm.Studio,
        [
            {
                "id": UUID(studio["id"]),
                "lender_profile_id": UUID(lender["id"]),
                "handle": studio["handle"],
                "display_name": studio["display_name"],
                "bio": studio["bio"],
                "is_public": studio["is_public"],
                "version": studio["version"],
                "created_at": datetime.fromisoformat(studio["created_at"]),
                "updated_at": datetime.fromisoformat(studio["updated_at"]),
            }
        ],
    )

    products = manifest["products"]
    upsert(session, orm.Product, [_product(p) for p in products])
    ids = [UUID(p["id"]) for p in products]
    for child in (
        orm.ProductCategory,
        orm.ProductColor,
        orm.ProductMeasurement,
        orm.ProductImage,
        orm.ProductUnavailability,
    ):
        session.execute(delete(child).where(child.product_id.in_(ids)))
    _insert(
        session,
        orm.ProductCategory,
        [
            {"product_id": UUID(p["id"]), "category_id": UUID(c), "position": i}
            for p in products
            for i, c in enumerate(p["secondary_category_ids"])
        ],
    )
    _insert(
        session,
        orm.ProductColor,
        [
            {"product_id": UUID(p["id"]), "color_id": UUID(c["id"]), "position": i}
            for p in products
            for i, c in enumerate(p["colors"])
        ],
    )
    _insert(
        session,
        orm.ProductMeasurement,
        [
            {
                "id": _child_id(p, f"measurement:{m['key']}"),
                "product_id": UUID(p["id"]),
                "measurement_key": m["key"],
                "value_decimal": Decimal(str(m["value"])),
                "unit": m["unit"],
                "position": i,
            }
            for p in products
            for i, m in enumerate(p["measurements"])
        ],
    )
    _insert(
        session,
        orm.ProductImage,
        [
            {
                "id": UUID(img["id"]),
                "product_id": UUID(p["id"]),
                "fixture_url": img["url"],
                "object_key": None,
                "alt_text": img["alt_text"],
                "sort_order": img["sort_order"],
                "width": img["width"],
                "height": img["height"],
                "media_status": img["media_status"],
                "created_at": datetime.fromisoformat(p["created_at"]),
            }
            for p in products
            for img in p["images"]
        ],
    )
    _insert(
        session,
        orm.ProductUnavailability,
        [
            {
                "id": _child_id(p, f"block:{b['start']}:{b['end']}"),
                "product_id": UUID(p["id"]),
                "start_date": b["start"],
                "end_date": b["end"],
                "reason": b["reason"],
            }
            for p in products
            for b in p["date_blocks"]
        ],
    )
    session.flush()
    return SeedResult(
        roots=len(roots),
        subcategories=sum(len(root["children"]) for root in roots),
        products=len(products),
        lenders=1,
        studios=1,
    )


def _category(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": UUID(row["id"]),
        "slug": row["slug"],
        "name": row["label"],
        "parent_id": UUID(row["parent_id"]) if row["parent_id"] else None,
        "sort_order": row["sort_order"],
        "active": True,
    }


def _product(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": UUID(p["id"]),
        "slug": p["slug"],
        "lender_profile_id": UUID(p["lender_profile_id"]),
        "primary_category_id": UUID(p["primary_category_id"]),
        "brand_id": UUID(p["brand"]["id"]),
        "size_id": UUID(p["size"]["id"]),
        "metro_id": UUID(p["metro"]["id"]),
        "title": p["title"],
        "description": p["description"],
        "garment_type": p["garment_type"],
        "audience": p["audience"],
        "fabric": p["fabric"],
        "occasion": p["occasion"],
        "stretch": p["stretch"],
        "alterations": p["alterations"],
        "known_wear": p["known_wear"],
        "band": p["band"],
        "rental_price_minor": p["rental_price_minor"],
        "retail_price_minor": p["retail_price_minor"],
        "currency": p["currency"],
        "featured_rank": p["featured_rank"],
        "sample_rating": Decimal(str(p["sample_rating"]))
        if p["sample_rating"] is not None
        else None,
        "sample_rating_count": p["sample_rating_count"],
        "status": p["status"],
        "is_available": p["is_available"],
        "version": p["version"],
        "created_at": datetime.fromisoformat(p["created_at"]),
        "updated_at": datetime.fromisoformat(p["updated_at"]),
    }


def _child_id(product: dict[str, Any], key: str) -> UUID:
    return uuid5(FIXTURE_NAMESPACE, f"dzirent:v1:product:{product['id']}:{key}")


def _insert(session: Session, model: Any, rows: list[dict[str, Any]]) -> None:
    if rows:
        session.execute(insert(model).values(rows))


def main(argv: list[str]) -> int:
    settings = Settings()
    try:
        check_allowed(settings, disposable_staging="--disposable-staging" in argv)
    except SeedRefused as exc:
        print(f"Refused: {exc}", file=sys.stderr)
        return 2
    engine = create_db_engine(settings)
    if engine is None:
        print("Refused: DZIRENT_DATABASE_URL is not set", file=sys.stderr)
        return 2
    try:
        with session_factory(engine)() as session, session.begin():
            existing = session.scalar(select(orm.Product.id).limit(1))
            result = seed(session)
    finally:
        engine.dispose()
    action = "Restored" if existing else "Seeded"
    print(
        f"{action} {result.roots} roots, {result.subcategories} subcategories, "
        f"{result.products} garments, {result.lenders} seed lender and {result.studios} Studio"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
