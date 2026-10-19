"""Health, dependency failures, CORS, request IDs, error envelopes and log redaction."""

import base64
import json
import logging
from collections.abc import Callable

import pytest
from conftest import SEED_LENDER, error_code, settings_for
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from dzirent_api.main import create_app
from dzirent_api.observability import JsonFormatter, redact

UNREACHABLE_DB = "postgresql+psycopg://dzirent:topsecretpw@127.0.0.1:1/dzirent_api_test"


def test_readiness_checks_database_and_schema(client: TestClient, engine: Engine) -> None:
    assert client.get("/api/v1/health/live").json()["status"] == "live"
    ready = client.get("/api/v1/health/ready")
    assert ready.status_code == 200 and ready.json()["status"] == "ready"
    with engine.begin() as connection:
        connection.execute(text("UPDATE alembic_version SET version_num = 'older'"))
    try:
        stale = client.get("/api/v1/health/ready")
        assert stale.status_code == 503 and error_code(stale) == "schema_not_current"
    finally:
        with engine.begin() as connection:
            connection.execute(
                text("UPDATE alembic_version SET version_num = '0001_phase1_schema'")
            )


def test_database_outage_fails_closed_without_leaking(database_url: str) -> None:
    settings = settings_for(UNREACHABLE_DB, db_connect_timeout_s=1)
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health/live").status_code == 200
        for path in (
            "/api/v1/health/ready",
            "/api/v1/catalog/products",
            "/api/v1/catalog/categories",
        ):
            response = client.get(path)
            assert response.status_code == 503, path
            assert error_code(response) == "dependency_unavailable"
            assert "topsecretpw" not in response.text and "127.0.0.1" not in response.text
        write = client.post("/api/v1/me/bootstrap", headers=SEED_LENDER)
        assert write.status_code == 503 and error_code(write) == "dependency_unavailable"


def test_unconfigured_database_is_unavailable_not_mocked() -> None:
    from dzirent_api.settings import Settings

    app = create_app(Settings(_env_file=None, environment="test", log_level="WARNING"))  # type: ignore[call-arg]
    with TestClient(app) as client:
        for path in ("/api/v1/health/ready", "/api/v1/catalog/products"):
            response = client.get(path)
            assert response.status_code == 503 and error_code(response) == "dependency_unavailable"


def test_cors_allows_only_exact_origins(client: TestClient) -> None:
    allowed = client.options(
        "/api/v1/lender/products",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    assert "access-control-allow-credentials" not in allowed.headers
    for origin in (
        "http://localhost:3000",
        "https://127.0.0.1:3000",
        "http://127.0.0.1:3000.evil.test",
        "null",
    ):
        denied = client.options(
            "/api/v1/catalog/products",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )
        assert "access-control-allow-origin" not in denied.headers, origin
        simple = client.get("/api/v1/catalog/products", headers={"Origin": origin})
        assert "access-control-allow-origin" not in simple.headers, origin
    error = client.get("/api/v1/me", headers={"Origin": "http://127.0.0.1:3000"})
    assert error.status_code == 401
    assert error.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"


def test_request_ids_are_propagated_or_replaced(client: TestClient) -> None:
    echoed = client.get("/api/v1/health/live", headers={"X-Request-ID": "trace-12345678"})
    assert echoed.headers["x-request-id"] == "trace-12345678"
    replaced = client.get("/api/v1/health/live", headers={"X-Request-ID": "bad id\r\nx"})
    assert (
        replaced.headers["x-request-id"] != "bad id\r\nx"
        and len(replaced.headers["x-request-id"]) == 36
    )
    missing = client.get("/api/v1/nowhere", headers={"X-Request-ID": "trace-abcdefgh"})
    assert missing.status_code == 404 and error_code(missing) == "not_found"
    assert missing.json()["request_id"] == "trace-abcdefgh"


def test_framework_errors_use_stable_envelope(client: TestClient) -> None:
    assert error_code(client.put("/api/v1/catalog/products")) == "method_not_allowed"
    bad_json = client.post(
        "/api/v1/me/bootstrap",
        headers={**SEED_LENDER, "Content-Type": "application/json"},
        content=b"{",
    )
    assert bad_json.status_code in (200, 422)
    secret = "sk_live_should_not_echo_123"
    invalid = client.patch("/api/v1/me", headers=SEED_LENDER, json={"display_name": {"x": secret}})
    assert invalid.status_code == 422 and error_code(invalid) == "validation_error"
    assert secret not in invalid.text
    detail = invalid.json()["error"]["details"][0]
    assert set(detail) == {"field", "issue", "message"} and detail["field"] == "body.display_name"


def test_unhandled_errors_return_safe_500(
    database_url: str, db: Engine, caplog: pytest.LogCaptureFixture
) -> None:
    app = create_app(settings_for(database_url))

    @app.get("/api/v1/explode")
    def explode() -> None:
        raise RuntimeError("internal detail postgresql://u:hunter2@db/x")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/explode", headers={"Origin": "http://127.0.0.1:3000"})
    assert response.status_code == 500 and error_code(response) == "internal_error"
    assert "hunter2" not in response.text and "internal detail" not in response.text
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    formatted = [JsonFormatter().format(r) for r in caplog.records if r.name == "dzirent.request"]
    assert formatted and all("hunter2" not in line for line in formatted)


def test_structured_logs_redact_tokens_and_secrets(
    make_client: Callable[..., TestClient], caplog: pytest.LogCaptureFixture
) -> None:
    client = make_client(log_level="INFO")
    caplog.set_level(logging.INFO)
    client.get("/api/v1/me", headers={"Authorization": "Bearer mock:sample-lender"})
    lines = [
        json.loads(JsonFormatter().format(r)) for r in caplog.records if r.name == "dzirent.request"
    ]
    assert lines
    entry = lines[-1]
    assert {
        "ts",
        "level",
        "message",
        "request_id",
        "method",
        "path",
        "status",
        "duration_ms",
    } <= set(entry)
    assert entry["path"] == "/api/v1/me" and "mock:sample-lender" not in json.dumps(lines)
    # A JWT-shaped string built at runtime, so no token-like literal lives in the source.
    jwt_like = ".".join(
        base64.urlsafe_b64encode(part).decode().rstrip("=")
        for part in (b'{"alg":"RS256"}', b'{"sub":"user"}', b"signature")
    )
    raw = (
        f"Authorization: Bearer {jwt_like} url=postgresql+psycopg://dzirent:pw123@db:5432/x "
        "key=sk_test_abc123 -----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----"
    )
    cleaned = redact(raw)
    for secret in (jwt_like, "pw123", "sk_test_abc123", "MIIB"):
        assert secret not in cleaned
