"""Add native authentication without converting existing subjects or creating any accounts.

Revision ID: 0004_native_auth
Revises: 0003_native_identity_boundary
Locally verified in Phase 2A; never applied to hosted databases by this change.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_native_auth"
down_revision: str | None = "0003_native_identity_boundary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = (
    "auth_credentials",
    "auth_sessions",
    "auth_rate_limits",
    "auth_tokens",
    "platform_admin_grants",
    "platform_admin_events",
)


def _created(name: str = "created_at") -> sa.Column[sa.DateTime]:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    )


def _id() -> sa.Column[sa.Uuid]:
    return sa.Column("id", sa.Uuid(), primary_key=True)


def _user(*, primary_key: bool = False) -> sa.Column[sa.Uuid]:
    return sa.Column(
        "user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, primary_key=primary_key
    )


def upgrade() -> None:
    # Hosted deployment must use the existing migrator, never runtime or a privileged substitute.
    # No roles/role memberships/default privileges are created or changed here.
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dzirent_app') THEN
            IF current_user <> 'dzirent_migrator' THEN
              RAISE EXCEPTION 'Run native auth migration as the reviewed migrator role';
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
        "auth_credentials",
        _user(primary_key=True),
        sa.Column("email_normalized", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("synthetic", sa.Boolean(), nullable=False, server_default="false"),
        _created("password_changed_at"),
        _created(),
        _created("updated_at"),
        sa.CheckConstraint(
            "email_normalized = lower(btrim(email_normalized))",
            name=op.f("ck_auth_credentials_email_normalized"),
        ),
        sa.CheckConstraint(
            "password_hash LIKE '$argon2id$%'", name=op.f("ck_auth_credentials_password_hash")
        ),
    )
    op.create_table(
        "auth_sessions",
        _id(),
        _user(),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        _created(),
        sa.CheckConstraint(
            "token_hash ~ '^[0-9a-f]{64}$'", name=op.f("ck_auth_sessions_token_hash")
        ),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_auth_sessions_expiry")),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table(
        "auth_rate_limits",
        sa.Column("action", sa.String(32), primary_key=True),
        sa.Column("key_hash", sa.String(64), primary_key=True),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "attempts > 0 AND attempts <= 1000000", name=op.f("ck_auth_rate_limits_attempts")
        ),
    )
    op.create_table(
        "auth_tokens",
        _id(),
        _user(),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        _created(),
        sa.CheckConstraint(
            "purpose IN ('verify_email', 'reset_password')", name=op.f("ck_auth_tokens_purpose")
        ),
        sa.CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name=op.f("ck_auth_tokens_token_hash")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_auth_tokens_expiry")),
    )
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"])
    op.create_table(
        "platform_admin_grants",
        _id(),
        _user(),
        sa.Column("capability", sa.String(64), nullable=False),
        _created("granted_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "capability = 'operations:access'", name=op.f("ck_platform_admin_grants_capability")
        ),
    )
    op.create_index(
        "ix_platform_admin_grants_user_capability",
        "platform_admin_grants",
        ["user_id", "capability"],
    )
    op.create_table(
        "platform_admin_events",
        _id(),
        sa.Column("grant_id", sa.Uuid(), sa.ForeignKey("platform_admin_grants.id"), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("operator", sa.String(100), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("evidence_sha256", sa.String(64), nullable=False),
        _created(),
        sa.CheckConstraint(
            "action IN ('grant', 'revoke')", name=op.f("ck_platform_admin_events_action")
        ),
    )
    op.create_index("ix_platform_admin_events_grant_id", "platform_admin_events", ["grant_id"])
    for table in TABLES:
        # Static names only; undo any table default grant inherited at CREATE time.
        op.execute(sa.text(f"REVOKE ALL ON TABLE public.{table} FROM PUBLIC"))
    op.execute("""
        DO $$ DECLARE inherited record; BEGIN
          -- New sensitive tables must not inherit arbitrary default-role grants. This
          -- changes only their ACLs, never existing tables, roles or default privileges.
          FOR inherited IN
            SELECT DISTINCT n.nspname, c.relname, r.rolname
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL aclexplode(c.relacl) a
            JOIN pg_roles r ON r.oid = a.grantee
            WHERE n.nspname = 'public' AND c.relname IN (
              'auth_credentials', 'auth_sessions', 'auth_rate_limits', 'auth_tokens',
              'platform_admin_grants', 'platform_admin_events'
            ) AND a.grantee <> c.relowner
          LOOP
            EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I',
              inherited.nspname, inherited.relname, inherited.rolname);
          END LOOP;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dzirent_app') THEN
            REVOKE ALL ON auth_credentials, auth_sessions, auth_rate_limits, auth_tokens,
              platform_admin_grants, platform_admin_events FROM dzirent_app;
            GRANT SELECT, INSERT ON auth_credentials TO dzirent_app;
            GRANT UPDATE (password_hash, email_verified_at, password_changed_at, updated_at)
              ON auth_credentials TO dzirent_app;
            GRANT SELECT, INSERT ON auth_sessions TO dzirent_app;
            GRANT UPDATE (revoked_at) ON auth_sessions TO dzirent_app;
            GRANT SELECT, INSERT ON auth_rate_limits TO dzirent_app;
            GRANT UPDATE (window_started_at, attempts) ON auth_rate_limits TO dzirent_app;
            GRANT SELECT, INSERT ON auth_tokens TO dzirent_app;
            GRANT UPDATE (consumed_at) ON auth_tokens TO dzirent_app;
            GRANT SELECT (id, user_id, capability, expires_at, revoked_at)
              ON platform_admin_grants TO dzirent_app;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    connection = op.get_bind()
    # Never silently delete credential material, grants or the admin audit trail.
    for table in (
        "auth_credentials",
        "auth_sessions",
        "auth_tokens",
        "platform_admin_grants",
        "platform_admin_events",
    ):
        if connection.scalar(sa.text(f"SELECT EXISTS (SELECT 1 FROM public.{table})")):
            raise RuntimeError(
                "Native auth data exists; downgrade requires a reviewed preservation plan"
            )
    for table in reversed(TABLES):
        op.drop_table(table)
