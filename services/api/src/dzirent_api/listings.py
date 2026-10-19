"""Owner-scoped listings. Ownership comes from the verified subject's stored lender profile."""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as wire
from . import orm, serializers
from .db import get_session
from .errors import ApiError, Detail, field_error, invalid, not_found
from .identity import bearer
from .profiles import current_lender
from .reference import MAX_MINOR_UNITS, band_contains
from .settings import Settings
from .validation import clean_text

router = APIRouter(prefix="/api/v1", dependencies=[Depends(bearer)])
MEASUREMENT_KEY = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
MAX_MEASUREMENT_CM = Decimal("1000")
MAX_SECONDARY = 8
MAX_MEASUREMENTS = 20
MAX_BLOCKS = 50
MAX_IMAGES = 12
TEXT_LIMITS = {
    "title": 160,
    "garment_type": 120,
    "fabric": 120,
    "occasion": 120,
    "stretch": 120,
    "alterations": 500,
    "known_wear": 500,
}
EARLIEST_BLOCK = date(2000, 1, 1)
LATEST_BLOCK = date(2100, 12, 31)


@dataclass
class ValidWrite:
    text: dict[str, str]
    description: str
    measurements: list[tuple[str, Decimal]]
    blocks: list[wire.DateBlock]
    image_sources: list[UUID]


def settings_of(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def fixture_images_allowed(settings: Settings) -> bool:
    # Allowlisted public fixture media can be reused only in explicit local/test demo settings.
    return settings.mock_identity_allowed


def _exists(session: Session, model: Any, ids: set[UUID]) -> set[UUID]:
    if not ids:
        return set()
    return set(session.scalars(select(model.id).where(model.id.in_(ids))))


def validate_write(
    session: Session,
    body: wire.ProductWrite,
    settings: Settings,
    product: orm.Product | None,
) -> ValidWrite:
    errors: list[Detail] = []
    text = {
        name: clean_text(getattr(body, name), f"body.data.{name}", limit, errors)
        for name, limit in TEXT_LIMITS.items()
    }
    description = clean_text(
        body.description, "body.data.description", 5000, errors, multiline=True
    )

    primary = session.get(orm.Category, body.primary_category_id)
    if primary is None or not primary.active:
        errors.append(
            field_error("body.data.primary_category_id", "unknown_value", "Unknown category.")
        )
    elif (
        primary.parent_id is None
        or (parent := session.get(orm.Category, primary.parent_id)) is None
        or parent.parent_id is not None
    ):
        errors.append(
            field_error(
                "body.data.primary_category_id",
                "not_a_subcategory",
                "Primary category must be a subcategory of a collection.",
            )
        )
    secondary = body.secondary_category_ids
    if len(secondary) != len(set(secondary)):
        errors.append(
            field_error("body.data.secondary_category_ids", "duplicate", "Duplicate category.")
        )
    if len(secondary) > MAX_SECONDARY:
        errors.append(
            field_error("body.data.secondary_category_ids", "too_many", f"At most {MAX_SECONDARY}.")
        )
    active_categories = set(
        session.scalars(
            select(orm.Category.id).where(orm.Category.id.in_(secondary), orm.Category.active)
        )
    )
    for category_id in secondary:
        if category_id not in active_categories:
            errors.append(
                field_error(
                    "body.data.secondary_category_ids", "unknown_value", "Unknown category."
                )
            )
        elif primary is not None and category_id in {primary.id, primary.parent_id}:
            errors.append(
                field_error(
                    "body.data.secondary_category_ids",
                    "redundant_membership",
                    "Secondary memberships cannot repeat the primary category or its collection.",
                )
            )

    if session.get(orm.Brand, body.brand_id) is None:
        errors.append(field_error("body.data.brand_id", "unknown_value", "Unknown brand."))
    if session.get(orm.Size, body.size_id) is None:
        errors.append(field_error("body.data.size_id", "unknown_value", "Unknown size."))
    metro = session.get(orm.Metro, body.metro_id)
    if metro is None or not metro.active:
        errors.append(field_error("body.data.metro_id", "unknown_value", "Unknown metro."))
    if len(body.color_ids) != len(set(body.color_ids)):
        errors.append(field_error("body.data.color_ids", "duplicate", "Duplicate color."))
    if _exists(session, orm.Color, set(body.color_ids)) != set(body.color_ids):
        errors.append(field_error("body.data.color_ids", "unknown_value", "Unknown color."))

    for name in ("rental_price_minor", "retail_price_minor"):
        if getattr(body, name) > MAX_MINOR_UNITS:
            errors.append(field_error(f"body.data.{name}", "too_large", "Amount is too large."))
    if not band_contains(body.band, body.rental_price_minor):
        errors.append(
            field_error(
                "body.data.band",
                "band_mismatch",
                "Rental price is outside the selected sample band's range.",
            )
        )

    measurements: list[tuple[str, Decimal]] = []
    if len(body.measurements) > MAX_MEASUREMENTS:
        errors.append(
            field_error("body.data.measurements", "too_many", f"At most {MAX_MEASUREMENTS}.")
        )
    seen: set[str] = set()
    for index, item in enumerate(body.measurements):
        field = f"body.data.measurements.{index}"
        key = item.key.strip().lower()
        value = Decimal(str(item.value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if not MEASUREMENT_KEY.match(key):
            errors.append(
                field_error(f"{field}.key", "invalid_key", "Use lowercase letters, digits, - or _.")
            )
        elif key in seen:
            errors.append(field_error(f"{field}.key", "duplicate", "Duplicate measurement."))
        if value <= 0 or value > MAX_MEASUREMENT_CM:
            errors.append(
                field_error(
                    f"{field}.value", "out_of_range", "Must be above 0 and at most 1000 cm."
                )
            )
        seen.add(key)
        measurements.append((key, value))

    blocks = sorted(body.date_blocks, key=lambda block: (block.start, block.end))
    if len(blocks) > MAX_BLOCKS:
        errors.append(field_error("body.data.date_blocks", "too_many", f"At most {MAX_BLOCKS}."))
    for index, block in enumerate(blocks):
        field = f"body.data.date_blocks.{index}"
        if block.end < block.start:
            errors.append(
                field_error(field, "invalid_range", "End date must not precede start date.")
            )
        elif block.start < EARLIEST_BLOCK or block.end > LATEST_BLOCK:
            errors.append(
                field_error(field, "out_of_range", "Dates must be between 2000 and 2100.")
            )
        elif index and block.start <= blocks[index - 1].end:
            errors.append(field_error(field, "overlap", "Date blocks must not overlap."))

    images = body.image_ids
    if len(images) != len(set(images)):
        errors.append(field_error("body.data.image_ids", "duplicate", "Duplicate image."))
    if len(images) > MAX_IMAGES:
        errors.append(field_error("body.data.image_ids", "too_many", f"At most {MAX_IMAGES}."))
    attached = {row.id for row in product.images} if product is not None else set()
    reusable: set[UUID] = set()
    if fixture_images_allowed(settings):
        reusable = set(
            session.scalars(
                select(orm.ProductImage.id).where(
                    orm.ProductImage.id.in_(images), orm.ProductImage.media_status == "fixture"
                )
            )
        )
    for image_id in images:
        if image_id not in attached and image_id not in reusable:
            # Inline URLs are impossible; IDs must be owned verified media or demo fixtures.
            errors.append(
                field_error("body.data.image_ids", "image_not_allowed", "Unknown or unowned image.")
            )
            break
    if errors:
        raise invalid(*errors)
    return ValidWrite(text, description, measurements, blocks, list(images))


def apply_write(
    session: Session, product: orm.Product, body: wire.ProductWrite, valid: ValidWrite
) -> None:
    for name, value in valid.text.items():
        setattr(product, name, value)
    product.description = valid.description
    product.primary_category_id = body.primary_category_id
    product.brand_id = body.brand_id
    product.size_id = body.size_id
    product.metro_id = body.metro_id
    product.audience = body.audience
    product.band = body.band
    product.rental_price_minor = body.rental_price_minor
    product.retail_price_minor = body.retail_price_minor
    product.currency = body.currency
    product.status = body.status
    product.is_available = body.is_available

    # Clear child rows first so replacement rows never collide with unique keys mid-flush.
    keep = {row.id: row for row in product.images}
    product.secondary_categories.clear()
    product.colors.clear()
    product.measurements.clear()
    product.date_blocks.clear()
    for row in list(product.images):
        if row.id not in valid.image_sources:
            product.images.remove(row)
    session.flush()

    product.secondary_categories.extend(
        orm.ProductCategory(category_id=category_id, position=i)
        for i, category_id in enumerate(body.secondary_category_ids)
    )
    product.colors.extend(
        orm.ProductColor(color_id=color_id, position=i) for i, color_id in enumerate(body.color_ids)
    )
    product.measurements.extend(
        orm.ProductMeasurement(measurement_key=key, value_decimal=value, unit="cm", position=i)
        for i, (key, value) in enumerate(valid.measurements)
    )
    product.date_blocks.extend(
        orm.ProductUnavailability(start_date=block.start, end_date=block.end, reason=block.reason)
        for block in valid.blocks
    )
    sources = {
        row.id: row
        for row in session.scalars(
            select(orm.ProductImage).where(orm.ProductImage.id.in_(valid.image_sources))
        )
    }
    ordered: list[orm.ProductImage] = []
    for position, image_id in enumerate(valid.image_sources):
        if image_id in keep:
            row = keep[image_id]
            row.sort_order = position
        else:
            source = sources[image_id]
            row = orm.ProductImage(
                id=uuid4(),
                fixture_url=source.fixture_url,
                alt_text=source.alt_text,
                width=source.width,
                height=source.height,
                media_status="fixture",
                sort_order=position,
            )
        ordered.append(row)
    product.images[:] = ordered


def slugify(title: str, product_id: UUID) -> str:
    ascii_title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", ascii_title.lower()).strip("-")[:80].strip("-") or "listing"
    return f"{base}-{product_id.hex[:8]}"


def load_owned(session: Session, lender: orm.LenderProfile, product_id: UUID) -> orm.Product:
    product = session.scalar(
        select(orm.Product)
        .where(orm.Product.id == product_id, orm.Product.lender_profile_id == lender.id)
        .options(*serializers.PRODUCT_LOAD)
        .execution_options(populate_existing=True)
    )
    if product is None:
        # Missing and not-owned are indistinguishable to avoid enumerating other lenders' items.
        raise not_found("Product not found.")
    return product


def lock_owned(
    session: Session, lender: orm.LenderProfile, product_id: UUID, expected_version: int
) -> orm.Product:
    locked = session.scalar(
        select(orm.Product.version)
        .where(orm.Product.id == product_id, orm.Product.lender_profile_id == lender.id)
        .with_for_update()
    )
    if locked is None:
        raise not_found("Product not found.")
    if locked != expected_version:
        raise ApiError(
            409,
            "stale_version",
            "This listing changed since it was loaded. Refresh before saving.",
            [{"field": "expected_version", "current_version": locked}],
        )
    return load_owned(session, lender, product_id)


def detail_after_commit(
    session: Session, lender: orm.LenderProfile, product_id: UUID
) -> wire.ProductDetail:
    session.commit()
    return serializers.product_detail(load_owned(session, lender, product_id))


@router.get(
    "/lender/products", response_model=wire.LenderProductPage, operation_id="listLenderProducts"
)
def owner_products(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=40, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> Any:
    conditions = [orm.Product.lender_profile_id == lender.id]
    if q and q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(orm.Product.title.ilike(f"%{escaped}%", escape="\\"))
    total = session.scalar(select(func.count()).select_from(orm.Product).where(*conditions)) or 0
    items = session.scalars(
        select(orm.Product)
        .where(*conditions)
        .options(*serializers.PRODUCT_LOAD)
        .order_by(orm.Product.created_at.desc(), orm.Product.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return wire.LenderProductPage(
        items=[serializers.product_detail(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/lender/products",
    response_model=wire.ProductDetail,
    status_code=201,
    operation_id="createLenderProduct",
)
def create_product(
    body: wire.ProductWrite,
    request: Request,
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> Any:
    valid = validate_write(session, body, settings_of(request), None)
    product_id = uuid4()
    next_rank = session.scalar(select(func.coalesce(func.max(orm.Product.featured_rank), 0) + 1))
    product = orm.Product(
        id=product_id,
        slug=slugify(valid.text["title"], product_id),
        lender_profile_id=lender.id,
        featured_rank=next_rank,
        sample_rating=None,
        sample_rating_count=0,
        version=1,
    )
    session.add(product)
    apply_write(session, product, body, valid)
    return detail_after_commit(session, lender, product_id)


@router.get(
    "/lender/products/{id}", response_model=wire.ProductDetail, operation_id="getLenderProduct"
)
def owner_product(
    id: UUID,
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> Any:
    return serializers.product_detail(load_owned(session, lender, id))


@router.patch(
    "/lender/products/{id}", response_model=wire.ProductDetail, operation_id="updateLenderProduct"
)
def update_product(
    id: UUID,
    body: wire.ProductPatch,
    request: Request,
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> Any:
    if body.data is None and body.is_available is None:
        raise invalid(field_error("body", "empty_patch", "Provide data and/or is_available."))
    if (
        body.data is not None
        and body.is_available is not None
        and body.data.is_available != body.is_available
    ):
        raise invalid(
            field_error(
                "body.is_available", "conflicting_values", "is_available conflicts with data."
            )
        )
    # The row lock serializes concurrent edits; the loser sees the new version and gets 409.
    product = lock_owned(session, lender, id, body.expected_version)
    if body.data is not None:
        valid = validate_write(session, body.data, settings_of(request), product)
        apply_write(session, product, body.data, valid)
    if body.is_available is not None:
        product.is_available = body.is_available
    product.version += 1
    return detail_after_commit(session, lender, id)


@router.delete(
    "/lender/products/{id}", response_model=wire.ProductDetail, operation_id="archiveLenderProduct"
)
def archive_product(
    id: UUID,
    expected_version: int = Query(ge=1),
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> Any:
    # Archive, never hard-delete. Re-archiving the current version is a no-op.
    product = lock_owned(session, lender, id, expected_version)
    if product.status != "archived":
        product.status = "archived"
        product.version += 1
    return detail_after_commit(session, lender, id)
