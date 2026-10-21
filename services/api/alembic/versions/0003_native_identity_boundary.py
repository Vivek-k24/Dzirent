"""Retire legacy provider identities from the live schema without rewriting historical revisions.

Revision ID: 0003_native_identity_boundary
Revises: 0002_studios

Fail safely if old external-provider identities exist: they must be reconciled explicitly
with the account owner, not silently upgraded or turned into password accounts.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_native_identity_boundary"
down_revision: str | None = "0002_studios"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    legacy_count = connection.scalar(
        sa.text("SELECT COUNT(*) FROM users WHERE auth_provider NOT IN ('native', 'mock')")
    )
    if legacy_count:
        raise RuntimeError(
            "Unreconciled legacy identity rows exist; stop and plan their account migration."
        )
    op.drop_constraint(op.f("ck_users_auth_provider"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_auth_provider"),
        "users",
        "auth_provider IN ('native', 'mock')",
    )


def downgrade() -> None:
    connection = op.get_bind()
    native_count = connection.scalar(
        sa.text("SELECT COUNT(*) FROM users WHERE auth_provider = 'native'")
    )
    if native_count:
        raise RuntimeError(
            "First-party accounts exist; do not downgrade the provider constraint without a data plan."
        )
    op.drop_constraint(op.f("ck_users_auth_provider"), "users", type_="check")
    # Restores the original constraint for the already-applied, immutable historical revision.
    op.create_check_constraint(
        op.f("ck_users_auth_provider"),
        "users",
        "auth_provider IN ('clerk', 'mock')",
    )
