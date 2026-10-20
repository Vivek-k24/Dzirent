"""Local/test photo-quality proxy: forwarding, relaying, limits, outages and production denial.

The upstream is an httpx.MockTransport recording what the proxy forwards; the real ai-quality service is
exercised by its own suite and by the documented cross-process local run. No database is needed.
"""

from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from dzirent_api.dev_photo_quality import MAX_REQUEST_BYTES
from dzirent_api.export_contract import render
from dzirent_api.main import create_app
from dzirent_api.settings import Settings

URL = "http://127.0.0.1:8300"
RESULT = {
    "schema_version": "ai-quality.v0",
    "algorithm_version": "quality-rules-0.1.0",
    "request_id": "trace-12345678",
    "decision": "review",
    "checks": {
        name: {"status": "uncertain", "reason": "x"}
        for name in ("blur", "exposure", "paper", "framing")
    },
    "message": "We could not verify everything automatically.",
}
CLERK = {
    "identity_mode": "clerk",
    "clerk_issuer": "https://clerk.dzirent.test",
    "clerk_authorized_parties": ["https://app.dzirent.test"],
    "clerk_jwt_key": "-----BEGIN PUBLIC KEY-----\nplaceholder\n-----END PUBLIC KEY-----",
}


def make_client(
    handler: Callable[[httpx.Request], httpx.Response] | None, **overrides: Any
) -> TestClient:
    values: dict[str, Any] = {
        "environment": "test",
        "log_level": "WARNING",
        "photo_quality_url": URL,
        **overrides,
    }
    app = create_app(Settings(_env_file=None, **values))  # type: ignore[call-arg]
    if handler is not None:
        app.state.photo_quality_transport = httpx.MockTransport(handler)
    return TestClient(app)


class Upstream:
    def __init__(self, response: httpx.Response | Exception) -> None:
        self.response, self.requests = response, []  # type: list[httpx.Request]

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def upload(
    client: TestClient, data: bytes = b"\xff\xd8\xff" + b"0" * 2048, **headers: str
) -> httpx.Response:
    return client.post(
        "/api/v1/dev/photo-quality",
        files={"image": ("photo.jpg", data, "image/jpeg")},
        headers=headers,
    )


def test_forwards_raw_multipart_to_the_internal_service_and_relays_the_result() -> None:
    upstream = Upstream(httpx.Response(200, json=RESULT))
    with make_client(upstream) as client:
        response = upload(client, **{"X-Request-ID": "trace-12345678"})
    assert response.status_code == 200 and response.json() == RESULT
    forwarded = upstream.requests[0]
    assert str(forwarded.url) == f"{URL}/v1/check" and forwarded.method == "POST"
    assert forwarded.headers["content-type"].startswith("multipart/form-data; boundary=")
    assert forwarded.headers["x-request-id"] == "trace-12345678"
    assert (
        b'name="image"; filename="photo.jpg"' in forwarded.content
        and b"\xff\xd8\xff" in forwarded.content
    )


@pytest.mark.parametrize(
    ("status", "code"),
    [(413, "payload_too_large"), (415, "unsupported_media_type"), (422, "invalid_image")],
)
def test_relays_contract_errors_from_the_service(status: int, code: str) -> None:
    body = {"error": {"code": code, "message": "m", "details": []}, "request_id": "r"}
    with make_client(Upstream(httpx.Response(status, json=body))) as client:
        response = upload(client)
    assert response.status_code == status and response.json() == body


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("refused"),
        httpx.ReadTimeout("slow"),
        httpx.Response(500, text="boom"),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json={"decision": "pass"}),  # wrong shape is never relayed as a result
        httpx.Response(302, headers={"location": "https://example.com/"}),
    ],
)
def test_outages_and_unexpected_replies_are_service_unavailable(
    failure: httpx.Response | Exception,
) -> None:
    with make_client(Upstream(failure)) as client:
        response = upload(client)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


def test_oversized_and_non_multipart_requests_never_reach_the_service() -> None:
    upstream = Upstream(httpx.Response(200, json=RESULT))
    with make_client(upstream) as client:
        declared = client.post(
            "/api/v1/dev/photo-quality",
            content=b"x" * (MAX_REQUEST_BYTES + 1),
            headers={"content-type": "multipart/form-data; boundary=b"},
        )
        assert (
            declared.status_code == 413 and declared.json()["error"]["code"] == "payload_too_large"
        )

        def chunks() -> Iterator[bytes]:
            for _ in range(11):
                yield b"y" * (1024 * 1024)

        streamed = client.post(
            "/api/v1/dev/photo-quality",
            content=chunks(),
            headers={"content-type": "multipart/form-data; boundary=b"},
        )
        assert streamed.status_code == 413
        for body, content_type in (
            (b'{"url": "https://example.com/a.jpg"}', "application/json"),
            (b"raw", "image/jpeg"),
        ):
            wrong = client.post(
                "/api/v1/dev/photo-quality", content=body, headers={"content-type": content_type}
            )
            assert (
                wrong.status_code == 415
                and wrong.json()["error"]["code"] == "unsupported_media_type"
            )
    assert upstream.requests == []


def test_route_is_absent_unless_configured_and_never_in_the_client_contract() -> None:
    with make_client(None, photo_quality_url="") as client:
        assert upload(client).status_code == 404
    assert "/dev/" not in render()


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_deployed_environments_refuse_the_proxy(environment: str) -> None:
    deployed = {
        **CLERK,
        "mode": "connected",
        "environment": environment,
        "database_url": "postgresql://u:p@db/x",
        "cors_origins": ["https://app.dzirent.test"],
    }
    with pytest.raises(ValidationError):
        Settings(_env_file=None, photo_quality_url=URL, **deployed)  # type: ignore[arg-type]
    # Without the setting the deployed app starts, and the experimental route does not exist.
    app = create_app(Settings(_env_file=None, log_level="WARNING", **deployed))  # type: ignore[arg-type]
    with TestClient(app) as client:
        assert upload(client).status_code == 404


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "http://ai-quality.example.com:8300",
        "http://user:pw@127.0.0.1:8300",
        "http://127.0.0.1:8300/v1/check",
        "ftp://127.0.0.1",
        "http://127.0.0.1:8300?x=1",
    ],
)
def test_only_internal_service_urls_are_accepted(url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="test", photo_quality_url=url)  # type: ignore[call-arg]
    for good in ("http://127.0.0.1:8300", "http://localhost:8300/", "http://ai-quality:8300"):
        assert (
            Settings(_env_file=None, environment="test", photo_quality_url=good).photo_quality_url
            == good
        )  # type: ignore[call-arg]
