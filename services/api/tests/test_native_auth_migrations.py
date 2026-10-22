"""Safe upgrade from deployed 0002 and preservation guards in an auxiliary local DB."""

from typing import Any
from uuid import uuid4

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from conftest import alembic_config
from db_safety import safe_test_url
from sqlalchemy import create_engine, inspect, text

from dzirent_api.orm import Base


@pytest.fixture
def migration_db(database_url: str) -> Any:
    url = safe_test_url(safe_test_url(database_url).set(database="dzirent_auth62_migration_test"))
    admin = create_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT", hide_parameters=True
    )
    with admin.connect() as connection:
        connection.exec_driver_sql(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)')
        connection.exec_driver_sql(f'CREATE DATABASE "{url.database}"')
    engine = create_engine(url, hide_parameters=True)
    try:
        yield engine, alembic_config(url.render_as_string(hide_password=False))
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{url.database}" WITH (FORCE)')
        admin.dispose()


def test_upgrade_from_0002_preserves_mock_without_credentials(migration_db: Any) -> None:
    engine, config = migration_db
    command.upgrade(config, "0002_studios")
    user_id = uuid4()
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users(id,auth_provider,auth_subject,email,display_name,status) VALUES(:id,'mock','local-legacy','legacy@example.com','Legacy','active')"
            ),
            {"id": user_id},
        )
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version")) == "0004_native_auth"
        )
        assert (
            connection.scalar(text("SELECT auth_provider FROM users WHERE id=:id"), {"id": user_id})
            == "mock"
        )
        assert connection.scalar(text("SELECT count(*) FROM auth_credentials")) == 0
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    command.downgrade(config, "0003_native_identity_boundary")
    assert "auth_credentials" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")


def test_legacy_provider_blocks_upgrade_without_rewriting_identity(migration_db: Any) -> None:
    engine, config = migration_db
    command.upgrade(config, "0002_studios")
    user_id = uuid4()
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users(id,auth_provider,auth_subject,email,display_name,status) VALUES(:id,'clerk','unreconciled-local','legacy@example.com','Legacy','active')"
            ),
            {"id": user_id},
        )
    with pytest.raises(RuntimeError, match="Unreconciled legacy identity"):
        command.upgrade(config, "head")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0002_studios"
        assert (
            connection.scalar(text("SELECT auth_provider FROM users WHERE id=:id"), {"id": user_id})
            == "clerk"
        )
    assert "auth_credentials" not in inspect(engine).get_table_names()


@pytest.mark.parametrize(
    "table",
    [
        "auth_credentials",
        "auth_sessions",
        "auth_tokens",
        "platform_admin_grants",
        "platform_admin_events",
    ],
)
def test_native_data_refuses_destructive_downgrade(migration_db: Any, table: str) -> None:
    from dzirent_api.auth.crypto import hash_password, new_token

    engine, config = migration_db
    command.upgrade(config, "head")
    user_id, row_id = uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users(id,auth_provider,auth_subject,email,display_name,status) VALUES(:id,'native',:subject,'local@example.com','Local','active')"
            ),
            {"id": user_id, "subject": str(user_id)},
        )
        if table == "auth_credentials":
            connection.execute(
                text(
                    "INSERT INTO auth_credentials(user_id,email_normalized,password_hash) VALUES(:id,'local@example.com',:hash)"
                ),
                {"id": user_id, "hash": hash_password(new_token())},
            )
        elif table in {"auth_sessions", "auth_tokens"}:
            purpose = ",purpose" if table == "auth_tokens" else ""
            purpose_value = ",'verify_email'" if table == "auth_tokens" else ""
            connection.execute(
                text(
                    f"INSERT INTO {table}(id,user_id,token_hash,expires_at{purpose}) VALUES(:row,:id,:hash,now()+interval '1 hour'{purpose_value})"
                ),
                {"row": row_id, "id": user_id, "hash": "1" * 64},
            )
        else:
            connection.execute(
                text(
                    "INSERT INTO platform_admin_grants(id,user_id,capability) VALUES(:row,:id,'operations:access')"
                ),
                {"row": row_id, "id": user_id},
            )
            if table == "platform_admin_events":
                connection.execute(
                    text(
                        "INSERT INTO platform_admin_events(id,grant_id,action,operator,reason,evidence_sha256) VALUES(:id,:grant,'grant','local-test','fabricated-only',:hash)"
                    ),
                    {"id": uuid4(), "grant": row_id, "hash": "2" * 64},
                )
    with pytest.raises(RuntimeError, match="preservation plan"):
        command.downgrade(config, "0003_native_identity_boundary")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version")) == "0004_native_auth"
        )
        assert connection.scalar(text(f"SELECT count(*) FROM {table}")) == 1
