"""ORM rows to frozen contract wire models."""

from typing import Any

from sqlalchemy.orm import selectinload
from sqlalchemy.orm.interfaces import LoaderOption

from . import models as wire
from . import orm
from .reference import PLACEHOLDER_URL, placeholder_image_id

ROLE_ORDER = {"renter": 0, "lender": 1}

PRODUCT_LOAD: list[LoaderOption] = [
    selectinload(orm.Product.brand),
    selectinload(orm.Product.size),
    selectinload(orm.Product.metro),
    selectinload(orm.Product.primary_category),
    selectinload(orm.Product.secondary_categories),
    selectinload(orm.Product.colors).selectinload(orm.ProductColor.color),
    selectinload(orm.Product.images),
    selectinload(orm.Product.measurements),
    selectinload(orm.Product.date_blocks),
]


def lender_profile(profile: orm.LenderProfile) -> wire.LenderProfile:
    return wire.LenderProfile(
        id=profile.id,
        display_name=profile.display_name,
        metro_id=profile.metro_id,
        status=profile.status,  # type: ignore[arg-type]
    )


def current_user(user: orm.User) -> wire.CurrentUser:
    roles = sorted((r.role for r in user.roles), key=lambda role: ROLE_ORDER.get(role, 99))
    return wire.CurrentUser(
        id=user.id,
        display_name=user.display_name,
        email=user.email,
        roles=roles,  # type: ignore[arg-type]
        status=user.status,  # type: ignore[arg-type]
        lender_profile=lender_profile(user.lender_profile) if user.lender_profile else None,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def metro(row: orm.Metro) -> wire.Metro:
    return wire.Metro(id=row.id, slug=row.slug, label=row.label)


def brand(row: orm.Brand) -> wire.Reference:
    return wire.Reference(id=row.id, slug=row.normalized_name, label=row.display_name)


def color(row: orm.Color) -> wire.Color:
    return wire.Color(id=row.id, slug=row.slug, label=row.name, swatch_hex=row.swatch_hex)


def size(row: orm.Size) -> wire.Size:
    return wire.Size(id=row.id, sizing_system=row.sizing_system, label=row.label)  # type: ignore[arg-type]


def image(row: orm.ProductImage) -> wire.ProductImage:
    # Object-key media needs the connected media milestone's trusted CDN base; until then only
    # allowlisted local fixture paths are ever stored or returned.
    return wire.ProductImage(
        id=row.id,
        url=row.fixture_url or "",
        alt_text=row.alt_text,
        width=row.width,
        height=row.height,
        sort_order=row.sort_order,
        media_status=row.media_status,  # type: ignore[arg-type]
    )


def placeholder(product: orm.Product) -> wire.ProductImage:
    return wire.ProductImage(
        id=placeholder_image_id(product.id),
        url=PLACEHOLDER_URL,
        alt_text=f"{product.brand.display_name} {product.title} — placeholder image",
        width=900,
        height=1200,
        sort_order=0,
        media_status="fixture",
    )


def _card_fields(product: orm.Product) -> dict[str, Any]:
    images = [image(row) for row in product.images]
    return {
        "id": product.id,
        "slug": product.slug,
        "title": product.title,
        "brand": brand(product.brand),
        "primary_collection_id": product.primary_category.parent_id,
        "primary_category_id": product.primary_category_id,
        "secondary_category_ids": [row.category_id for row in product.secondary_categories],
        "size": size(product.size),
        "colors": [color(row.color) for row in product.colors],
        "metro": metro(product.metro),
        "band": product.band,
        "rental_price_minor": product.rental_price_minor,
        "retail_price_minor": product.retail_price_minor,
        "currency": product.currency,
        "sample_rating": float(product.sample_rating)
        if product.sample_rating is not None
        else None,
        "sample_rating_count": product.sample_rating_count,
        "featured_rank": product.featured_rank,
        "status": product.status,
        "is_available": product.is_available,
        "image": images[0] if images else placeholder(product),
        "version": product.version,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


def product_card(product: orm.Product) -> wire.ProductCard:
    return wire.ProductCard(**_card_fields(product))


def product_detail(product: orm.Product) -> wire.ProductDetail:
    return wire.ProductDetail(
        **_card_fields(product),
        lender_profile_id=product.lender_profile_id,
        description=product.description,
        garment_type=product.garment_type,
        audience=product.audience,  # type: ignore[arg-type]
        fabric=product.fabric,
        occasion=product.occasion,
        stretch=product.stretch,
        alterations=product.alterations,
        known_wear=product.known_wear,
        measurements=[
            wire.Measurement(key=row.measurement_key, value=float(row.value_decimal), unit="cm")
            for row in product.measurements
        ],
        images=[image(row) for row in product.images],
        date_blocks=[
            wire.DateBlock(start=row.start_date, end=row.end_date, reason=row.reason)  # type: ignore[arg-type]
            for row in product.date_blocks
        ],
    )
