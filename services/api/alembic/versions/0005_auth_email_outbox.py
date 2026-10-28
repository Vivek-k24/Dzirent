"""Durable encrypted authentication mail; forward-only addition to reviewed 0004.

Revision ID: 0005_auth_email_outbox
Revises: 0004_native_auth
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_auth_email_outbox"
down_revision: str | None = "0004_native_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dzirent_app') THEN
            IF current_user <> 'dzirent_migrator' THEN
              RAISE EXCEPTION 'Run auth outbox migration as the reviewed migrator role';
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
        "auth_email_outbox",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "token_id", sa.Uuid(), sa.ForeignKey("auth_tokens.id"), nullable=False, unique=True
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("key_id", sa.String(32), nullable=False),
        sa.Column("payload", sa.LargeBinary()),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_id", sa.Uuid()),
        sa.Column("leased_until", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(32)),
        sa.CheckConstraint(
            "purpose IN ('verify_email', 'reset_password')",
            name=op.f("ck_auth_email_outbox_purpose"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'leased', 'sent', 'cancelled', 'failed')",
            name=op.f("ck_auth_email_outbox_status"),
        ),
        sa.CheckConstraint("attempts BETWEEN 0 AND 6", name=op.f("ck_auth_email_outbox_attempts")),
        sa.CheckConstraint(
            "expires_at > created_at AND expires_at <= created_at + interval '24 hours'",
            name=op.f("ck_auth_email_outbox_expiry"),
        ),
        sa.CheckConstraint(
            "(status IN ('pending', 'leased') AND payload IS NOT NULL AND completed_at IS NULL) OR (status IN ('sent', 'cancelled', 'failed') AND payload IS NULL AND completed_at IS NOT NULL)",
            name=op.f("ck_auth_email_outbox_payload_lifecycle"),
        ),
        sa.CheckConstraint(
            "(status = 'leased' AND lease_id IS NOT NULL AND leased_until IS NOT NULL) OR (status <> 'leased' AND lease_id IS NULL AND leased_until IS NULL)",
            name=op.f("ck_auth_email_outbox_lease"),
        ),
        sa.CheckConstraint(
            "payload IS NULL OR octet_length(payload) BETWEEN 30 AND 2048",
            name=op.f("ck_auth_email_outbox_payload_size"),
        ),
    )
    op.create_index("ix_auth_email_outbox_due", "auth_email_outbox", ["status", "available_at"])
    op.create_index("ix_auth_email_outbox_user_id", "auth_email_outbox", ["user_id"])
    op.execute("REVOKE ALL ON TABLE public.auth_email_outbox FROM PUBLIC")
    op.execute("""
        DO $$ DECLARE inherited record; BEGIN
          FOR inherited IN
            SELECT DISTINCT r.rolname FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL aclexplode(c.relacl) a JOIN pg_roles r ON r.oid = a.grantee
            WHERE n.nspname = 'public' AND c.relname = 'auth_email_outbox'
              AND a.grantee <> c.relowner
          LOOP
            EXECUTE format('REVOKE ALL ON TABLE public.auth_email_outbox FROM %I', inherited.rolname);
          END LOOP;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dzirent_app') THEN
            GRANT SELECT, INSERT, DELETE ON auth_email_outbox TO dzirent_app;
            GRANT UPDATE (payload, status, attempts, available_at, lease_id, leased_until,
              updated_at, completed_at, error_code) ON auth_email_outbox TO dzirent_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM auth_email_outbox)")):
        raise RuntimeError("Outbox data exists; downgrade requires a reviewed preservation plan")
    op.drop_table("auth_email_outbox")
