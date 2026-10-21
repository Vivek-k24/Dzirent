"""HTTP contract of the local service: shape, validation, limits, privacy and environment gating."""

import struct
import tempfile
import zlib
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from starlette.formparsers import MultiPartParser
from synthetic import Scene, encode, render

from dzirent_ai_quality.app import MAX_REQUEST_BYTES, create_app
from dzirent_ai_quality.imaging import MAX_BYTES

GOOD_JPEG = encode(render(Scene()))


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


def post(
    client: TestClient,
    data: bytes,
    filename: str = "photo.jpg",
    mime: str = "image/jpeg",
    **form: str,
) -> object:
    return client.post("/v1/check", files={"image": (filename, data, mime)}, data=form)


def png_header(width: int, height: int) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = (
        struct.pack(">I", len(ihdr))
        + b"IHDR"
        + ihdr
        + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr))
    )
    return b"\x89PNG\r\n\x1a\n" + chunk + b"\x00" * 64


def error_code(response: object) -> str:
    body = response.json()  # type: ignore[attr-defined]
    assert set(body) == {"error", "request_id"} and set(body["error"]) == {
        "code",
        "message",
        "details",
    }
    return str(body["error"]["code"])


def test_health_and_version_make_no_model_claims(client: TestClient) -> None:
    health = client.get("/health").json()
    assert health["status"] == "ok" and "no ML model" in health["analysis"]
    version = client.get("/version").json()
    assert (
        version["schema_version"] == "ai-quality.v0"
        and version["algorithm_version"] == "quality-rules-0.1.0"
    )


@pytest.mark.parametrize(
    ("filename", "mime", "ext"),
    [("photo.jpg", "image/jpeg", ".jpg"), ("photo.png", "image/png", ".png")],
)
def test_check_returns_contract_shape(
    client: TestClient, filename: str, mime: str, ext: str
) -> None:
    response = post(client, encode(render(Scene()), ext), filename, mime, request_id="trace-123")
    assert response.status_code == 200  # type: ignore[attr-defined]
    body = response.json()  # type: ignore[attr-defined]
    assert set(body) == {
        "schema_version",
        "algorithm_version",
        "request_id",
        "decision",
        "checks",
        "message",
    }
    assert body["schema_version"] == "ai-quality.v0" and body["request_id"] == "trace-123"
    assert set(body["checks"]) == {"blur", "exposure", "paper", "framing"}
    for check in body["checks"].values():
        assert set(check) == {"status", "reason"} and check["status"] in {
            "pass",
            "fail",
            "uncertain",
        }
    assert body["decision"] == "pass"


def test_retake_and_review_flow_through_the_api(client: TestClient) -> None:
    blurred = post(client, encode(render(Scene(blur_sigma=6)))).json()  # type: ignore[attr-defined]
    assert blurred["decision"] == "retake" and blurred["checks"]["blur"] == {
        "status": "fail",
        "reason": "blurry",
    }
    no_paper = post(client, encode(render(Scene(paper=False)))).json()  # type: ignore[attr-defined]
    assert no_paper["decision"] == "review" and no_paper["checks"]["paper"]["status"] == "uncertain"


@pytest.mark.parametrize(
    ("data", "filename", "mime"),
    [
        (b"GIF89a" + b"\x00" * 200, "photo.jpg", "image/jpeg"),  # spoofed name and MIME
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "photo.png", "image/png"),
        (b"https://example.com/photo.jpg", "url.jpg", "image/jpeg"),
        (b"%PDF-1.7\n", "doc.jpg", "image/jpeg"),
    ],
)
def test_unsupported_bytes_are_rejected_regardless_of_name_or_mime(
    client: TestClient, data: bytes, filename: str, mime: str
) -> None:
    response = post(client, data, filename, mime)
    assert response.status_code == 415 and error_code(response) == "unsupported_media_type"  # type: ignore[attr-defined]


@pytest.mark.parametrize(
    "data",
    [
        b"\xff\xd8\xff\xe0" + b"\x13\x37" * 500,  # JPEG magic, garbage instead of segments
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 40,  # PNG magic without an IHDR chunk
        png_header(400, 300),  # valid header, no image data
        b"\xff\xd8\xff\xe0\x00\x01" + b"\x00" * 300,  # JPEG segment with an impossible length
    ],
)
def test_corrupt_images_are_invalid(client: TestClient, data: bytes) -> None:
    response = post(client, data)
    assert response.status_code == 422 and error_code(response) == "invalid_image"  # type: ignore[attr-defined]


def test_tiny_images_are_invalid_and_pixel_bombs_are_too_large(client: TestClient) -> None:
    tiny = post(
        client,
        encode(render(Scene(width=160, height=120, paper=False, garment=False)), ".png"),
        "t.png",
        "image/png",
    )
    assert tiny.status_code == 422 and error_code(tiny) == "invalid_image"  # type: ignore[attr-defined]
    # A few hundred bytes claiming 50000 x 50000 px is refused from the header, before decoding.
    bomb = post(client, png_header(50_000, 50_000), "bomb.png", "image/png")
    assert bomb.status_code == 413 and error_code(bomb) == "payload_too_large"  # type: ignore[attr-defined]


def test_oversized_payloads_are_refused(client: TestClient) -> None:
    # File just over 10 MiB inside the multipart allowance: rejected by the image size rule.
    over_file = post(client, GOOD_JPEG + b"\x00" * (MAX_BYTES + 1 - len(GOOD_JPEG)))
    assert over_file.status_code == 413 and error_code(over_file) == "payload_too_large"  # type: ignore[attr-defined]
    # Declared request length over the cap: rejected before the body is read.
    declared = client.post(
        "/v1/check",
        content=b"x" * (MAX_REQUEST_BYTES + 1),
        headers={"content-type": "multipart/form-data; boundary=b"},
    )
    assert declared.status_code == 413 and error_code(declared) == "payload_too_large"

    # Streamed valid multipart without Content-Length: rejected once the running total passes the cap.
    def chunks() -> Iterator[bytes]:
        yield b'--b\r\nContent-Disposition: form-data; name="image"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'
        for _ in range(12):
            yield b"y" * (1024 * 1024)

    streamed = client.post(
        "/v1/check", content=chunks(), headers={"content-type": "multipart/form-data; boundary=b"}
    )
    assert streamed.status_code == 413 and error_code(streamed) == "payload_too_large"


def test_missing_image_or_url_only_input_is_rejected(client: TestClient) -> None:
    for form in ({}, {"url": "https://example.com/photo.jpg"}):
        response = client.post("/v1/check", data=form)
        assert response.status_code == 422 and error_code(response) == "invalid_image"


def test_request_ids_are_echoed_only_when_safe(client: TestClient) -> None:
    unsafe = post(client, GOOD_JPEG, request_id="<script>alert(1)</script>").json()  # type: ignore[attr-defined]
    assert unsafe["request_id"] != "<script>alert(1)</script>" and len(unsafe["request_id"]) == 36


def test_uploads_stay_in_memory(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert MultiPartParser.spool_max_size >= MAX_REQUEST_BYTES

    def no_disk(self: object) -> None:
        raise AssertionError("upload spilled to a temporary file")

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "rollover", no_disk)
    response = post(client, GOOD_JPEG + b"\x00" * (6 * 1024 * 1024))
    assert response.status_code == 200  # type: ignore[attr-defined]


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_service_refuses_deployed_environments(
    monkeypatch: pytest.MonkeyPatch, environment: str
) -> None:
    monkeypatch.setenv("DZIRENT_ENVIRONMENT", environment)
    with pytest.raises(RuntimeError):
        create_app()
