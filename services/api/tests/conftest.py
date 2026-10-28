"""Integration fixtures against a disposable PostgreSQL database.

Only validated single-loopback PG17 targets and safe, non-staging *_test identifiers
may be dropped/recreated. Overrides fail before connection. DB tests fail rather than
skip when DZIRENT_REQUIRE_DB_TESTS=1.
"""

import json
import os
import secrets
import smtplib
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from db_safety import safe_test_url
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from dzirent_api.db import normalize_url, session_factory
from dzirent_api.main import create_app
from dzirent_api.seed import seed
from dzirent_api.settings import Settings

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
FIXTURES = REPO_ROOT / "fixtures/catalog"
TAXONOMY = json.loads((FIXTURES / "taxonomy.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
EXAMPLES = {
    case["operation_id"]: case
    for case in json.loads((FIXTURES / "examples.json").read_text(encoding="utf-8"))["cases"]
}
MAIL_KEY = secrets.token_urlsafe(32)
CSRF_KEY = secrets.token_urlsafe(32)


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch: pytest.MonkeyPatch) -> None:
    def blocked(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("Real SMTP is forbidden in local tests")

    monkeypatch.setattr(smtplib, "SMTP", blocked)
    monkeypatch.setattr(smtplib, "SMTP_SSL", blocked)


SEED_LENDER = {"Authorization": "Bearer mock:sample-lender"}
PRODUCTS_PATH_EXAMPLE = f"/api/v1/lender/products/{MANIFEST['products'][1]['id']}"


def auth(subject: str) -> dict[str, str]:
    return {"Authorization": f"Bearer mock:{subject}"}


def alembic_config(url: str) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.attributes["url"] = url
    config.attributes["skip_logging"] = True
    return config


@pytest.fixture(scope="session")
def database_url() -> str:
    url = os.environ.get("DZIRENT_TEST_DATABASE_URL", "")
    if not url:
        message = "Set DZIRENT_TEST_DATABASE_URL to a disposable *_test PostgreSQL database"
        if os.environ.get("DZIRENT_REQUIRE_DB_TESTS") == "1":
            pytest.fail(message)
        pytest.skip(message)
    try:
        parsed = safe_test_url(normalize_url(url))
    except ValueError as exc:
        pytest.fail(str(exc))
    print(
        f"Local destructive test target: host={parsed.host} port={parsed.port} database={parsed.database} role={parsed.username}"
    )
    url = parsed.render_as_string(hide_password=False)
    admin = create_engine(
        parsed.set(database="postgres"), isolation_level="AUTOCOMMIT", hide_parameters=True
    )
    with admin.connect() as connection:
        version = int(connection.execute(text("SHOW server_version_num")).scalar_one())
        if version // 10000 != 17:
            pytest.fail("Destructive integration tests require local PostgreSQL 17")
        database, role = connection.execute(text("SELECT current_database(), current_user")).one()
        if database != "postgres" or role != parsed.username:
            pytest.fail("Connected admin target differs from the validated local target")
        connection.execute(text(f'DROP DATABASE IF EXISTS "{parsed.database}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{parsed.database}"'))
    admin.dispose()
    command.upgrade(alembic_config(url), "head")
    return url


@pytest.fixture(scope="session")
def engine(database_url: str) -> Iterator[Engine]:
    engine = create_engine(database_url, hide_parameters=True)
    yield engine
    engine.dispose()


def reset(engine: Engine) -> None:
    safe_test_url(engine.url)
    with engine.begin() as connection:
        tables = connection.execute(
            text(
                "SELECT string_agg(quote_ident(tablename), ', ') FROM pg_tables "
                "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
            )
        ).scalar()
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))
    with session_factory(engine)() as session, session.begin():
        seed(session)


@pytest.fixture
def db(engine: Engine) -> Engine:
    reset(engine)
    return engine


def settings_for(database_url: str, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "mode": "demo",
        "environment": "test",
        "identity_mode": "mock",
        "database_url": database_url,
        "cors_origins": ["http://127.0.0.1:3000"],
        "log_level": "WARNING",
        "auth_csrf_key": CSRF_KEY,
        "auth_email_worker_enabled": False,
        "auth_outbox_active_key_id": "local64",
        "auth_outbox_keys": json.dumps({"local64": MAIL_KEY}),
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture
def make_client(database_url: str, db: Engine) -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def factory(**overrides: Any) -> TestClient:
        base_url = overrides.pop("client_base_url", "http://testserver")
        client = TestClient(create_app(settings_for(database_url, **overrides)), base_url=base_url)
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


def enroll(client: TestClient, subject: str, metro_slug: str = "houston") -> dict[str, str]:
    headers = auth(subject)
    assert client.post("/api/v1/me/bootstrap", headers=headers).status_code == 200
    metro = next(m for m in TAXONOMY["locations"]["items"] if m["slug"] == metro_slug)
    response = client.post(
        "/api/v1/me/lender-profile",
        headers=headers,
        json={"display_name": f"{subject} closet", "metro_id": metro["id"]},
    )
    assert response.status_code == 200, response.text
    return headers


def write_body(**overrides: Any) -> dict[str, Any]:
    body = dict(EXAMPLES["createLenderProduct"]["request"]["body"])
    body.update(overrides)
    return body


def error_code(response: Any) -> str:
    body = response.json()
    assert set(body) == {"error", "request_id"}, body
    assert set(body["error"]) == {"code", "message", "details"}, body
    assert body["request_id"] == response.headers["x-request-id"]
    return str(body["error"]["code"])
