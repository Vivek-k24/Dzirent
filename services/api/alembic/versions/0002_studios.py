"""Studios: one optional public profile per lender

Revision ID: 0002_studios
Revises: 0001_phase1_schema
Create Date: 2026-10-19

Additive: creates studios only. Existing tables, rows and the 40 seed products are untouched.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_studios"
down_revision: str | None = "0001_phase1_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "studios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("lender_profile_id", sa.Uuid(), nullable=False),
        sa.Column("handle", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("bio", sa.Text(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
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
            "handle ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'", name=op.f("ck_studios_handle")
        ),
        sa.CheckConstraint("length(bio) <= 600", name=op.f("ck_studios_bio_length")),
        sa.CheckConstraint("length(btrim(display_name)) > 0", name=op.f("ck_studios_display_name")),
        sa.CheckConstraint("version >= 1", name=op.f("ck_studios_version")),
        sa.ForeignKeyConstraint(
            ["lender_profile_id"],
            ["lender_profiles.id"],
            name=op.f("fk_studios_lender_profile_id_lender_profiles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_studios")),
        sa.UniqueConstraint("handle", name=op.f("uq_studios_handle")),
        sa.UniqueConstraint("lender_profile_id", name=op.f("uq_studios_lender_profile_id")),
    )


def downgrade() -> None:
    op.drop_table("studios")
