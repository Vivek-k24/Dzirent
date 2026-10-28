"""Hosted-style privileges simulated only inside the dedicated loopback PG17 container."""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from alembic import command
from conftest import alembic_config, settings_for
from db_safety import safe_test_url
from fastapi.testclient import TestClient
from psycopg import sql
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from test_native_auth import EMAIL, ORIGIN, Mailbox, mutate, verified

from dzirent_api.auth import dispatch, outbox
from dzirent_api.main import create_app
from dzirent_api.orm import Base

ROLES = ("dzirent_migrator", "dzirent_app", "dzirent_unexpected_reader")


@pytest.fixture
def acl(database_url: str) -> Any:
    base = safe_test_url(database_url)
    target = safe_test_url(base.set(database="dzirent_auth62_acl_test"))
    owner = create_engine(
        base.set(database="postgres"), isolation_level="AUTOCOMMIT", hide_parameters=True
    )
    with owner.connect() as connection:
        assert not connection.scalar(
            text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ANY(:names))"),
            {"names": list(ROLES)},
        )
        connection.exec_driver_sql(f'DROP DATABASE IF EXISTS "{target.database}" WITH (FORCE)')
        connection.exec_driver_sql(f'CREATE DATABASE "{target.database}"')
        password = secrets.token_urlsafe(32)
        cursor = connection.connection.driver_connection.cursor()
        try:
            for role in ROLES:
                cursor.execute(
                    sql.SQL(
                        "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}"
                    ).format(sql.Identifier(role), sql.Literal(password))
                )
        except Exception:
            pytest.fail(
                "Local SQL-role setup failed; private statement details suppressed", pytrace=False
            )
        finally:
            cursor.close()
        connection.exec_driver_sql(f'ALTER DATABASE "{target.database}" OWNER TO dzirent_migrator')
    admin = create_engine(target, hide_parameters=True)
    with admin.begin() as connection:
        connection.exec_driver_sql("REVOKE ALL ON SCHEMA public FROM PUBLIC")
        connection.exec_driver_sql("GRANT USAGE, CREATE ON SCHEMA public TO dzirent_migrator")
        connection.exec_driver_sql(
            "GRANT USAGE ON SCHEMA public TO dzirent_app, dzirent_unexpected_reader"
        )
    migrator = target.set(username="dzirent_migrator", password=password)
    runtime = target.set(username="dzirent_app", password=password)
    reader = target.set(username="dzirent_unexpected_reader", password=password)
    config = alembic_config(migrator.render_as_string(hide_password=False))
    command.upgrade(config, "0003_native_identity_boundary")
    migration_engine = create_engine(migrator, hide_parameters=True)
    with migration_engine.begin() as connection:
        # Prove a future broad default grant cannot expose auth material to another role.
        connection.exec_driver_sql(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dzirent_unexpected_reader"
        )
    command.upgrade(config, "head")
    with migration_engine.begin() as connection:
        for table in Base.metadata.tables:
            if table == "media_uploads" or table.startswith(("auth_", "platform_admin_")):
                continue
            connection.exec_driver_sql(
                f'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "{table}" TO dzirent_app'
            )
        connection.exec_driver_sql("GRANT SELECT ON alembic_version TO dzirent_app")
    app_engine = create_engine(runtime, hide_parameters=True)
    reader_engine = create_engine(reader, hide_parameters=True)
    try:
        yield {
            "admin": admin,
            "app": app_engine,
            "reader": reader_engine,
            "url": runtime.render_as_string(hide_password=False),
        }
    finally:
        for engine in (reader_engine, app_engine, migration_engine, admin):
            engine.dispose()
        with owner.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{target.database}" WITH (FORCE)')
            for role in reversed(ROLES):
                connection.exec_driver_sql(f'DROP ROLE "{role}"')
        owner.dispose()


def test_runtime_denials_and_ownership(acl: Any) -> None:
    with acl["app"].connect() as connection:
        assert connection.scalar(text("SELECT current_user")) == "dzirent_app"
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version"))
            == "0006_lender_media_uploads"
        )
    with acl["admin"].connect() as connection:
        assert set(
            connection.execute(
                text(
                    "SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'auth_%'"
                )
            ).scalars()
        ) == {"dzirent_migrator"}
    for statement in (
        "CREATE TABLE forbidden_auth62 (id integer)",
        "UPDATE alembic_version SET version_num = version_num",
        "UPDATE auth_credentials SET email_normalized = email_normalized",
        "UPDATE auth_credentials SET synthetic = synthetic",
        "UPDATE auth_credentials SET user_id = user_id",
        "UPDATE auth_credentials SET created_at = created_at",
        "UPDATE auth_sessions SET expires_at = expires_at",
        "UPDATE auth_sessions SET token_hash = token_hash",
        "UPDATE auth_rate_limits SET key_hash = key_hash",
        "UPDATE platform_admin_grants SET revoked_at = revoked_at",
        "SELECT * FROM platform_admin_events",
        "DELETE FROM auth_tokens",
        "UPDATE auth_email_outbox SET key_id = key_id",
        "UPDATE auth_email_outbox SET expires_at = expires_at",
        "UPDATE auth_email_outbox SET token_id = token_id",
        "UPDATE auth_email_outbox SET user_id = user_id",
        "UPDATE auth_email_outbox SET purpose = purpose",
        "UPDATE auth_email_outbox SET created_at = created_at",
    ):
        with acl["app"].begin() as connection, pytest.raises(ProgrammingError):
            connection.exec_driver_sql(statement)


def test_default_grants_cannot_expose_new_auth_tables(acl: Any) -> None:
    for table in (
        "auth_credentials",
        "auth_sessions",
        "auth_tokens",
        "auth_rate_limits",
        "platform_admin_grants",
        "platform_admin_events",
        "auth_email_outbox",
    ):
        with acl["reader"].begin() as connection, pytest.raises(ProgrammingError):
            connection.exec_driver_sql(f'SELECT * FROM "{table}"')


def test_real_runtime_native_flow_has_required_column_grants(
    acl: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    mailbox = Mailbox(acl["admin"])
    monkeypatch.setattr(dispatch, "email_delivery", lambda settings: mailbox)
    monkeypatch.setattr(outbox, "email_delivery", lambda settings: mailbox)
    settings = settings_for(
        acl["url"],
        mode="connected",
        identity_mode="native",
        auth_web_origin=ORIGIN,
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth64@dzirent.com",
    )
    password = SecretStr(secrets.token_urlsafe(24))
    with TestClient(create_app(settings)) as client:
        result = verified(client, mailbox, password)
        assert result.json()["email_verified"] is True
        assert client.get("/api/v1/me").json()["email"] == EMAIL
        assert client.get("/api/v1/admin/access").status_code == 403
        assert (
            mutate(
                client,
                "/auth/password/change",
                {
                    "current_password": password.get_secret_value(),
                    "new_password": secrets.token_urlsafe(24),
                },
            ).status_code
            == 200
        )
        assert mutate(client, "/auth/logout").status_code == 204
        # The runtime's narrowly scoped DELETE grant enables bounded ephemeral cleanup,
        # without permitting deletion of credentials or tokens.
        worker = dispatch.DeliveryDispatcher(
            client.app.state.sessionmaker,
            settings,
            clock=lambda: datetime.now(UTC) + timedelta(days=8),
        )
        worker.cleanup()
        with acl["app"].connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM auth_email_outbox")) == 0
            assert connection.scalar(text("SELECT count(*) FROM auth_credentials")) == 1
