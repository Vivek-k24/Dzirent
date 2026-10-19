"""Phase 1 schema: identity, taxonomy, catalog and owner listings

Revision ID: 0001_phase1_schema
Revises: none (first and only Phase 1 head)
Create Date: 2026-10-18

Phase 1 tables only (brief section 7). Later-phase rental/evidence tables are not created here.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_phase1_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "brands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_brands")),
        sa.UniqueConstraint("normalized_name", name=op.f("uq_brands_normalized_name")),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "parent_id IS NULL OR parent_id <> id", name=op.f("ck_categories_not_self")
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["categories.id"], name=op.f("fk_categories_parent_id_categories")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("slug", name=op.f("uq_categories_slug")),
    )
    op.create_index(op.f("ix_categories_parent_id"), "categories", ["parent_id"], unique=False)
    op.create_table(
        "colors",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("swatch_hex", sa.String(length=7), nullable=False),
        sa.CheckConstraint("swatch_hex ~ '^#[0-9a-fA-F]{6}$'", name=op.f("ck_colors_swatch_hex")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_colors")),
        sa.UniqueConstraint("slug", name=op.f("uq_colors_slug")),
    )
    op.create_table(
        "metros",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("region", sa.String(length=16), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("country_code ~ '^[A-Z]{2}$'", name=op.f("ck_metros_country_code")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_metros")),
        sa.UniqueConstraint("slug", name=op.f("uq_metros_slug")),
    )
    op.create_table(
        "sizes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sizing_system", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=16), nullable=False),
        sa.CheckConstraint(
            "sizing_system IN ('alpha', 'US-women', 'US-men')", name=op.f("ck_sizes_sizing_system")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sizes")),
        sa.UniqueConstraint("sizing_system", "label", name="uq_sizes_system_label"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("auth_provider", sa.String(length=16), nullable=False),
        sa.Column("auth_subject", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "auth_provider IN ('clerk', 'mock')", name=op.f("ck_users_auth_provider")
        ),
        sa.CheckConstraint("status IN ('active', 'inactive')", name=op.f("ck_users_status")),
        sa.CheckConstraint("length(btrim(display_name)) > 0", name=op.f("ck_users_display_name")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("auth_provider", "auth_subject", name="uq_users_provider_subject"),
    )
    op.create_table(
        "lender_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("metro_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name=op.f("ck_lender_profiles_status")
        ),
        sa.CheckConstraint(
            "length(btrim(display_name)) > 0", name=op.f("ck_lender_profiles_display_name")
        ),
        sa.ForeignKeyConstraint(
            ["metro_id"], ["metros.id"], name=op.f("fk_lender_profiles_metro_id_metros")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_lender_profiles_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lender_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_lender_profiles_user_id")),
    )
    op.create_index(
        op.f("ix_lender_profiles_metro_id"), "lender_profiles", ["metro_id"], unique=False
    )
    op.create_table(
        "metro_postal_codes",
        sa.Column("postal_code", sa.String(length=5), nullable=False),
        sa.Column("metro_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "postal_code ~ '^[0-9]{5}$'", name=op.f("ck_metro_postal_codes_postal_code")
        ),
        sa.ForeignKeyConstraint(
            ["metro_id"], ["metros.id"], name=op.f("fk_metro_postal_codes_metro_id_metros")
        ),
        sa.PrimaryKeyConstraint("postal_code", name=op.f("pk_metro_postal_codes")),
    )
    op.create_index(
        op.f("ix_metro_postal_codes_metro_id"), "metro_postal_codes", ["metro_id"], unique=False
    )
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("metro_id", sa.Uuid(), nullable=True),
        sa.Column("postal_code", sa.String(length=5), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "postal_code ~ '^[0-9]{5}$'", name=op.f("ck_user_preferences_postal_code")
        ),
        sa.ForeignKeyConstraint(
            ["metro_id"], ["metros.id"], name=op.f("fk_user_preferences_metro_id_metros")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_preferences_user_id_users")
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_preferences")),
    )
    op.create_index(
        op.f("ix_user_preferences_metro_id"), "user_preferences", ["metro_id"], unique=False
    )
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('renter', 'lender')", name=op.f("ck_user_roles_role")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_roles_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "role", name=op.f("pk_user_roles")),
    )
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column("lender_profile_id", sa.Uuid(), nullable=False),
        sa.Column("primary_category_id", sa.Uuid(), nullable=False),
        sa.Column("brand_id", sa.Uuid(), nullable=False),
        sa.Column("size_id", sa.Uuid(), nullable=False),
        sa.Column("metro_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("garment_type", sa.String(length=120), nullable=False),
        sa.Column("audience", sa.String(length=16), nullable=False),
        sa.Column("fabric", sa.String(length=120), nullable=False),
        sa.Column("occasion", sa.String(length=120), nullable=False),
        sa.Column("stretch", sa.String(length=120), nullable=False),
        sa.Column("alterations", sa.String(length=500), nullable=False),
        sa.Column("known_wear", sa.String(length=500), nullable=False),
        sa.Column("band", sa.String(length=1), nullable=False),
        sa.Column("rental_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("retail_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("featured_rank", sa.Integer(), nullable=False),
        sa.Column("sample_rating", sa.Numeric(precision=2, scale=1), nullable=True),
        sa.Column("sample_rating_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "audience IN ('women', 'men', 'unisex')", name=op.f("ck_products_audience")
        ),
        sa.CheckConstraint("band IN ('A', 'B', 'C', 'D')", name=op.f("ck_products_band")),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name=op.f("ck_products_currency")),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'archived')", name=op.f("ck_products_status")
        ),
        sa.CheckConstraint("featured_rank >= 0", name=op.f("ck_products_featured_rank")),
        sa.CheckConstraint("rental_price_minor >= 0", name=op.f("ck_products_rental_price_minor")),
        sa.CheckConstraint("retail_price_minor >= 0", name=op.f("ck_products_retail_price_minor")),
        sa.CheckConstraint(
            "sample_rating IS NULL OR (sample_rating >= 0 AND sample_rating <= 5)",
            name=op.f("ck_products_sample_rating"),
        ),
        sa.CheckConstraint(
            "sample_rating_count >= 0", name=op.f("ck_products_sample_rating_count")
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_products_version")),
        sa.ForeignKeyConstraint(
            ["brand_id"], ["brands.id"], name=op.f("fk_products_brand_id_brands")
        ),
        sa.ForeignKeyConstraint(
            ["lender_profile_id"],
            ["lender_profiles.id"],
            name=op.f("fk_products_lender_profile_id_lender_profiles"),
        ),
        sa.ForeignKeyConstraint(
            ["metro_id"], ["metros.id"], name=op.f("fk_products_metro_id_metros")
        ),
        sa.ForeignKeyConstraint(
            ["primary_category_id"],
            ["categories.id"],
            name=op.f("fk_products_primary_category_id_categories"),
        ),
        sa.ForeignKeyConstraint(["size_id"], ["sizes.id"], name=op.f("fk_products_size_id_sizes")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_products")),
        sa.UniqueConstraint("slug", name=op.f("uq_products_slug")),
    )
    op.create_index(op.f("ix_products_brand_id"), "products", ["brand_id"], unique=False)
    op.create_index("ix_products_created_at", "products", ["created_at"], unique=False)
    op.create_index("ix_products_featured", "products", ["featured_rank", "id"], unique=False)
    op.create_index(
        op.f("ix_products_lender_profile_id"), "products", ["lender_profile_id"], unique=False
    )
    op.create_index(op.f("ix_products_metro_id"), "products", ["metro_id"], unique=False)
    op.create_index(
        op.f("ix_products_primary_category_id"), "products", ["primary_category_id"], unique=False
    )
    op.create_index("ix_products_rental_price", "products", ["rental_price_minor"], unique=False)
    op.create_index(op.f("ix_products_size_id"), "products", ["size_id"], unique=False)
    op.create_index(
        "ix_products_status_available", "products", ["status", "is_available"], unique=False
    )
    op.create_table(
        "product_categories",
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_product_categories_category_id_categories"),
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_categories_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("product_id", "category_id", name=op.f("pk_product_categories")),
    )
    op.create_index(
        op.f("ix_product_categories_category_id"),
        "product_categories",
        ["category_id"],
        unique=False,
    )
    op.create_table(
        "product_colors",
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("color_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["color_id"], ["colors.id"], name=op.f("fk_product_colors_color_id_colors")
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_colors_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("product_id", "color_id", name=op.f("pk_product_colors")),
    )
    op.create_index(
        op.f("ix_product_colors_color_id"), "product_colors", ["color_id"], unique=False
    )
    op.create_table(
        "product_images",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=True),
        sa.Column("fixture_url", sa.String(length=512), nullable=True),
        sa.Column("alt_text", sa.String(length=500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("media_status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "media_status IN ('fixture', 'ready')", name=op.f("ck_product_images_media_status")
        ),
        sa.CheckConstraint(
            "(object_key IS NULL) <> (fixture_url IS NULL)",
            name=op.f("ck_product_images_exactly_one_source"),
        ),
        sa.CheckConstraint("sort_order >= 0", name=op.f("ck_product_images_sort_order")),
        sa.CheckConstraint("width > 0 AND height > 0", name=op.f("ck_product_images_dimensions")),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_images_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_images")),
        sa.UniqueConstraint(
            "product_id",
            "sort_order",
            deferrable=True,
            initially="DEFERRED",
            name="uq_product_images_sort_order",
        ),
    )
    op.create_index(
        op.f("ix_product_images_product_id"), "product_images", ["product_id"], unique=False
    )
    op.create_table(
        "product_measurements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("measurement_key", sa.String(length=64), nullable=False),
        sa.Column("value_decimal", sa.Numeric(precision=7, scale=2), nullable=False),
        sa.Column("unit", sa.String(length=2), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint("unit IN ('cm', 'in')", name=op.f("ck_product_measurements_unit")),
        sa.CheckConstraint(
            "value_decimal > 0", name=op.f("ck_product_measurements_value_positive")
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_measurements_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_measurements")),
        sa.UniqueConstraint("product_id", "measurement_key", name="uq_product_measurements_key"),
    )
    op.create_table(
        "product_unavailability",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.CheckConstraint(
            "reason IN ('demo-block', 'owner-unavailable')",
            name=op.f("ck_product_unavailability_reason"),
        ),
        sa.CheckConstraint(
            "end_date >= start_date", name=op.f("ck_product_unavailability_date_order")
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_unavailability_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_unavailability")),
    )
    op.create_index(
        "ix_product_unavailability_range",
        "product_unavailability",
        ["product_id", "start_date", "end_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_product_unavailability_range", table_name="product_unavailability")
    op.drop_table("product_unavailability")
    op.drop_table("product_measurements")
    op.drop_index(op.f("ix_product_images_product_id"), table_name="product_images")
    op.drop_table("product_images")
    op.drop_index(op.f("ix_product_colors_color_id"), table_name="product_colors")
    op.drop_table("product_colors")
    op.drop_index(op.f("ix_product_categories_category_id"), table_name="product_categories")
    op.drop_table("product_categories")
    op.drop_index("ix_products_status_available", table_name="products")
    op.drop_index(op.f("ix_products_size_id"), table_name="products")
    op.drop_index("ix_products_rental_price", table_name="products")
    op.drop_index(op.f("ix_products_primary_category_id"), table_name="products")
    op.drop_index(op.f("ix_products_metro_id"), table_name="products")
    op.drop_index(op.f("ix_products_lender_profile_id"), table_name="products")
    op.drop_index("ix_products_featured", table_name="products")
    op.drop_index("ix_products_created_at", table_name="products")
    op.drop_index(op.f("ix_products_brand_id"), table_name="products")
    op.drop_table("products")
    op.drop_table("user_roles")
    op.drop_index(op.f("ix_user_preferences_metro_id"), table_name="user_preferences")
    op.drop_table("user_preferences")
    op.drop_index(op.f("ix_metro_postal_codes_metro_id"), table_name="metro_postal_codes")
    op.drop_table("metro_postal_codes")
    op.drop_index(op.f("ix_lender_profiles_metro_id"), table_name="lender_profiles")
    op.drop_table("lender_profiles")
    op.drop_table("users")
    op.drop_table("sizes")
    op.drop_table("metros")
    op.drop_table("colors")
    op.drop_index(op.f("ix_categories_parent_id"), table_name="categories")
    op.drop_table("categories")
    op.drop_table("brands")
