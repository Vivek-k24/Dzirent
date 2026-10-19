"""Studios: a lender's public profile. Owner settings plus public directory/profile/products."""

import re
import unicodedata
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy import ColumnElement, and_, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import models as wire
from . import orm, serializers
from .catalog import public_predicate
from .db import get_session
from .errors import ApiError, Detail, invalid, not_found
from .identity import bearer
from .profiles import current_lender
from .validation import clean_text

router = APIRouter(prefix="/api/v1")
owner_router = APIRouter(prefix="/api/v1", dependencies=[Depends(bearer)])
HANDLE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$")
MAX_BIO = 600


def published_count() -> ColumnElement[int]:
    # Distinct public products of this Studio's owner. Availability does not affect publication.
    return (
        select(func.count(func.distinct(orm.Product.id)))
        .where(orm.Product.lender_profile_id == orm.Studio.lender_profile_id, public_predicate())
        .correlate(orm.Studio)
        .scalar_subquery()
    )


def public_studio() -> ColumnElement[bool]:
    # Public visibility requires the owner's lender profile and application account to be active.
    return and_(
        orm.Studio.is_public.is_(True),
        exists().where(
            orm.LenderProfile.id == orm.Studio.lender_profile_id,
            orm.LenderProfile.status == "active",
            orm.User.id == orm.LenderProfile.user_id,
            orm.User.status == "active",
        ),
    )


def to_public(studio: orm.Studio, count: int) -> wire.Studio:
    return wire.Studio(
        id=studio.id,
        handle=studio.handle,
        display_name=studio.display_name,
        bio=studio.bio,
        published_product_count=count,
    )


def to_settings(session: Session, studio: orm.Studio) -> wire.StudioSettings:
    count = session.scalar(
        select(published_count()).select_from(orm.Studio).where(orm.Studio.id == studio.id)
    )
    return wire.StudioSettings(
        **to_public(studio, count or 0).model_dump(),
        is_public=studio.is_public,
        version=studio.version,
        created_at=studio.created_at,
        updated_at=studio.updated_at,
    )


def base_handle(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:48].strip("-") or "studio"


def new_handle(session: Session, name: str, studio_id: UUID) -> str:
    handle = base_handle(name)
    if session.scalar(select(orm.Studio.id).where(orm.Studio.handle == handle)) is None:
        return handle
    return f"{handle}-{studio_id.hex[:6]}"


def own_studio(
    session: Session, lender: orm.LenderProfile, *, lock: bool = False
) -> orm.Studio | None:
    query = select(orm.Studio).where(orm.Studio.lender_profile_id == lender.id)
    if lock:
        query = query.with_for_update()
    return session.scalar(query.execution_options(populate_existing=True))


def stale(current_version: int | None) -> ApiError:
    return ApiError(
        409,
        "stale_version",
        "This Studio changed since it was loaded. Refresh before saving.",
        [{"field": "expected_version", "current_version": current_version}],
    )


def page_params(page: int, page_size: int) -> tuple[int, int]:
    return (page - 1) * page_size, page_size


@owner_router.get("/me/studio", response_model=wire.StudioSettings, operation_id="getMyStudio")
def get_my_studio(
    lender: orm.LenderProfile = Depends(current_lender), session: Session = Depends(get_session)
) -> Any:
    studio = own_studio(session, lender)
    if studio is None:
        raise ApiError(404, "studio_not_found", "Create your Studio with PUT /me/studio.")
    return to_settings(session, studio)


@owner_router.put("/me/studio", response_model=wire.StudioSettings, operation_id="saveMyStudio")
def save_my_studio(
    body: wire.StudioUpdate,
    lender: orm.LenderProfile = Depends(current_lender),
    session: Session = Depends(get_session),
) -> Any:
    errors: list[Detail] = []
    name = clean_text(body.display_name, "body.display_name", 80, errors)
    # An empty bio is allowed; otherwise it follows the shared multiline text rules.
    bio = body.bio.strip()
    if bio:
        bio = clean_text(bio, "body.bio", MAX_BIO, errors, multiline=True)
    if errors:
        raise invalid(*errors)

    studio = own_studio(session, lender, lock=True)
    if studio is None:
        if body.expected_version is not None:
            raise stale(None)
        studio_id = uuid4()
        # The unique owner key makes concurrent first saves converge on one Studio.
        created = session.scalar(
            insert(orm.Studio)
            .values(
                id=studio_id,
                lender_profile_id=lender.id,
                handle=new_handle(session, name, studio_id),
                display_name=name,
                bio=bio,
                is_public=body.is_public,
                version=1,
            )
            .on_conflict_do_nothing(index_elements=[orm.Studio.lender_profile_id])
            .returning(orm.Studio.id)
        )
        if created is None:
            session.rollback()
            existing = own_studio(session, lender)
            raise stale(existing.version if existing else None)
    else:
        if body.expected_version != studio.version:
            raise stale(studio.version)
        studio.display_name = name
        studio.bio = bio
        studio.is_public = body.is_public
        studio.version += 1
    session.commit()
    saved = own_studio(session, lender)
    assert saved is not None
    return to_settings(session, saved)


@router.get("/studios", response_model=wire.StudioPage, operation_id="listStudios")
def list_studios(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    session: Session = Depends(get_session),
) -> Any:
    # The default directory lists public Studios that have at least one published outfit.
    count = published_count()
    conditions = [public_studio(), count > 0]
    total = session.scalar(select(func.count()).select_from(orm.Studio).where(*conditions)) or 0
    offset, limit = page_params(page, page_size)
    rows = session.execute(
        select(orm.Studio, count.label("published"))
        .where(*conditions)
        .order_by(orm.Studio.handle.asc(), orm.Studio.id.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return wire.StudioPage(
        items=[to_public(studio, published) for studio, published in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def public_by_handle(session: Session, handle: str) -> tuple[orm.Studio, int]:
    if not HANDLE.match(handle):
        raise not_found("Studio not found.")
    row = session.execute(
        select(orm.Studio, published_count().label("published")).where(
            orm.Studio.handle == handle, public_studio()
        )
    ).first()
    if row is None:
        # Missing, private and inactive Studios are indistinguishable to the public.
        raise not_found("Studio not found.")
    return row[0], row[1]


@router.get("/studios/{handle}", response_model=wire.Studio, operation_id="getStudio")
def get_studio(handle: str, session: Session = Depends(get_session)) -> Any:
    studio, count = public_by_handle(session, handle)
    return to_public(studio, count)


@router.get(
    "/studios/{handle}/products",
    response_model=wire.StudioProductPage,
    operation_id="listStudioProducts",
)
def list_studio_products(
    handle: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    session: Session = Depends(get_session),
) -> Any:
    studio, total = public_by_handle(session, handle)
    offset, limit = page_params(page, page_size)
    items = session.scalars(
        select(orm.Product)
        .where(orm.Product.lender_profile_id == studio.lender_profile_id, public_predicate())
        .options(*serializers.PRODUCT_LOAD)
        .order_by(orm.Product.created_at.desc(), orm.Product.id.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    return wire.StudioProductPage(
        items=[serializers.product_card(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
