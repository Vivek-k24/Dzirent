"""Candidate wire models; temporary integrator authorship ends at foundation merge."""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "0.1.0-candidate.3"
MinorUnits = Annotated[int, Field(strict=True, ge=0)]
Band = Literal["A", "B", "C", "D"]
ProductStatus = Literal["draft", "published", "archived"]
Sort = Literal["featured", "price_asc", "price_desc", "newest", "top_rated"]


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorBody(WireModel):
    code: str
    message: str
    details: list[dict[str, str | int | float | bool | None]] = Field(default_factory=list)


class Error(WireModel):
    error: ErrorBody
    request_id: str


class Health(WireModel):
    status: Literal["live", "ready"]
    contract_version: str = CONTRACT_VERSION


class Pagination(WireModel):
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)


class Reference(WireModel):
    id: UUID
    slug: str
    label: str


class Color(Reference):
    swatch_hex: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class Size(WireModel):
    id: UUID
    sizing_system: Literal["alpha", "US-women", "US-men"]
    label: str


class Metro(Reference):
    region: Literal["TX"] = "TX"
    country_code: Literal["US"] = "US"
    location_note: str = "Demo location; no delivery coverage inferred."


class MetroList(WireModel):
    items: list[Metro]
    demo_zip_map: dict[str, UUID]
    unmapped_zip_metro_id: UUID


class CategoryNode(Reference):
    parent_id: UUID | None
    sort_order: int = Field(ge=0)
    product_count: int = Field(ge=0)
    children: list["CategoryNode"] = Field(default_factory=list)


class CategoryTree(WireModel):
    items: list[CategoryNode]


class PriceBand(WireModel):
    id: Band
    label: str
    min_minor: MinorUnits
    max_minor_exclusive: MinorUnits | None


class Facets(WireModel):
    brands: list[Reference]
    colors: list[Color]
    sizes: list[Size]
    bands: list[PriceBand]
    occasions: list[str]
    fabrics: list[str]


class Measurement(WireModel):
    key: str = Field(min_length=1, max_length=64)
    value: float = Field(gt=0)
    unit: Literal["cm"] = "cm"


class DateBlock(WireModel):
    start: date
    end: date
    reason: Literal["demo-block", "owner-unavailable"]


class ProductImage(WireModel):
    id: UUID
    url: str
    alt_text: str = Field(min_length=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    sort_order: int = Field(ge=0)
    media_status: Literal["fixture", "ready"]


class ProductCard(WireModel):
    id: UUID
    slug: str
    title: str
    brand: Reference
    primary_collection_id: UUID
    primary_category_id: UUID
    secondary_category_ids: list[UUID]
    size: Size
    colors: list[Color]
    metro: Metro
    band: Band
    rental_price_minor: MinorUnits
    retail_price_minor: MinorUnits
    currency: Literal["USD"] = "USD"
    sample_rating: float | None = Field(ge=0, le=5)
    sample_rating_count: int = Field(ge=0)
    featured_rank: int = Field(ge=0)
    status: ProductStatus
    is_available: bool
    image: ProductImage
    version: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class ProductDetail(ProductCard):
    lender_profile_id: UUID
    description: str
    garment_type: str
    audience: Literal["women", "men", "unisex"]
    fabric: str
    occasion: str
    stretch: str
    alterations: str
    known_wear: str
    measurements: list[Measurement]
    images: list[ProductImage]
    date_blocks: list[DateBlock]


class ProductWrite(WireModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=5000)
    primary_category_id: UUID
    secondary_category_ids: list[UUID] = Field(default_factory=list)
    brand_id: UUID
    size_id: UUID
    color_ids: list[UUID] = Field(min_length=1, max_length=8)
    metro_id: UUID
    band: Band
    rental_price_minor: MinorUnits
    retail_price_minor: MinorUnits
    currency: Literal["USD"] = "USD"
    garment_type: str
    audience: Literal["women", "men", "unisex"]
    fabric: str
    occasion: str
    stretch: str
    alterations: str
    known_wear: str
    measurements: list[Measurement]
    date_blocks: list[DateBlock] = Field(default_factory=list)
    image_ids: list[UUID] = Field(default_factory=list)
    status: ProductStatus = "draft"
    is_available: bool = True


class ProductPatch(WireModel):
    expected_version: int = Field(ge=1)
    # Full replacement of allowlisted fields when data is supplied; availability-only is valid.
    data: ProductWrite | None = None
    is_available: bool | None = None


class ProductPage(Pagination):
    items: list[ProductCard]
    collection_total: int = Field(ge=0)
    available_total: int = Field(ge=0)


class LenderProductPage(Pagination):
    items: list[ProductDetail]


class LenderProfile(WireModel):
    id: UUID
    display_name: str
    metro_id: UUID
    status: Literal["active", "inactive"]


class CurrentUser(WireModel):
    id: UUID
    display_name: str
    email: str | None
    roles: list[Literal["renter", "lender"]]
    status: Literal["active", "inactive"]
    lender_profile: LenderProfile | None
    created_at: datetime
    updated_at: datetime


class ProfilePatch(WireModel):
    display_name: str = Field(min_length=1, max_length=100)


class Preferences(WireModel):
    metro_id: UUID | None = None
    postal_code: str | None = Field(default=None, pattern=r"^\d{5}$")


class LenderEnrollment(WireModel):
    display_name: str = Field(min_length=1, max_length=100)
    metro_id: UUID


class UploadIntentRequest(WireModel):
    filename: str = Field(min_length=1, max_length=160)
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(gt=0, le=10000000)


class UploadIntent(WireModel):
    upload_id: UUID
    upload_url: str
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str]
    expires_at: datetime
    max_size_bytes: int = Field(gt=0)


class UploadComplete(WireModel):
    upload_id: UUID
    alt_text: str = Field(min_length=1, max_length=500)
    expected_version: int = Field(ge=1)


# Studio workflow (contract 0.1.0-candidate.2, additive). A Studio is a lender's public profile.
StudioHandle = Annotated[str, Field(pattern=r"^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$")]


class Studio(WireModel):
    id: UUID
    handle: StudioHandle
    display_name: str = Field(min_length=1, max_length=80)
    bio: str = Field(max_length=600)
    state_code: Literal["TX"] = "TX"
    published_product_count: int = Field(ge=0)


class StudioPage(Pagination):
    items: list[Studio]


class StudioProductPage(Pagination):
    items: list[ProductCard]


class StudioSettings(Studio):
    is_public: bool
    version: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class StudioUpdate(WireModel):
    display_name: str = Field(min_length=1, max_length=80)
    bio: str = Field(default="", max_length=600)
    is_public: bool
    # Omit or null to create the Studio; required and must match to update it.
    expected_version: int | None = Field(default=None, ge=1)
