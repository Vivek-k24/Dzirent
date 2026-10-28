"""Disposable loopback-only browser harness, never imported or shipped by the API.

Creates its own safe *_test database on a pre-existing local PG17 service. Refuses
existing database/roles; drops only what this process created when it exits. Mail
stays in memory. The private control endpoint is deliberately absent from the BFF
allowlist and rejects browser Origins. No cloud credentials or mail transport.
"""

# ruff: noqa: E402
# Test helpers are imported only after the repository-local tests path is installed.

import hmac
import os
import secrets
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api/tests"))

from alembic import command
from conftest import alembic_config
from db_safety import safe_test_url
from psycopg import sql
from sqlalchemy import create_engine, text
from starlette.requests import Request
from starlette.responses import JSONResponse, RedirectResponse
from test_native_auth import Mailbox

from dzirent_api.auth import router, service
from dzirent_api.db import session_factory
from dzirent_api.main import create_app
from dzirent_api.orm import Base
from dzirent_api.seed import seed
from dzirent_api.settings import Settings

ROLES = ("dzirent_migrator", "dzirent_app")
ORIGIN = "http://127.0.0.1:3500"


class Harness:
    def __init__(self, app: Any, mailbox: Mailbox, key: str) -> None:
        self.app, self.mailbox, self.key = app, mailbox, key
        self.mode = "normal"
        self.observed: dict[str, Any] = {}
        self.shutdown: Callable[[], None] = lambda: None

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        path = request.url.path
        if path == "/_auth62/control":
            if (
                request.client is None
                or request.client.host != "127.0.0.1"
                or request.headers.get("origin") is not None
                or not hmac.compare_digest(request.headers.get("x-auth62-control", ""), self.key)
            ):
                await JSONResponse({}, status_code=403)(scope, receive, send)
                return
            if request.method == "POST":
                self.mode = (await request.json())["mode"]
                if self.mode == "stop":
                    self.shutdown()
                result: dict[str, Any] = {"ready": True}
            elif request.query_params.get("email"):
                assert self.app.state.auth_delivery.drain()
                result = {
                    "token": self.mailbox.token(
                        request.query_params.get("purpose", "verify_email"),
                        request.query_params["email"],
                    )
                }
            else:
                result = {"ready": True, "observed": self.observed}
            await JSONResponse(result, headers={"Cache-Control": "no-store"})(scope, receive, send)
            return
        if path == "/api/v1/catalog/facets" and self.mode == "redirect":
            await RedirectResponse("/api/v1/health/live", status_code=307)(scope, receive, send)
            return
        if path == "/api/v1/auth/session" and self.mode == "offline":
            await JSONResponse(
                {
                    "error": {
                        "code": "dependency_unavailable",
                        "message": "Local test outage",
                        "details": [],
                    },
                    "request_id": "local-test",
                },
                status_code=503,
            )(scope, receive, send)
            return
        if path == "/api/v1/me":
            self.observed = {
                "forbidden_headers": [
                    name
                    for name in ("authorization", "x-user-id", "x-role", "x-forwarded-for")
                    if name in request.headers
                ],
                "cookie_names": [
                    item.split("=", 1)[0].strip()
                    for item in request.headers.get("cookie", "").split(";")
                    if item
                ],
            }
        await self.app(scope, receive, send)


def run() -> None:
    if (
        os.environ.get("DZIRENT_ENVIRONMENT") != "test"
        or os.environ.get("DZIRENT_REQUIRE_DB_TESTS") != "1"
    ):
        raise RuntimeError("Local test environment is required")
    control = os.environ.get("DZIRENT_AUTH62_CONTROL", "")
    if len(control) < 32:
        raise RuntimeError("Private local control key is required")
    base = safe_test_url(os.environ["DZIRENT_TEST_DATABASE_URL"])
    target = safe_test_url(base.set(database="dzirent_auth62_browser_test"))
    admin = create_engine(
        base.set(database="postgres"), isolation_level="AUTOCOMMIT", hide_parameters=True
    )
    created_database = False
    created_roles: list[str] = []
    engines = []
    try:
        with admin.connect() as connection:
            assert int(connection.scalar(text("SHOW server_version_num"))) // 10000 == 17
            assert connection.scalar(text("SELECT current_user")) == base.username
            assert not connection.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname=:name)"),
                {"name": target.database},
            )
            assert not connection.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=ANY(:names))"),
                {"names": list(ROLES)},
            )
            print(
                f"Local browser DB: host={target.host} port={target.port} database={target.database} role=dzirent_app",
                flush=True,
            )
            connection.exec_driver_sql(f'CREATE DATABASE "{target.database}"')
            created_database = True
            password = secrets.token_urlsafe(32)
            with connection.connection.driver_connection.cursor() as cursor:
                for role in ROLES:
                    cursor.execute(
                        sql.SQL(
                            "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD {}"
                        ).format(sql.Identifier(role), sql.Literal(password))
                    )
                    created_roles.append(role)
            connection.exec_driver_sql(
                f'ALTER DATABASE "{target.database}" OWNER TO dzirent_migrator'
            )
        owner = create_engine(target, hide_parameters=True)
        engines.append(owner)
        with owner.begin() as connection:
            connection.exec_driver_sql("REVOKE ALL ON SCHEMA public FROM PUBLIC")
            connection.exec_driver_sql("GRANT USAGE, CREATE ON SCHEMA public TO dzirent_migrator")
            connection.exec_driver_sql("GRANT USAGE ON SCHEMA public TO dzirent_app")
        migrator_url = target.set(username="dzirent_migrator", password=password)
        runtime_url = target.set(username="dzirent_app", password=password)
        command.upgrade(alembic_config(migrator_url.render_as_string(hide_password=False)), "head")
        migrator = create_engine(migrator_url, hide_parameters=True)
        engines.append(migrator)
        with session_factory(migrator).begin() as session:
            seed(session)
        with migrator.begin() as connection:
            for table in Base.metadata.tables:
                if not table.startswith(("auth_", "platform_admin_")):
                    connection.exec_driver_sql(
                        f'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "{table}" TO dzirent_app'
                    )
            connection.exec_driver_sql("GRANT SELECT ON alembic_version TO dzirent_app")
        settings = Settings(
            _env_file=None,
            mode="connected",
            environment="test",
            identity_mode="native",
            database_url=runtime_url.render_as_string(hide_password=False),
            auth_web_origin=ORIGIN,
            cors_origins=[ORIGIN],
            log_level="WARNING",
            auth_email_backend="smtp",
            auth_smtp_host="unused.localhost",
            auth_email_sender="local-auth62@dzirent.com",
        )
        mailbox = Mailbox(owner)
        service.email_delivery = lambda _: mailbox
        router.email_delivery = lambda _: mailbox
        app = create_app(settings)
        import uvicorn

        harness = Harness(app, mailbox, control)
        server = uvicorn.Server(
            uvicorn.Config(
                harness, host="127.0.0.1", port=8500, access_log=False, log_level="warning"
            )
        )
        harness.shutdown = lambda: setattr(server, "should_exit", True)
        server.run()
    finally:
        for engine in reversed(engines):
            engine.dispose()
        with admin.connect() as connection:
            if created_database:
                safe_test_url(target)
                connection.exec_driver_sql(f'DROP DATABASE "{target.database}" WITH (FORCE)')
            for role in reversed(created_roles):
                connection.exec_driver_sql(f'DROP ROLE "{role}"')
        admin.dispose()


if __name__ == "__main__":
    try:
        run()
    except Exception:
        raise SystemExit(
            "Local browser harness failed; private connection/mail details suppressed."
        ) from None
