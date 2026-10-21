"""Local/test paper-calibration proxy (POST /api/v1/dev/paper-calibrate), AI-MEASURE-2 Phase 2A.

Proxy unit tests: the internal ai-measure service is replaced by an in-memory httpx.MockTransport that
records exactly what the proxy forwards. They prove the monolith's forwarding, relaying, limits and
fail-closed rules only. The real paper-snap algorithm has its own suite in services/ai-measure, and the
real browser -> FastAPI -> OpenCV path is Phase 2B.
"""

import copy
import json
import logging
import tempfile
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
ROUTE = "/api/v1/dev/paper-calibrate"
BOUNDARY = "dzirent-paper-boundary"
# Markers that must never appear in logs: EXIF/GPS-like bytes inside the image and raw corner values.
EXIF_MARKER = b"Exif\x00\x00GPS-SECRET-LATITUDE"
JPEG = b"\xff\xd8\xff\xe1\x00\x20" + EXIF_MARKER + b"\x00" * 2048 + b"\xff\xd9"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + b"\x00" * 2048
ANNOTATION = json.dumps(
    {
        "schema_version": "paper-calibrate.v0",
        "reference_type": "us_letter",
        "approx_corners_px": [[404.125, 35.0], [610.0, 152.0], [526.0, 421.0], [287.0, 322.0]],
    },
    separators=(",", ":"),
)
SNAPPED = {
    "schema_version": "paper-calibrate.v0",
    "algorithm_version": "roi-paper-snap-0.1.0",
    "request_id": "trace-paper-0001",
    "detection_status": "snapped",
    "reference_type": "us_letter",
    "proposed_corners_px": [[394.9, 42.1], [615.7, 143.4], [519.1, 414.7], [295.3, 331.1]],
    "calibration_status": "valid",
    "reason_codes": ["manual_corner_confirmation_required"],
    "requires_user_confirmation": True,
}
CONTRACT_KEYS = set(SNAPPED)
CLERK = {
    "identity_mode": "clerk",
    "clerk_issuer": "https://clerk.dzirent.test",
    "clerk_authorized_parties": ["https://app.dzirent.test"],
    "clerk_jwt_key": "-----BEGIN PUBLIC KEY-----\nplaceholder\n-----END PUBLIC KEY-----",
}


def no_snap(status: str, *reasons: str) -> dict[str, Any]:
    return {
        **SNAPPED,
        "detection_status": status,
        "proposed_corners_px": None,
        "calibration_status": None,
        "reason_codes": [*reasons, "manual_corners_unchanged"],
    }


def multipart(image: bytes, mime: str, filename: str, annotation: str = ANNOTATION) -> bytes:
    return (
        (
            f'--{BOUNDARY}\r\nContent-Disposition: form-data; name="image"; filename="{filename}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
        + image
        + (
            f'\r\n--{BOUNDARY}\r\nContent-Disposition: form-data; name="annotation"\r\n\r\n'
            f"{annotation}\r\n--{BOUNDARY}--\r\n"
        ).encode()
    )


CONTENT_TYPE = f"multipart/form-data; boundary={BOUNDARY}"
BODY = multipart(JPEG, "image/jpeg", "photo.jpg")


class Upstream:
    """Records forwarded requests and answers with a fixed response or raises a transport error."""

    def __init__(self, response: httpx.Response | Exception) -> None:
        self.response, self.requests = response, []  # type: list[httpx.Request]

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def make_client(
    handler: Callable[[httpx.Request], httpx.Response] | None, **overrides: Any
) -> TestClient:
    values: dict[str, Any] = {
        "environment": "test",
        "log_level": "INFO",
        "garment_measure_url": URL,
        **overrides,
    }
    app = create_app(Settings(_env_file=None, **values))  # type: ignore[call-arg]
    if handler is not None:
        app.state.garment_measure_transport = httpx.MockTransport(handler)
    return TestClient(app)


def calibrate(client: TestClient, body: bytes = BODY, **headers: str) -> httpx.Response:
    return client.post(ROUTE, content=body, headers={"content-type": CONTENT_TYPE, **headers})


def error_code(response: httpx.Response) -> str:
    body = response.json()
    assert set(body) == {"error", "request_id"}
    return str(body["error"]["code"])


# 1. Forwarding ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("image", "mime", "filename"),
    [(JPEG, "image/jpeg", "photo.jpg"), (PNG, "image/png", "photo.png")],
    ids=["jpeg", "png"],
)
def test_forwards_the_exact_multipart_body_to_calibrate_paper(
    image: bytes, mime: str, filename: str
) -> None:
    body = multipart(image, mime, filename)
    upstream = Upstream(httpx.Response(200, json=SNAPPED))
    with make_client(upstream) as client:
        response = calibrate(client, body, **{"X-Request-ID": "trace-paper-0001"})
    assert response.status_code == 200
    [forwarded] = upstream.requests
    assert forwarded.method == "POST" and str(forwarded.url) == f"{URL}/v1/calibrate-paper"
    assert forwarded.headers["content-type"] == CONTENT_TYPE
    # Byte-for-byte: the image and the exact annotation JSON reach the service unparsed.
    assert forwarded.content == body
    assert ANNOTATION.encode() in forwarded.content and image in forwarded.content


def test_caller_cannot_redirect_the_proxy_or_smuggle_credentials_upstream() -> None:
    upstream = Upstream(httpx.Response(200, json=SNAPPED))
    with make_client(upstream) as client:
        response = client.post(
            f"{ROUTE}?url=https://attacker.example/v1/calibrate-paper&target=http://169.254.169.254/",
            content=BODY,
            headers={
                "content-type": CONTENT_TYPE,
                "x-forwarded-host": "attacker.example",
                "x-target-url": "https://attacker.example/",
                "authorization": "Bearer caller-token",
                "cookie": "session=caller-cookie",
            },
        )
    assert response.status_code == 200
    [forwarded] = upstream.requests
    assert str(forwarded.url) == f"{URL}/v1/calibrate-paper"
    for header in ("authorization", "cookie", "x-forwarded-host", "x-target-url"):
        assert header not in forwarded.headers


def test_upstream_redirects_are_not_followed() -> None:
    upstream = Upstream(httpx.Response(307, headers={"location": "https://attacker.example/x"}))
    with make_client(upstream) as client:
        response = calibrate(client)
    assert response.status_code == 503 and error_code(response) == "service_unavailable"
    assert len(upstream.requests) == 1  # the redirect target was never requested


# 2-3. Relaying contract-shaped results ---------------------------------------------------------


def test_snapped_proposal_is_relayed_as_an_unconfirmed_suggestion() -> None:
    with make_client(Upstream(httpx.Response(200, json=SNAPPED))) as client:
        response = calibrate(client, **{"X-Request-ID": "trace-paper-0001"})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == CONTRACT_KEYS
    assert body["schema_version"] == "paper-calibrate.v0"
    assert body["detection_status"] == "snapped" and body["calibration_status"] == "valid"
    assert body["requires_user_confirmation"] is True
    # Corners keep the service's TL, TR, BR, BL order and intrinsic-pixel values exactly.
    assert body["proposed_corners_px"] == SNAPPED["proposed_corners_px"]
    assert body["reason_codes"] == ["manual_corner_confirmation_required"]


@pytest.mark.parametrize(
    "result",
    [
        no_snap("not_found", "low_contrast_with_background"),
        no_snap("ambiguous", "multiple_candidates"),
        no_snap("invalid", "paper_corner_out_of_frame"),
    ],
    ids=["not_found", "ambiguous", "invalid"],
)
def test_honest_no_snap_outcomes_are_200_with_null_corners(result: dict[str, Any]) -> None:
    with make_client(Upstream(httpx.Response(200, json=result))) as client:
        response = calibrate(client)
    assert response.status_code == 200
    body = response.json()
    assert body["detection_status"] == result["detection_status"]
    assert body["proposed_corners_px"] is None and body["calibration_status"] is None
    assert body["requires_user_confirmation"] is True
    assert "manual_corners_unchanged" in body["reason_codes"]


def test_upstream_claims_outside_the_contract_are_not_relayed() -> None:
    # Pixels cannot prove the sheet's physical size; an invented claim must not reach the browser.
    claimed = {**SNAPPED, "paper_size_verified": True, "certified_us_letter": True}
    with make_client(Upstream(httpx.Response(200, json=claimed))) as client:
        response = calibrate(client)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == CONTRACT_KEYS
    assert "paper_size_verified" not in body and "certified_us_letter" not in body


# 4. Limits, relayed errors and fail-closed ------------------------------------------------------


def test_oversized_and_non_multipart_requests_never_reach_the_service() -> None:
    upstream = Upstream(httpx.Response(200, json=SNAPPED))
    with make_client(upstream) as client:
        declared = client.post(
            ROUTE,
            content=b"x" * (MAX_REQUEST_BYTES + 1),
            headers={"content-type": CONTENT_TYPE},
        )
        assert declared.status_code == 413 and error_code(declared) == "payload_too_large"

        def chunks() -> Iterator[bytes]:
            for _ in range(11):
                yield b"y" * (1024 * 1024)

        streamed = client.post(ROUTE, content=chunks(), headers={"content-type": CONTENT_TYPE})
        assert streamed.status_code == 413 and error_code(streamed) == "payload_too_large"
        for body, content_type in (
            (ANNOTATION.encode(), "application/json"),
            (b'{"url": "https://example.com/a.jpg"}', "application/json"),
            (JPEG, "image/jpeg"),
            (BODY, ""),
        ):
            headers = {"content-type": content_type} if content_type else {}
            wrong = client.post(ROUTE, content=body, headers=headers)
            assert wrong.status_code == 415 and error_code(wrong) == "unsupported_media_type"
    assert upstream.requests == []


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (413, "payload_too_large"),
        (415, "unsupported_media_type"),
        (422, "invalid_image"),
        (422, "invalid_payload"),
        (422, "invalid_geometry"),
    ],
)
def test_structured_service_errors_are_relayed(status: int, code: str) -> None:
    error = {
        "code": code,
        "message": "m",
        "details": [{"field": "approx_corners_px", "problem": "p"}],
    }
    upstream = Upstream(httpx.Response(status, json={"error": error, "request_id": "svc-id-1234"}))
    with make_client(upstream) as client:
        response = calibrate(client)
    assert response.status_code == status
    assert response.json()["error"] == error


def _snapped_with(**changes: Any) -> dict[str, Any]:
    result = copy.deepcopy(SNAPPED)
    result.update(changes)
    return result


UNEXPECTED_200 = {
    "measure_schema": {**SNAPPED, "schema_version": "ai-measure.v0"},
    "algorithm_version_missing": {k: v for k, v in SNAPPED.items() if k != "algorithm_version"},
    "unknown_detection_status": _snapped_with(detection_status="detected"),
    "a4_reference": _snapped_with(reference_type="a4"),
    "confirmation_not_required": _snapped_with(requires_user_confirmation=False),
    "confirmation_missing": {k: v for k, v in SNAPPED.items() if k != "requires_user_confirmation"},
    "reason_codes_not_list": _snapped_with(reason_codes="manual_corner_confirmation_required"),
    "reason_code_not_string": _snapped_with(reason_codes=[1]),
    "certified_calibration": _snapped_with(calibration_status="certified"),
    "snapped_without_corners": _snapped_with(proposed_corners_px=None),
    "three_corners": _snapped_with(proposed_corners_px=SNAPPED["proposed_corners_px"][:3]),
    "three_component_point": _snapped_with(
        proposed_corners_px=[[1.0, 2.0, 3.0], *SNAPPED["proposed_corners_px"][1:]]
    ),
    "boolean_coordinate": _snapped_with(
        proposed_corners_px=[[True, 2.0], *SNAPPED["proposed_corners_px"][1:]]
    ),
    "string_coordinate": _snapped_with(
        proposed_corners_px=[["394.9", 2.0], *SNAPPED["proposed_corners_px"][1:]]
    ),
    "not_found_with_corners": {
        **no_snap("not_found"),
        "proposed_corners_px": SNAPPED["proposed_corners_px"],
    },
    "ambiguous_with_calibration": {**no_snap("ambiguous"), "calibration_status": "valid"},
    "json_array": [SNAPPED],
}


@pytest.mark.parametrize("payload", UNEXPECTED_200.values(), ids=UNEXPECTED_200.keys())
def test_unexpected_200_shapes_fail_closed(payload: Any) -> None:
    with make_client(Upstream(httpx.Response(200, json=payload))) as client:
        response = calibrate(client)
    assert response.status_code == 503 and error_code(response) == "service_unavailable"


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_corner_values_fail_closed(token: str) -> None:
    # Python's JSON parser accepts these tokens; they are not valid JSON numbers or pixel positions.
    text = json.dumps(SNAPPED).replace("394.9", token, 1)
    upstream = Upstream(
        httpx.Response(200, content=text.encode(), headers={"content-type": "application/json"})
    )
    with make_client(upstream) as client:
        response = calibrate(client)
    assert response.status_code == 503 and error_code(response) == "service_unavailable"


def test_non_finite_values_inside_a_relayed_error_fail_closed() -> None:
    text = '{"error": {"code": "invalid_geometry", "message": "m", "details": [NaN]}, "request_id": "r"}'
    upstream = Upstream(
        httpx.Response(422, content=text.encode(), headers={"content-type": "application/json"})
    )
    with make_client(upstream) as client:
        response = calibrate(client)
    assert response.status_code == 503 and error_code(response) == "service_unavailable"


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("refused"),
        httpx.ConnectTimeout("slow connect"),
        httpx.ReadTimeout("slow read"),
        httpx.RemoteProtocolError("dropped"),
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(
            200, content=b"\xff\xfe\x00garbage", headers={"content-type": "application/json"}
        ),
        httpx.Response(200, text='{"schema_version": "paper-calibrate.v0"'),  # truncated
        httpx.Response(400, json={"error": {"code": "bad", "message": "m", "details": []}}),
        httpx.Response(404, json={"error": {"code": "not_found", "message": "m", "details": []}}),
        httpx.Response(500, text="boom"),
        httpx.Response(502, json={"error": {"code": "bad_gateway", "message": "m", "details": []}}),
        httpx.Response(422, json={"detail": "not our envelope"}),
        httpx.Response(413, text="too large"),
    ],
    ids=[
        "connect_error",
        "connect_timeout",
        "read_timeout",
        "dropped_connection",
        "html",
        "invalid_utf8",
        "truncated_json",
        "status_400",
        "status_404",
        "status_500",
        "status_502",
        "422_without_envelope",
        "413_without_envelope",
    ],
)
def test_outages_and_unsupported_replies_fail_closed(failure: httpx.Response | Exception) -> None:
    with make_client(Upstream(failure)) as client:
        response = calibrate(client)
    assert response.status_code == 503 and error_code(response) == "service_unavailable"


# 5. Gating and coexistence ----------------------------------------------------------------------


def test_route_is_absent_unless_configured_and_never_in_the_client_contract() -> None:
    with make_client(None, garment_measure_url="") as client:
        assert calibrate(client).status_code == 404
    # Configuring only the photo-quality proxy does not expose paper calibration.
    with make_client(
        None, garment_measure_url="", photo_quality_url="http://127.0.0.1:8300"
    ) as client:
        assert calibrate(client).status_code == 404
    contract = render()
    assert "paper-calibrate" not in contract and "/dev/" not in contract


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_deployed_environments_never_expose_the_route(environment: str) -> None:
    deployed = {
        **CLERK,
        "mode": "connected",
        "environment": environment,
        "database_url": "postgresql://u:p@db/x",
        "cors_origins": ["https://app.dzirent.test"],
    }
    with pytest.raises(ValidationError):
        Settings(_env_file=None, garment_measure_url=URL, **deployed)  # type: ignore[arg-type]
    app = create_app(Settings(_env_file=None, log_level="WARNING", **deployed))  # type: ignore[arg-type]
    with TestClient(app) as client:
        assert calibrate(client).status_code == 404


def test_measure_and_photo_quality_proxies_keep_their_own_upstream_paths() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/v1/measure":
            return httpx.Response(
                200,
                json={
                    "schema_version": "ai-measure.v0",
                    "calibration_status": "valid",
                    "measurements": {},
                },
            )
        if request.url.path == "/v1/check":
            return httpx.Response(200, json={"schema_version": "ai-quality.v0", "checks": {}})
        return httpx.Response(200, json=SNAPPED)

    with make_client(None, photo_quality_url="http://127.0.0.1:8300") as client:
        client.app.state.garment_measure_transport = httpx.MockTransport(handler)  # type: ignore[attr-defined]
        client.app.state.photo_quality_transport = httpx.MockTransport(handler)  # type: ignore[attr-defined]
        assert calibrate(client).json()["schema_version"] == "paper-calibrate.v0"
        measured = client.post(
            "/api/v1/dev/garment-measure", content=BODY, headers={"content-type": CONTENT_TYPE}
        )
        checked = client.post(
            "/api/v1/dev/photo-quality", content=BODY, headers={"content-type": CONTENT_TYPE}
        )
    assert measured.status_code == 200 and checked.status_code == 200
    assert seen == ["/v1/calibrate-paper", "/v1/measure", "/v1/check"]


# 6. Correlation, logging and disk ---------------------------------------------------------------


def test_request_correlation_follows_server_policy() -> None:
    upstream = Upstream(httpx.Response(200, json=SNAPPED))
    with make_client(upstream) as client:
        safe = calibrate(client, **{"X-Request-ID": "trace-paper-0001"})
        unsafe = calibrate(client, **{"X-Request-ID": "<script>x</script>"})
        missing = calibrate(client)
    assert upstream.requests[0].headers["x-request-id"] == "trace-paper-0001"
    assert safe.headers["x-request-id"] == "trace-paper-0001"
    for response, forwarded in ((unsafe, upstream.requests[1]), (missing, upstream.requests[2])):
        server_id = response.headers["x-request-id"]
        assert len(server_id) == 36 and server_id != "<script>x</script>"
        assert forwarded.headers["x-request-id"] == server_id


def test_relayed_body_carries_the_server_request_id() -> None:
    # The service echoes a caller-chosen form field ahead of the header; the monolith's id must win so
    # browser, monolith logs and response body agree.
    echoed = {**SNAPPED, "request_id": "caller-chosen-form-id"}
    error = {
        "error": {"code": "invalid_geometry", "message": "m", "details": []},
        "request_id": "caller-chosen-form-id",
    }
    with make_client(Upstream(httpx.Response(200, json=echoed))) as client:
        ok = calibrate(client, **{"X-Request-ID": "trace-paper-0002"})
    with make_client(Upstream(httpx.Response(422, json=error))) as client:
        rejected = calibrate(client, **{"X-Request-ID": "trace-paper-0003"})
    assert ok.json()["request_id"] == ok.headers["x-request-id"] == "trace-paper-0002"
    assert rejected.json()["request_id"] == rejected.headers["x-request-id"] == "trace-paper-0003"


def test_logs_never_contain_image_bytes_exif_or_corner_values(
    caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    caplog.set_level(logging.DEBUG)
    for upstream in (
        Upstream(httpx.Response(200, json=SNAPPED)),
        Upstream(httpx.ConnectError("refused")),
        Upstream(httpx.Response(200, json={"unexpected": SNAPPED["proposed_corners_px"]})),
    ):
        with make_client(upstream) as client:
            calibrate(client, **{"X-Request-ID": "trace-paper-log1"})
    logged = caplog.text + capsys.readouterr().out
    assert "paper-calibrate service" in logged  # failures are logged, by type and status only
    for secret in (
        "GPS-SECRET-LATITUDE",
        "Exif",
        "404.125",
        "394.9",
        "approx_corners_px",
        "\\xff\\xd8",
    ):
        assert secret not in logged


def test_uploads_are_never_written_to_disk(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_disk(*_: object, **__: object) -> None:
        raise AssertionError("the proxy wrote upload data to a temporary file")

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "rollover", no_disk)
    monkeypatch.setattr(tempfile, "NamedTemporaryFile", no_disk)
    monkeypatch.setattr(tempfile, "TemporaryFile", no_disk)
    monkeypatch.setattr(tempfile, "mkstemp", no_disk)
    upstream = Upstream(httpx.Response(200, json=SNAPPED))
    big = multipart(JPEG + b"\x00" * (6 * 1024 * 1024), "image/jpeg", "photo.jpg")
    with make_client(upstream) as client:
        response = calibrate(client, big)
    assert response.status_code == 200 and upstream.requests[0].content == big
