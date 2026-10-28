"""Phase 1 PostgreSQL schema (brief section 7). Later-phase tables are intentionally absent."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


def created_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


def updated_column() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("auth_provider", "auth_subject", name="uq_users_provider_subject"),
        CheckConstraint("auth_provider IN ('native', 'mock')", name="auth_provider"),
        CheckConstraint("status IN ('active', 'inactive')", name="status"),
        CheckConstraint("length(btrim(display_name)) > 0", name="display_name"),
    )
    # Native credentials are separate; a mock or dormant subject is never a password account.
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    auth_provider: Mapped[str] = mapped_column(String(16))
    auth_subject: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = created_column()
    updated_at: Mapped[datetime] = updated_column()

    roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    lender_profile: Mapped["LenderProfile | None"] = relationship(back_populates="user")
    preferences: Mapped["UserPreferences | None"] = relationship(back_populates="user")


class UserRole(Base):
    __tablename__ = "user_roles"
    # Privileged roles are provisioned separately and are never part of this self-service enum.
    __table_args__ = (CheckConstraint("role IN ('renter', 'lender')", name="role"),)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(16), primary_key=True)
    created_at: Mapped[datetime] = created_column()
    user: Mapped[User] = relationship(back_populates="roles")


class Metro(Base):
    __tablename__ = "metros"
    __table_args__ = (CheckConstraint("country_code ~ '^[A-Z]{2}$'", name="country_code"),)
    # Configured demo locations. Coverage or delivery is never inferred from these rows.
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(16))
    country_code: Mapped[str] = mapped_column(String(2))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class MetroPostalCode(Base):
    __tablename__ = "metro_postal_codes"
    __table_args__ = (CheckConstraint("postal_code ~ '^[0-9]{5}$'", name="postal_code"),)
    # Small explicit demo ZIP map; unmapped ZIPs resolve to the configured fallback metro.
    postal_code: Mapped[str] = mapped_column(String(5), primary_key=True)
    metro_id: Mapped[UUID] = mapped_column(ForeignKey("metros.id"), index=True)


class LenderProfile(Base):
    __tablename__ = "lender_profiles"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive')", name="status"),
        CheckConstraint("length(btrim(display_name)) > 0", name="display_name"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    metro_id: Mapped[UUID] = mapped_column(ForeignKey("metros.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = created_column()
    updated_at: Mapped[datetime] = updated_column()
    user: Mapped[User] = relationship(back_populates="lender_profile")


class UserPreferences(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (CheckConstraint("postal_code ~ '^[0-9]{5}$'", name="postal_code"),)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    metro_id: Mapped[UUID | None] = mapped_column(ForeignKey("metros.id"), index=True)
    postal_code: Mapped[str | None] = mapped_column(String(5))
    updated_at: Mapped[datetime] = updated_column()
    user: Mapped[User] = relationship(back_populates="preferences")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (CheckConstraint("parent_id IS NULL OR parent_id <> id", name="not_self"),)
    # Read-only seeded reference taxonomy in Phase 1; acyclic parents are enforced in service code.
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("categories.id"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent: Mapped["Category | None"] = relationship(remote_side=[id])


class Brand(Base):
    __tablename__ = "brands"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    normalized_name: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))


class Color(Base):
    __tablename__ = "colors"
    __table_args__ = (CheckConstraint("swatch_hex ~ '^#[0-9a-fA-F]{6}$'", name="swatch_hex"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(64))
    swatch_hex: Mapped[str] = mapped_column(String(7))


class Size(Base):
    __tablename__ = "sizes"
    __table_args__ = (
        UniqueConstraint("sizing_system", "label", name="uq_sizes_system_label"),
        CheckConstraint("sizing_system IN ('alpha', 'US-women', 'US-men')", name="sizing_system"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    sizing_system: Mapped[str] = mapped_column(String(16))
    label: Mapped[str] = mapped_column(String(16))


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("band IN ('A', 'B', 'C', 'D')", name="band"),
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="status"),
        CheckConstraint("audience IN ('women', 'men', 'unisex')", name="audience"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency"),
        CheckConstraint("rental_price_minor >= 0", name="rental_price_minor"),
        CheckConstraint("retail_price_minor >= 0", name="retail_price_minor"),
        CheckConstraint("featured_rank >= 0", name="featured_rank"),
        CheckConstraint(
            "sample_rating IS NULL OR (sample_rating >= 0 AND sample_rating <= 5)",
            name="sample_rating",
        ),
        CheckConstraint("sample_rating_count >= 0", name="sample_rating_count"),
        CheckConstraint("version >= 1", name="version"),
        Index("ix_products_status_available", "status", "is_available"),
        Index("ix_products_featured", "featured_rank", "id"),
        Index("ix_products_created_at", "created_at"),
        Index("ix_products_rental_price", "rental_price_minor"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    lender_profile_id: Mapped[UUID] = mapped_column(ForeignKey("lender_profiles.id"), index=True)
    primary_category_id: Mapped[UUID] = mapped_column(ForeignKey("categories.id"), index=True)
    brand_id: Mapped[UUID] = mapped_column(ForeignKey("brands.id"), index=True)
    size_id: Mapped[UUID] = mapped_column(ForeignKey("sizes.id"), index=True)
    metro_id: Mapped[UUID] = mapped_column(ForeignKey("metros.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    garment_type: Mapped[str] = mapped_column(String(120))
    audience: Mapped[str] = mapped_column(String(16))
    fabric: Mapped[str] = mapped_column(String(120))
    occasion: Mapped[str] = mapped_column(String(120))
    stretch: Mapped[str] = mapped_column(String(120))
    alterations: Mapped[str] = mapped_column(String(500))
    known_wear: Mapped[str] = mapped_column(String(500))
    band: Mapped[str] = mapped_column(String(1))
    # Sample display amounts only, as nonnegative integer minor units with explicit currency.
    rental_price_minor: Mapped[int] = mapped_column(BigInteger)
    retail_price_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    featured_rank: Mapped[int] = mapped_column(Integer, default=0)
    sample_rating: Mapped[Decimal | None] = mapped_column(Numeric(2, 1))
    sample_rating_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = created_column()
    updated_at: Mapped[datetime] = updated_column()

    lender_profile: Mapped[LenderProfile] = relationship()
    primary_category: Mapped[Category] = relationship()
    brand: Mapped[Brand] = relationship()
    size: Mapped[Size] = relationship()
    metro: Mapped[Metro] = relationship()
    secondary_categories: Mapped[list["ProductCategory"]] = relationship(
        cascade="all, delete-orphan", order_by="ProductCategory.position"
    )
    colors: Mapped[list["ProductColor"]] = relationship(
        cascade="all, delete-orphan", order_by="ProductColor.position"
    )
    measurements: Mapped[list["ProductMeasurement"]] = relationship(
        cascade="all, delete-orphan", order_by="ProductMeasurement.position"
    )
    images: Mapped[list["ProductImage"]] = relationship(
        cascade="all, delete-orphan", order_by="ProductImage.sort_order"
    )
    date_blocks: Mapped[list["ProductUnavailability"]] = relationship(
        cascade="all, delete-orphan",
        order_by="(ProductUnavailability.start_date, ProductUnavailability.end_date)",
    )


class ProductCategory(Base):
    __tablename__ = "product_categories"
    # Optional secondary memberships; descendant queries must deduplicate product IDs.
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[UUID] = mapped_column(
        ForeignKey("categories.id"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)


class ProductColor(Base):
    __tablename__ = "product_colors"
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    color_id: Mapped[UUID] = mapped_column(ForeignKey("colors.id"), primary_key=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[Color] = relationship()


class ProductMeasurement(Base):
    __tablename__ = "product_measurements"
    __table_args__ = (
        UniqueConstraint("product_id", "measurement_key", name="uq_product_measurements_key"),
        CheckConstraint("value_decimal > 0", name="value_positive"),
        CheckConstraint("unit IN ('cm', 'in')", name="unit"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    measurement_key: Mapped[str] = mapped_column(String(64))
    value_decimal: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    unit: Mapped[str] = mapped_column(String(2), default="cm")
    position: Mapped[int] = mapped_column(Integer, default=0)


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "sort_order",
            name="uq_product_images_sort_order",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("(object_key IS NULL) <> (fixture_url IS NULL)", name="exactly_one_source"),
        CheckConstraint("media_status IN ('fixture', 'ready')", name="media_status"),
        CheckConstraint("width > 0 AND height > 0", name="dimensions"),
        CheckConstraint("sort_order >= 0", name="sort_order"),
    )
    # Bytes live in object storage; rows hold keys or allowlisted local fixture paths only.
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    object_key: Mapped[str | None] = mapped_column(String(512))
    fixture_url: Mapped[str | None] = mapped_column(String(512))
    alt_text: Mapped[str] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    media_status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = created_column()


class ProductUnavailability(Base):
    __tablename__ = "product_unavailability"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="date_order"),
        CheckConstraint("reason IN ('demo-block', 'owner-unavailable')", name="reason"),
        Index("ix_product_unavailability_range", "product_id", "start_date", "end_date"),
    )
    # Owner metadata only, not booking locks or reservations.
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(String(32))


class Studio(Base):
    __tablename__ = "studios"
    __table_args__ = (
        CheckConstraint("handle ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'", name="handle"),
        CheckConstraint("length(btrim(display_name)) > 0", name="display_name"),
        CheckConstraint("length(bio) <= 600", name="bio_length"),
        CheckConstraint("version >= 1", name="version"),
    )
    # One optional public profile per lender. The handle is server-assigned and stays stable when
    # the display name changes, so public URLs never break.
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    lender_profile_id: Mapped[UUID] = mapped_column(ForeignKey("lender_profiles.id"), unique=True)
    handle: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(80))
    bio: Mapped[str] = mapped_column(Text, default="")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = created_column()
    updated_at: Mapped[datetime] = updated_column()
    lender_profile: Mapped[LenderProfile] = relationship()


class AuthCredential(Base):
    __tablename__ = "auth_credentials"
    __table_args__ = (
        CheckConstraint(
            "email_normalized = lower(btrim(email_normalized))", name="email_normalized"
        ),
        CheckConstraint("password_hash LIKE '$argon2id$%'", name="password_hash"),
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    email_normalized: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    password_changed_at: Mapped[datetime] = created_column()
    created_at: Mapped[datetime] = created_column()
    updated_at: Mapped[datetime] = updated_column()


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash"),
        CheckConstraint("expires_at > created_at", name="expiry"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_column()


class AuthRateLimit(Base):
    __tablename__ = "auth_rate_limits"
    __table_args__ = (CheckConstraint("attempts > 0 AND attempts <= 1000000", name="attempts"),)
    action: Mapped[str] = mapped_column(String(32), primary_key=True)
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer)


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    __table_args__ = (
        CheckConstraint("purpose IN ('verify_email', 'reset_password')", name="purpose"),
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash"),
        CheckConstraint("expires_at > created_at", name="expiry"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(32))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_column()


class AuthEmailOutbox(Base):
    __tablename__ = "auth_email_outbox"
    __table_args__ = (
        CheckConstraint("purpose IN ('verify_email', 'reset_password')", name="purpose"),
        CheckConstraint(
            "status IN ('pending', 'leased', 'sent', 'cancelled', 'failed')", name="status"
        ),
        CheckConstraint("attempts BETWEEN 0 AND 6", name="attempts"),
        CheckConstraint(
            "expires_at > created_at AND expires_at <= created_at + interval '24 hours'",
            name="expiry",
        ),
        CheckConstraint(
            "(status IN ('pending', 'leased') AND payload IS NOT NULL AND completed_at IS NULL) OR (status IN ('sent', 'cancelled', 'failed') AND payload IS NULL AND completed_at IS NOT NULL)",
            name="payload_lifecycle",
        ),
        CheckConstraint(
            "(status = 'leased' AND lease_id IS NOT NULL AND leased_until IS NOT NULL) OR (status <> 'leased' AND lease_id IS NULL AND leased_until IS NULL)",
            name="lease",
        ),
        CheckConstraint(
            "payload IS NULL OR octet_length(payload) BETWEEN 30 AND 2048", name="payload_size"
        ),
        Index("ix_auth_email_outbox_due", "status", "available_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    token_id: Mapped[UUID] = mapped_column(ForeignKey("auth_tokens.id"), unique=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(32))
    key_id: Mapped[str] = mapped_column(String(32))
    payload: Mapped[bytes | None] = mapped_column(LargeBinary)
    status: Mapped[str] = mapped_column(String(16))
    attempts: Mapped[int] = mapped_column(Integer)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lease_id: Mapped[UUID | None] = mapped_column()
    leased_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_column()
    updated_at: Mapped[datetime] = updated_column()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(32))


class PlatformAdminGrant(Base):
    __tablename__ = "platform_admin_grants"
    __table_args__ = (
        CheckConstraint("capability = 'operations:access'", name="capability"),
        Index("ix_platform_admin_grants_user_capability", "user_id", "capability"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    capability: Mapped[str] = mapped_column(String(64))
    granted_at: Mapped[datetime] = created_column()
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PlatformAdminEvent(Base):
    __tablename__ = "platform_admin_events"
    __table_args__ = (CheckConstraint("action IN ('grant', 'revoke')", name="action"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    grant_id: Mapped[UUID] = mapped_column(ForeignKey("platform_admin_grants.id"), index=True)
    action: Mapped[str] = mapped_column(String(16))
    operator: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(String(500))
    evidence_sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = created_column()


class MediaUpload(Base):
    __tablename__ = "media_uploads"
    __table_args__ = (
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp')", name="content_type"
        ),
        CheckConstraint("declared_size BETWEEN 1 AND 4000000", name="declared_size"),
        CheckConstraint("rights_confirmed", name="rights_confirmed"),
        CheckConstraint("status IN ('pending', 'uploaded', 'complete')", name="status"),
        CheckConstraint(
            "expires_at > created_at AND expires_at <= created_at + interval '15 minutes'",
            name="expiry",
        ),
        CheckConstraint(
            "(status = 'pending' AND object_key IS NULL AND byte_size IS NULL AND sha256 IS NULL AND width IS NULL AND height IS NULL) OR (status <> 'pending' AND object_key IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND byte_size BETWEEN 1 AND 4000000 AND length(sha256) = 64 AND width >= 200 AND height >= 200)",
            name="payload_state",
        ),
        Index("ix_media_uploads_product_expiry", "product_id", "expires_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    lender_profile_id: Mapped[UUID] = mapped_column(ForeignKey("lender_profiles.id"))
    content_type: Mapped[str] = mapped_column(String(32))
    declared_size: Mapped[int] = mapped_column(Integer)
    rights_confirmed: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    object_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    byte_size: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    completed_image_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("product_images.id", ondelete="SET NULL"), unique=True
    )
    created_at: Mapped[datetime] = created_column()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
