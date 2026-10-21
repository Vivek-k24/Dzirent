"""Local/test garment-measure proxy: forwarding, relaying, limits, outages and production denial.

The upstream is an httpx.MockTransport recording what the proxy forwards; the real ai-measure service is
exercised by its own suite and by the documented cross-process local run. No database is needed.
"""

import json
from collections.abc import Callable, Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from dzirent_api.dev_garment_measure import MAX_REQUEST_BYTES
from dzirent_api.export_contract import render
from dzirent_api.main import create_app
from dzirent_api.settings import Settings

URL = "http://127.0.0.1:8310"
ANNOTATION = json.dumps(
    {
        "schema_version": "ai-measure.v0",
        "garment_class": "sleeved_top",
        "reference": {"type": "us_letter", "user_confirmed": True, "corners_px": [[1, 1]] * 4},
        "landmarks": [],
    }
)
RESULT = {
    "schema_version": "ai-measure.v0",
    "algorithm_version": "paper-homography-0.1.0",
    "request_id": "trace-12345678",
    "garment_class": "sleeved_top",
    "calibration_status": "uncertain",
    "method": "paper_homography_and_landmarks",
    "confirmed_by_lender": False,
    "measurements": {
        "chest_flat_cm": {"key": "chest_flat_cm", "status": "estimated", "value_cm": 50.0}
    },
    "cautions": ["All values are estimates."],
    "message": "Calibration is uncertain.",
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
        "garment_measure_url": URL,
        **overrides,
    }
    app = create_app(Settings(_env_file=None, **values))  # type: ignore[call-arg]
    if handler is not None:
        app.state.garment_measure_transport = httpx.MockTransport(handler)
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
        "/api/v1/dev/garment-measure",
        files={"image": ("photo.jpg", data, "image/jpeg")},
        data={"annotation": ANNOTATION},
        headers=headers,
    )


def test_forwards_photo_and_annotation_to_the_internal_service_and_relays_the_result() -> None:
    upstream = Upstream(httpx.Response(200, json=RESULT))
    with make_client(upstream) as client:
        response = upload(client, **{"X-Request-ID": "trace-12345678"})
    assert response.status_code == 200 and response.json() == RESULT
    forwarded = upstream.requests[0]
    assert str(forwarded.url) == f"{URL}/v1/measure" and forwarded.method == "POST"
    assert forwarded.headers["content-type"].startswith("multipart/form-data; boundary=")
    assert forwarded.headers["x-request-id"] == "trace-12345678"
    assert b'name="image"; filename="photo.jpg"' in forwarded.content
    assert b'name="annotation"' in forwarded.content and b"ai-measure.v0" in forwarded.content


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (413, "payload_too_large"),
        (415, "unsupported_media_type"),
        (422, "invalid_payload"),
        (422, "invalid_geometry"),
        (422, "unsupported_garment_class"),
    ],
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
        httpx.Response(200, json={"shoulder_width_cm": 44.0}),  # wrong shape is never relayed
        httpx.Response(200, json={**RESULT, "schema_version": "ai-quality.v0"}),  # other service
        httpx.Response(200, json={**RESULT, "calibration_status": "great"}),
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
            "/api/v1/dev/garment-measure",
            content=b"x" * (MAX_REQUEST_BYTES + 1),
            headers={"content-type": "multipart/form-data; boundary=b"},
        )
        assert declared.status_code == 413
        assert declared.json()["error"]["code"] == "payload_too_large"

        def chunks() -> Iterator[bytes]:
            for _ in range(11):
                yield b"y" * (1024 * 1024)

        streamed = client.post(
            "/api/v1/dev/garment-measure",
            content=chunks(),
            headers={"content-type": "multipart/form-data; boundary=b"},
        )
        assert streamed.status_code == 413
        for body, content_type in (
            (b'{"url": "https://example.com/a.jpg"}', "application/json"),
            (ANNOTATION.encode(), "application/json"),
            (b"raw", "image/jpeg"),
        ):
            wrong = client.post(
                "/api/v1/dev/garment-measure", content=body, headers={"content-type": content_type}
            )
            assert wrong.status_code == 415
            assert wrong.json()["error"]["code"] == "unsupported_media_type"
    assert upstream.requests == []


def test_route_is_absent_unless_configured_and_never_in_the_client_contract() -> None:
    with make_client(None, garment_measure_url="") as client:
        assert upload(client).status_code == 404
    assert "garment-measure" not in render() and "/dev/" not in render()


def test_garment_measure_and_photo_quality_proxies_are_configured_independently() -> None:
    upstream = Upstream(httpx.Response(200, json=RESULT))
    with make_client(upstream) as client:
        photo_quality = client.post(
            "/api/v1/dev/photo-quality", files={"image": ("p.jpg", b"\xff\xd8\xff", "image/jpeg")}
        )
    assert photo_quality.status_code == 404 and upstream.requests == []


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
        Settings(_env_file=None, garment_measure_url=URL, **deployed)  # type: ignore[arg-type]
    # Without the setting the deployed app starts, and the experimental route does not exist.
    app = create_app(Settings(_env_file=None, log_level="WARNING", **deployed))  # type: ignore[arg-type]
    with TestClient(app) as client:
        assert upload(client).status_code == 404


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "http://ai-measure.example.com:8310",
        "http://user:pw@127.0.0.1:8310",
        "http://127.0.0.1:8310/v1/measure",
        "ftp://127.0.0.1",
        "http://127.0.0.1:8310?x=1",
        "http://10.0.0.5.nip.io:8310",
    ],
)
def test_only_internal_service_urls_are_accepted(url: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="test", garment_measure_url=url)  # type: ignore[call-arg]
    for good in ("http://127.0.0.1:8310", "http://localhost:8310/", "http://ai-measure:8310"):
        settings = Settings(_env_file=None, environment="test", garment_measure_url=good)  # type: ignore[call-arg]
        assert settings.garment_measure_url == good
