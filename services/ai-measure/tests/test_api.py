"""HTTP contract of the local service: shape, validation, limits, privacy and environment gating."""

import copy
import json
import struct
import tempfile
import zlib
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.formparsers import MultiPartParser
from synthetic import TRUE_CM, Camera, annotation, corners_px, encode, render

from dzirent_ai_measure.annotation import MAX_ANNOTATION_BYTES, MAX_POLYLINE_POINTS
from dzirent_ai_measure.app import MAX_REQUEST_BYTES, create_app
from dzirent_ai_measure.imaging import MAX_BYTES

CAMERA = Camera()
GOOD_JPEG = encode(render(CAMERA))
GOOD_ANNOTATION = annotation(CAMERA)
GOOD_ANNOTATION_POINTS = {lm["key"]: lm["points_px"] for lm in GOOD_ANNOTATION["landmarks"]}  # type: ignore[attr-defined]


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


def post(
    client: TestClient,
    data: bytes = GOOD_JPEG,
    payload: object = GOOD_ANNOTATION,
    filename: str = "photo.jpg",
    mime: str = "image/jpeg",
    **form: str,
) -> Any:
    fields = {"annotation": payload if isinstance(payload, str) else json.dumps(payload), **form}
    return client.post("/v1/measure", files={"image": (filename, data, mime)}, data=fields)


def png_header(width: int, height: int) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = (
        struct.pack(">I", len(ihdr))
        + b"IHDR"
        + ihdr
        + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr))
    )
    return b"\x89PNG\r\n\x1a\n" + chunk + b"\x00" * 64


def error_code(response: Any) -> str:
    body = response.json()
    assert set(body) == {"error", "request_id"}
    assert set(body["error"]) == {"code", "message", "details"}
    return str(body["error"]["code"])


def with_first_corner(raw_point: str) -> str:
    # Non-standard JSON tokens cannot be produced by json.dumps, so splice them into the text.
    first = json.dumps(GOOD_ANNOTATION["reference"]["corners_px"][0])  # type: ignore[index]
    return json.dumps(GOOD_ANNOTATION).replace(first, raw_point, 1)


def modified(**changes: Any) -> dict[str, Any]:
    payload = copy.deepcopy(GOOD_ANNOTATION)
    for path, value in changes.items():
        target: Any = payload
        *parents, leaf = path.split("__")
        for part in parents:
            target = target[int(part)] if part.isdigit() else target[part]
        target[int(leaf) if leaf.isdigit() else leaf] = value
    return payload


def test_health_and_version_make_no_model_claims(client: TestClient) -> None:
    health = client.get("/health").json()
    assert health["status"] == "ok" and "no ML model" in health["analysis"]
    version = client.get("/version").json()
    assert version["schema_version"] == "ai-measure.v0"
    assert version["algorithm_version"] == "paper-homography-0.1.0"


@pytest.mark.parametrize(("ext", "mime"), [(".jpg", "image/jpeg"), (".png", "image/png")])
def test_measure_returns_contract_shape(client: TestClient, ext: str, mime: str) -> None:
    response = post(client, encode(render(CAMERA), ext), mime=mime, request_id="trace-123")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "schema_version",
        "algorithm_version",
        "request_id",
        "garment_class",
        "calibration_status",
        "calibration",
        "image",
        "method",
        "confirmed_by_lender",
        "measurements",
        "cautions",
        "message",
    }
    assert body["schema_version"] == "ai-measure.v0" and body["request_id"] == "trace-123"
    assert body["garment_class"] == "sleeved_top" and body["calibration_status"] == "valid"
    assert (
        body["method"] == "paper_homography_and_landmarks" and body["confirmed_by_lender"] is False
    )
    assert body["image"] == {"width": CAMERA.width, "height": CAMERA.height}
    assert body["calibration"]["paper_cm"] == {"width": 21.59, "length": 27.94}
    assert body["calibration"]["user_confirmed"] is True
    assert set(body["measurements"]) == set(TRUE_CM)
    for key, item in body["measurements"].items():
        assert item["key"] == key and item["status"] == "estimated" and item["unit"] == "cm"
        assert item["method"] == "paper_homography_and_landmarks"
        assert item["confirmed_by_lender"] is False
        assert abs(item["value_cm"] - TRUE_CM[key]) <= 0.5
        assert item["points_px"] == [list(p) for p in GOOD_ANNOTATION_POINTS[key]]
    assert body["cautions"] and all(isinstance(c, str) for c in body["cautions"])


def test_integer_pixel_coordinates_are_accepted(client: TestClient) -> None:
    payload = modified()
    payload["reference"]["corners_px"] = [
        [round(x), round(y)] for x, y in payload["reference"]["corners_px"]
    ]
    response = post(client, payload=payload)
    assert response.status_code == 200 and response.json()["calibration_status"] == "valid"


def test_unreliable_calibration_is_200_without_numbers(client: TestClient) -> None:
    crossed = corners_px(CAMERA)[[0, 2, 1, 3]]
    body = post(client, payload=annotation(CAMERA, corners=crossed)).json()
    assert body["calibration_status"] == "invalid"
    assert body["calibration"]["reasons"] == ["corners_crossed"]
    assert all(item["value_cm"] is None for item in body["measurements"].values())


@pytest.mark.parametrize(
    ("data", "filename", "mime"),
    [
        (b"GIF89a" + b"\x00" * 200, "photo.jpg", "image/jpeg"),  # spoofed name and MIME
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "photo.png", "image/png"),
        (b"https://example.com/photo.jpg", "url.jpg", "image/jpeg"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "photo.webp", "image/webp"),
    ],
)
def test_unsupported_bytes_are_rejected_regardless_of_name_or_mime(
    client: TestClient, data: bytes, filename: str, mime: str
) -> None:
    response = post(client, data, filename=filename, mime=mime)
    assert response.status_code == 415 and error_code(response) == "unsupported_media_type"


@pytest.mark.parametrize(
    "data",
    [
        b"\xff\xd8\xff\xe0" + b"\x13\x37" * 500,
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 40,
        png_header(400, 300),
        encode(render(Camera(width=160, height=120, distance_cm=900)), ".png"),  # too small
    ],
    ids=["garbage_jpeg", "png_without_ihdr", "png_without_data", "tiny_image"],
)
def test_corrupt_or_tiny_images_are_invalid(client: TestClient, data: bytes) -> None:
    response = post(client, data)
    assert response.status_code == 422 and error_code(response) == "invalid_image"


def test_pixel_bombs_and_oversized_payloads_are_refused(client: TestClient) -> None:
    bomb = post(client, png_header(50_000, 50_000), filename="bomb.png", mime="image/png")
    assert bomb.status_code == 413 and error_code(bomb) == "payload_too_large"
    over_file = post(client, GOOD_JPEG + b"\x00" * (MAX_BYTES + 1 - len(GOOD_JPEG)))
    assert over_file.status_code == 413 and error_code(over_file) == "payload_too_large"
    declared = client.post(
        "/v1/measure",
        content=b"x" * (MAX_REQUEST_BYTES + 1),
        headers={"content-type": "multipart/form-data; boundary=b"},
    )
    assert declared.status_code == 413 and error_code(declared) == "payload_too_large"

    def chunks() -> Iterator[bytes]:
        yield b'--b\r\nContent-Disposition: form-data; name="image"; filename="x.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'
        for _ in range(12):
            yield b"y" * (1024 * 1024)

    streamed = client.post(
        "/v1/measure", content=chunks(), headers={"content-type": "multipart/form-data; boundary=b"}
    )
    assert streamed.status_code == 413 and error_code(streamed) == "payload_too_large"
    huge_annotation = post(client, payload=" " * (MAX_ANNOTATION_BYTES + 1))
    assert huge_annotation.status_code == 413 and error_code(huge_annotation) == "payload_too_large"


INVALID_PAYLOADS = {
    "not_json": "{corners: nope",
    "json_array": "[]",
    "wrong_schema_version": modified(schema_version="ai-measure.v1"),
    "missing_reference": {k: v for k, v in GOOD_ANNOTATION.items() if k != "reference"},
    "three_corners": modified(reference__corners_px=GOOD_ANNOTATION["reference"]["corners_px"][:3]),  # type: ignore[index]
    "nan_coordinate": with_first_corner("[NaN, 10.0]"),
    "infinite_coordinate": with_first_corner("[Infinity, 10.0]"),
    "boolean_coordinate": modified(reference__corners_px__0=[True, 10.0]),
    "string_coordinate": modified(reference__corners_px__0=["SECRET-VALUE", 10.0]),
    "three_component_point": modified(reference__corners_px__0=[1.0, 2.0, 3.0]),
    "client_sheet_size": modified(reference__width_cm=30.0),
    "client_scale_factor": modified(px_per_cm=12.5),
    "unknown_reference_type": modified(reference__type="a4"),
    "unknown_measurement": modified(landmarks__0__key="waist_cm"),
    "wrong_geometry_for_key": modified(landmarks__0__geometry="polyline"),
    "line_with_three_points": modified(
        landmarks__0__points_px=[[500.0, 200.0], [600.0, 200.0], [700.0, 200.0]]
    ),
    "single_point": modified(landmarks__3__points_px=[[500.0, 200.0]]),
    "too_many_polyline_points": modified(
        landmarks__3__points_px=[[500.0 + i, 300.0 + 5 * i] for i in range(MAX_POLYLINE_POINTS + 1)]
    ),
    "duplicate_measurement": modified(landmarks__1=GOOD_ANNOTATION["landmarks"][0]),  # type: ignore[index]
    "string_confirmation": modified(reference__user_confirmed="true"),
}


@pytest.mark.parametrize("payload", INVALID_PAYLOADS.values(), ids=INVALID_PAYLOADS.keys())
def test_malformed_annotations_are_invalid_payload(client: TestClient, payload: object) -> None:
    response = post(client, payload=payload)
    assert response.status_code == 422 and error_code(response) == "invalid_payload"
    assert "SECRET-VALUE" not in response.text  # submitted values are never echoed


def test_unsupported_garment_classes_and_unconfirmed_sheets_are_rejected(
    client: TestClient,
) -> None:
    for garment in ("trousers", "dress", "saree"):
        response = post(client, payload=modified(garment_class=garment))
        assert response.status_code == 422 and error_code(response) == "unsupported_garment_class"
    unconfirmed = post(client, payload=modified(reference__user_confirmed=False))
    assert unconfirmed.status_code == 422 and error_code(unconfirmed) == "reference_not_confirmed"


@pytest.mark.parametrize(
    "payload",
    [
        modified(reference__corners_px__1=[CAMERA.width + 5.0, 100.0]),
        modified(reference__corners_px__0=[-1.0, 100.0]),
        modified(landmarks__2__points_px=[[600.0, 200.0], [600.0, CAMERA.height + 0.5]]),
        modified(landmarks__3__points_px=[[900.0, 220.0], [900.4, 220.3], [1000.0, 400.0]]),
    ],
    ids=["corner_right_of_frame", "corner_negative", "landmark_below_frame", "zero_length_segment"],
)
def test_out_of_frame_and_zero_length_points_are_invalid_geometry(
    client: TestClient, payload: object
) -> None:
    response = post(client, payload=payload)
    assert response.status_code == 422 and error_code(response) == "invalid_geometry"
    assert response.json()["error"]["details"][0]["field"].startswith(("reference", "landmarks"))


def test_missing_fields_or_url_only_input_are_rejected(client: TestClient) -> None:
    no_annotation = client.post("/v1/measure", files={"image": ("p.jpg", GOOD_JPEG, "image/jpeg")})
    assert no_annotation.status_code == 422 and error_code(no_annotation) == "invalid_payload"
    for form in ({"annotation": json.dumps(GOOD_ANNOTATION)}, {"url": "https://example.com/a.jpg"}):
        response = client.post("/v1/measure", data=form)
        assert response.status_code == 422 and error_code(response) == "invalid_image"


def test_request_ids_are_echoed_only_when_safe(client: TestClient) -> None:
    body = post(client, request_id="<script>alert(1)</script>").json()
    assert body["request_id"] != "<script>alert(1)</script>" and len(body["request_id"]) == 36


def test_uploads_stay_in_memory(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    assert MultiPartParser.spool_max_size >= MAX_REQUEST_BYTES

    def no_disk(self: object) -> None:
        raise AssertionError("upload spilled to a temporary file")

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "rollover", no_disk)
    response = post(client, GOOD_JPEG + b"\x00" * (6 * 1024 * 1024))
    assert response.status_code == 200


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_service_refuses_deployed_environments(
    monkeypatch: pytest.MonkeyPatch, environment: str
) -> None:
    monkeypatch.setenv("DZIRENT_ENVIRONMENT", environment)
    with pytest.raises(RuntimeError):
        create_app()
