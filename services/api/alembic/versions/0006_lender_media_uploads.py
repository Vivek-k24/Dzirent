"""Add isolated photo reservations; no existing data/default ACL/SQL-role changes."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_lender_media_uploads"
down_revision: str | None = "0005_auth_email_outbox"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dzirent_app') THEN
            IF current_user <> 'dzirent_migrator' THEN
              RAISE EXCEPTION 'Run media migration as the reviewed migrator role';
            END IF;
            IF has_schema_privilege('dzirent_app', 'public', 'CREATE') OR EXISTS (
              SELECT 1 FROM pg_roles WHERE rolname = 'dzirent_app'
              AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
            ) OR EXISTS (
              SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
              WHERE r.rolname = 'dzirent_app'
            ) THEN
              RAISE EXCEPTION 'Runtime privilege isolation requires separate owner review';
            END IF;
          END IF;
        END $$;
    """)
    op.create_table(
        "media_uploads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "product_id",
            sa.Uuid(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "lender_profile_id", sa.Uuid(), sa.ForeignKey("lender_profiles.id"), nullable=False
        ),
        sa.Column("content_type", sa.String(32), nullable=False),
        sa.Column("declared_size", sa.Integer(), nullable=False),
        sa.Column("rights_confirmed", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("object_key", sa.String(64), unique=True),
        sa.Column("byte_size", sa.Integer()),
        sa.Column("sha256", sa.String(64)),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column(
            "completed_image_id",
            sa.Uuid(),
            sa.ForeignKey("product_images.id", ondelete="SET NULL"),
            unique=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name=op.f("ck_media_uploads_content_type"),
        ),
        sa.CheckConstraint(
            "declared_size BETWEEN 1 AND 4000000", name=op.f("ck_media_uploads_declared_size")
        ),
        sa.CheckConstraint("rights_confirmed", name=op.f("ck_media_uploads_rights_confirmed")),
        sa.CheckConstraint(
            "status IN ('pending', 'uploaded', 'complete')", name=op.f("ck_media_uploads_status")
        ),
        sa.CheckConstraint(
            "expires_at > created_at AND expires_at <= created_at + interval '15 minutes'",
            name=op.f("ck_media_uploads_expiry"),
        ),
        sa.CheckConstraint(
            "(status = 'pending' AND object_key IS NULL AND byte_size IS NULL AND sha256 IS NULL AND width IS NULL AND height IS NULL) OR (status <> 'pending' AND object_key IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND byte_size BETWEEN 1 AND 4000000 AND length(sha256) = 64 AND width >= 200 AND height >= 200)",
            name=op.f("ck_media_uploads_payload_state"),
        ),
    )
    op.create_index(
        "ix_media_uploads_product_expiry", "media_uploads", ["product_id", "expires_at"]
    )
    op.execute("REVOKE ALL ON TABLE public.media_uploads FROM PUBLIC")
    op.execute("""
        DO $$ DECLARE inherited record; BEGIN
          FOR inherited IN
            SELECT DISTINCT r.rolname FROM pg_class c
            JOIN pg_namespace n ON n.oid=c.relnamespace
            CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee
            WHERE n.nspname='public' AND c.relname='media_uploads' AND a.grantee<>c.relowner
          LOOP
            EXECUTE format('REVOKE ALL ON TABLE public.media_uploads FROM %I', inherited.rolname);
          END LOOP;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dzirent_app') THEN
            GRANT SELECT, INSERT, DELETE ON media_uploads TO dzirent_app;
            GRANT UPDATE (status, object_key, byte_size, sha256, width, height, completed_image_id)
              ON media_uploads TO dzirent_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM media_uploads)")):
        raise RuntimeError("Photo reservations exist; downgrade needs a reviewed preservation plan")
    op.drop_table("media_uploads")
