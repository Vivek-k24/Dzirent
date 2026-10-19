"""Public catalog. Semantics follow contracts/README.md; no owner or draft data is exposed."""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import ColumnElement, Select, and_, exists, false, func, or_, select
from sqlalchemy.orm import Session

from . import models as wire
from . import orm, serializers
from .db import get_session
from .errors import Detail, field_error, invalid, not_found
from .models import Sort
from .reference import BAND_LABELS, BANDS, RENTAL_DAYS, UNMAPPED_METRO_SLUG

router = APIRouter(prefix="/api/v1")


@dataclass
class CatalogParams:
    q: str | None = None
    collection: str | None = None
    category: list[str] = field(default_factory=list)
    subcategory: str | None = None
    brand: list[UUID] = field(default_factory=list)
    color: list[str] = field(default_factory=list)
    band: list[str] = field(default_factory=list)
    size: list[UUID] = field(default_factory=list)
    start: str | None = None
    end: str | None = None
    metro: str | None = None
    zip: str | None = None
    sort: Sort = "featured"
    page: int = 1
    page_size: int = 40


def catalog_query(
    q: str | None = Query(default=None, max_length=200),
    collection: str | None = None,
    category: Annotated[list[str] | None, Query()] = None,
    subcategory: str | None = None,
    brand: Annotated[list[UUID] | None, Query()] = None,
    color: Annotated[list[str] | None, Query()] = None,
    band: Annotated[list[str] | None, Query()] = None,
    size: Annotated[list[UUID] | None, Query()] = None,
    start: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    metro: str | None = None,
    zip: str | None = Query(default=None, pattern=r"^\d{5}$"),
    sort: Sort = "featured",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=40, ge=1, le=100),
) -> CatalogParams:
    return CatalogParams(
        q=q,
        collection=collection,
        category=list(dict.fromkeys(category or [])),
        subcategory=subcategory,
        brand=list(dict.fromkeys(brand or [])),
        color=list(dict.fromkeys(color or [])),
        band=list(dict.fromkeys(band or [])),
        size=list(dict.fromkeys(size or [])),
        start=start,
        end=end,
        metro=metro,
        zip=zip,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@dataclass
class Taxonomy:
    roots: dict[str, orm.Category]
    leaves: dict[str, orm.Category]
    children: dict[UUID, set[UUID]]

    @classmethod
    def load(cls, session: Session) -> "Taxonomy":
        rows = session.scalars(select(orm.Category).where(orm.Category.active)).all()
        roots = {row.slug: row for row in rows if row.parent_id is None}
        root_ids = {row.id for row in roots.values()}
        leaves = {row.slug: row for row in rows if row.parent_id in root_ids}
        children: dict[UUID, set[UUID]] = {root.id: set() for root in roots.values()}
        for leaf in leaves.values():
            assert leaf.parent_id is not None
            children[leaf.parent_id].add(leaf.id)
        return cls(roots, leaves, children)

    def root_members(self, root_ids: set[UUID]) -> set[UUID]:
        members = set(root_ids)
        for root_id in root_ids:
            members |= self.children.get(root_id, set())
        return members


def public_predicate() -> ColumnElement[bool]:
    # Published listings from active lender profiles whose application account is active.
    return and_(
        orm.Product.status == "published",
        exists().where(
            orm.LenderProfile.id == orm.Product.lender_profile_id,
            orm.LenderProfile.status == "active",
            orm.User.id == orm.LenderProfile.user_id,
            orm.User.status == "active",
        ),
    )


def membership(category_ids: set[UUID]) -> ColumnElement[bool]:
    # EXISTS keeps one row per product, so secondary memberships never duplicate or inflate counts.
    if not category_ids:
        return false()
    return or_(
        orm.Product.primary_category_id.in_(category_ids),
        exists().where(
            orm.ProductCategory.product_id == orm.Product.id,
            orm.ProductCategory.category_id.in_(category_ids),
        ),
    )


def escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def parse_range(
    start: str | None, end: str | None, errors: list[Detail]
) -> tuple[date, date] | None:
    if not start and not end:
        return None
    if not start or not end:
        errors.append(field_error("query.start", "incomplete_range", "Provide both start and end."))
        return None
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        errors.append(
            field_error("query.start", "invalid_date", "Dates must be valid YYYY-MM-DD values.")
        )
        return None
    if last != first + timedelta(days=RENTAL_DAYS - 1):
        errors.append(
            field_error(
                "query.end",
                "invalid_range",
                f"Rental dates are a {RENTAL_DAYS}-day inclusive interval: end = start + 3 days.",
            )
        )
        return None
    return first, last


@dataclass
class ResolvedQuery:
    navigation: ColumnElement[bool] | None
    filters: list[ColumnElement[bool]]
    available: ColumnElement[bool]


def resolve(session: Session, params: CatalogParams) -> ResolvedQuery:
    taxonomy = Taxonomy.load(session)
    errors: list[Detail] = []

    def unknown(name: str, value: object) -> None:
        errors.append(field_error(f"query.{name}", "unknown_value", f"Unknown {name}: {value}"))

    navigation: ColumnElement[bool] | None = None
    navigation_root = taxonomy.roots.get(params.collection) if params.collection else None
    if params.collection and navigation_root is None:
        unknown("collection", params.collection)
    if navigation_root is not None:
        navigation = membership(taxonomy.root_members({navigation_root.id}))

    filters: list[ColumnElement[bool]] = [public_predicate()]
    for slug in params.category:
        if slug not in taxonomy.roots:
            unknown("category", slug)
    if params.category:
        effective = {taxonomy.roots[s].id for s in params.category if s in taxonomy.roots}
    elif navigation_root is not None:
        effective = {navigation_root.id}
    else:
        effective = {root.id for root in taxonomy.roots.values()}

    leaf = taxonomy.leaves.get(params.subcategory) if params.subcategory else None
    if params.subcategory and leaf is None:
        unknown("subcategory", params.subcategory)
    elif leaf is not None and leaf.parent_id not in effective:
        errors.append(
            field_error(
                "query.subcategory",
                "incompatible_subcategory",
                "Subcategory does not belong to the selected collection or categories.",
            )
        )
    if leaf is not None:
        # A subcategory narrows results to that leaf (primary or secondary membership).
        filters.append(membership({leaf.id}))
    elif params.category:
        filters.append(membership(taxonomy.root_members(effective)))
    elif navigation is not None:
        filters.append(navigation)

    if params.q and params.q.strip():
        pattern = f"%{escape_like(params.q.strip())}%"
        filters.append(
            or_(
                orm.Product.title.ilike(pattern, escape="\\"),
                orm.Product.description.ilike(pattern, escape="\\"),
                exists().where(
                    orm.Brand.id == orm.Product.brand_id,
                    orm.Brand.display_name.ilike(pattern, escape="\\"),
                ),
            )
        )

    if params.brand:
        known = set(session.scalars(select(orm.Brand.id).where(orm.Brand.id.in_(params.brand))))
        for value in params.brand:
            if value not in known:
                unknown("brand", value)
        filters.append(orm.Product.brand_id.in_(params.brand))
    if params.size:
        known = set(session.scalars(select(orm.Size.id).where(orm.Size.id.in_(params.size))))
        for value in params.size:
            if value not in known:
                unknown("size", value)
        filters.append(orm.Product.size_id.in_(params.size))
    if params.color:
        color_ids = dict(
            session.execute(
                select(orm.Color.slug, orm.Color.id).where(orm.Color.slug.in_(params.color))
            ).all()
        )
        for slug in params.color:
            if slug not in color_ids:
                unknown("color", slug)
        filters.append(
            exists().where(
                orm.ProductColor.product_id == orm.Product.id,
                orm.ProductColor.color_id.in_(color_ids.values()),
            )
        )
    if params.band:
        for band in params.band:
            if band not in BANDS:
                unknown("band", band)
        filters.append(orm.Product.band.in_(params.band))

    metro_id = resolve_metro(session, params.metro, params.zip, errors)
    if metro_id is not None:
        filters.append(orm.Product.metro_id == metro_id)

    dates = parse_range(params.start, params.end, errors)
    if errors:
        raise invalid(*errors)

    available: ColumnElement[bool] = orm.Product.is_available.is_(True)
    if dates is not None:
        first, last = dates
        # Inclusive overlap: touching endpoints overlap. Date filters exclude unavailable items.
        available = and_(
            available,
            ~exists().where(
                orm.ProductUnavailability.product_id == orm.Product.id,
                orm.ProductUnavailability.start_date <= last,
                orm.ProductUnavailability.end_date >= first,
            ),
        )
        filters.append(available)
    return ResolvedQuery(navigation=navigation, filters=filters, available=available)


def resolve_metro(
    session: Session, metro_slug: str | None, postal_code: str | None, errors: list[Detail]
) -> UUID | None:
    explicit: UUID | None = None
    if metro_slug:
        explicit = session.scalar(
            select(orm.Metro.id).where(orm.Metro.slug == metro_slug, orm.Metro.active)
        )
        if explicit is None:
            errors.append(
                field_error("query.metro", "unknown_value", f"Unknown metro: {metro_slug}")
            )
            return None
    if not postal_code:
        return explicit
    from_zip = zip_metro(session, postal_code)
    if explicit is not None and from_zip != explicit:
        errors.append(
            field_error(
                "query.zip", "metro_conflict", "ZIP and metro identify different locations."
            )
        )
        return None
    return from_zip


def zip_metro(session: Session, postal_code: str) -> UUID | None:
    mapped = session.scalar(
        select(orm.MetroPostalCode.metro_id).where(orm.MetroPostalCode.postal_code == postal_code)
    )
    if mapped is not None:
        return mapped
    return session.scalar(select(orm.Metro.id).where(orm.Metro.slug == UNMAPPED_METRO_SLUG))


def count(session: Session, *conditions: ColumnElement[bool]) -> int:
    return session.scalar(select(func.count(func.distinct(orm.Product.id))).where(*conditions)) or 0


def ordered(query: Select[Any], sort: Sort) -> Select[Any]:
    # Every ordering ends with the product UUID ascending for stable pagination.
    if sort == "price_asc":
        return query.order_by(orm.Product.rental_price_minor.asc(), orm.Product.id.asc())
    if sort == "price_desc":
        return query.order_by(orm.Product.rental_price_minor.desc(), orm.Product.id.asc())
    if sort == "newest":
        return query.order_by(orm.Product.created_at.desc(), orm.Product.id.asc())
    if sort == "top_rated":
        return query.order_by(orm.Product.sample_rating.desc().nulls_last(), orm.Product.id.asc())
    return query.order_by(orm.Product.featured_rank.asc(), orm.Product.id.asc())


@router.get(
    "/catalog/products",
    response_model=wire.ProductPage,
    operation_id="listCatalogProducts",
)
def list_products(
    params: CatalogParams = Depends(catalog_query), session: Session = Depends(get_session)
) -> Any:
    resolved = resolve(session, params)
    total = count(session, *resolved.filters)
    collection_conditions = [public_predicate()]
    if resolved.navigation is not None:
        collection_conditions.append(resolved.navigation)
    query = ordered(
        select(orm.Product).where(*resolved.filters).options(*serializers.PRODUCT_LOAD),
        params.sort,
    )
    items = session.scalars(
        query.offset((params.page - 1) * params.page_size).limit(params.page_size)
    ).all()
    return wire.ProductPage(
        items=[serializers.product_card(item) for item in items],
        total=total,
        page=params.page,
        page_size=params.page_size,
        collection_total=count(session, *collection_conditions),
        available_total=count(session, *resolved.filters, resolved.available),
    )


@router.get(
    "/catalog/products/{slug}", response_model=wire.ProductDetail, operation_id="getCatalogProduct"
)
def get_product(slug: str, session: Session = Depends(get_session)) -> Any:
    if len(slug) > 200:
        raise not_found("Product not found.")
    product = session.scalar(
        select(orm.Product)
        .where(orm.Product.slug == slug, public_predicate())
        .options(*serializers.PRODUCT_LOAD)
    )
    if product is None:
        raise not_found("Product not found.")
    return serializers.product_detail(product)


@router.get("/catalog/categories", response_model=wire.CategoryTree, operation_id="getCategoryTree")
def categories(session: Session = Depends(get_session)) -> Any:
    taxonomy = Taxonomy.load(session)
    public = public_predicate()

    def node(
        row: orm.Category, members: set[UUID], children: list[wire.CategoryNode]
    ) -> wire.CategoryNode:
        return wire.CategoryNode(
            id=row.id,
            slug=row.slug,
            label=row.name,
            parent_id=row.parent_id,
            sort_order=row.sort_order,
            product_count=count(session, public, membership(members)),
            children=children,
        )

    roots = sorted(taxonomy.roots.values(), key=lambda row: (row.sort_order, row.slug))
    items = []
    for root in roots:
        leaves = sorted(
            (leaf for leaf in taxonomy.leaves.values() if leaf.parent_id == root.id),
            key=lambda row: (row.sort_order, row.slug),
        )
        children = [node(leaf, {leaf.id}, []) for leaf in leaves]
        items.append(node(root, taxonomy.root_members({root.id}), children))
    return wire.CategoryTree(items=items)


@router.get("/catalog/facets", response_model=wire.Facets, operation_id="getCatalogFacets")
def facets(
    category: Annotated[list[str] | None, Query()] = None,
    session: Session = Depends(get_session),
) -> Any:
    bands = [
        wire.PriceBand(id=band, label=BAND_LABELS[band], min_minor=low, max_minor_exclusive=high)
        for band, (low, high) in BANDS.items()
    ]
    if not category:
        # No category: every configured reference value, plus attribute values in public listings.
        context: ColumnElement[bool] = public_predicate()
        brands = session.scalars(select(orm.Brand)).all()
        colors = session.scalars(select(orm.Color)).all()
        sizes = session.scalars(select(orm.Size)).all()
    else:
        taxonomy = Taxonomy.load(session)
        missing = [slug for slug in dict.fromkeys(category) if slug not in taxonomy.roots]
        if missing:
            raise invalid(
                *(
                    field_error("query.category", "unknown_value", f"Unknown category: {s}")
                    for s in missing
                )
            )
        root_ids = {taxonomy.roots[slug].id for slug in category}
        context = and_(public_predicate(), membership(taxonomy.root_members(root_ids)))
        in_context = select(orm.Product.id).where(context)
        brands = session.scalars(
            select(orm.Brand).where(orm.Brand.id.in_(select(orm.Product.brand_id).where(context)))
        ).all()
        colors = session.scalars(
            select(orm.Color).where(
                orm.Color.id.in_(
                    select(orm.ProductColor.color_id).where(
                        orm.ProductColor.product_id.in_(in_context)
                    )
                )
            )
        ).all()
        sizes = session.scalars(
            select(orm.Size).where(orm.Size.id.in_(select(orm.Product.size_id).where(context)))
        ).all()
    occasions = session.scalars(select(orm.Product.occasion).where(context).distinct()).all()
    fabrics = session.scalars(select(orm.Product.fabric).where(context).distinct()).all()
    # Codepoint ordering keeps facet arrays identical to the canonical fixtures.
    return wire.Facets(
        brands=sorted((serializers.brand(r) for r in brands), key=lambda r: (r.label, r.slug)),
        colors=sorted((serializers.color(r) for r in colors), key=lambda r: (r.label, r.slug)),
        sizes=sorted(
            (serializers.size(r) for r in sizes), key=lambda r: (r.sizing_system, r.label)
        ),
        bands=bands,
        occasions=sorted(occasions),
        fabrics=sorted(fabrics),
    )


@router.get("/locations/metros", response_model=wire.MetroList, operation_id="getMetros")
def metros(session: Session = Depends(get_session)) -> Any:
    rows = session.scalars(
        select(orm.Metro).where(orm.Metro.active).order_by(orm.Metro.sort_order, orm.Metro.slug)
    ).all()
    fallback = next((row.id for row in rows if row.slug == UNMAPPED_METRO_SLUG), None)
    if fallback is None:
        raise not_found("Locations are not configured.")
    zip_map = dict(
        session.execute(
            select(orm.MetroPostalCode.postal_code, orm.MetroPostalCode.metro_id).order_by(
                orm.MetroPostalCode.postal_code
            )
        ).all()
    )
    return wire.MetroList(
        items=[serializers.metro(row) for row in rows],
        demo_zip_map=zip_map,
        unmapped_zip_metro_id=fallback,
    )
