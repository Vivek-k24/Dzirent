"""ROI-guided paper corner proposals: engine outcomes and the paper-calibrate.v0 HTTP contract.

Synthetic scenes verify implementation logic only (sub-pixel edges, gating, honest failures); they say
nothing about snap success or false-snap rates on real photographs.
"""

import json
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from synthetic import Camera, corners_px, encode, render

from dzirent_ai_measure.annotation import MAX_ANNOTATION_BYTES
from dzirent_ai_measure.app import create_app
from dzirent_ai_measure.imaging import MAX_BYTES, decode
from dzirent_ai_measure.paper_snap import PIXEL_CENTRE, SnapResult, snap_paper

FRONTAL = Camera()
TILTED = Camera(tilt_deg=20, tilt_axis_deg=120, roll_deg=-20, focal=1300)
WHITE = (236, 238, 238)
# Supersampled rendering places edges to ~0.1-0.3 px (plain fillPoly is biased by ~0.5 px).
ACCURATE = {"supersample": 3}
MAX_ERROR_PX = 0.75


def snap(camera: Camera, approx: np.ndarray, **scene: Any) -> SnapResult:
    return snap_paper(decode(encode(render(camera, **scene), ".png"), keep_full=True), approx)


def corner_error(result: SnapResult, camera: Camera) -> float:
    assert result.corners_px is not None
    proposed = np.array(result.corners_px) - PIXEL_CENTRE
    return float(np.linalg.norm(proposed - corners_px(camera), axis=1).max())


@pytest.mark.parametrize("camera", [FRONTAL, TILTED], ids=["overhead", "perspective_warped"])
def test_rough_quad_snaps_to_sub_pixel_corners(camera: Camera) -> None:
    truth = corners_px(camera)
    jittered = truth + np.random.default_rng(3).normal(0, 10, truth.shape)
    result = snap(camera, jittered, **ACCURATE)
    assert result.status == "snapped" and result.calibration_status == "valid"
    assert result.reasons[0] == "manual_corner_confirmation_required"
    assert corner_error(result, camera) <= MAX_ERROR_PX


@pytest.mark.parametrize(
    ("shift", "scale"), [((0.15, -0.12), 1.0), ((0.0, 0.0), 1.2), ((-0.1, 0.1), 0.8)]
)
def test_displaced_or_resized_rough_quads_still_snap(
    shift: tuple[float, float], scale: float
) -> None:
    truth = corners_px(TILTED)
    size = float(np.linalg.norm(truth[1] - truth[0]))
    centre = truth.mean(axis=0)
    approx = centre + (truth - centre) * scale + np.array(shift) * size
    result = snap(TILTED, approx, **ACCURATE)
    assert result.status == "snapped" and corner_error(result, TILTED) <= MAX_ERROR_PX


def test_no_paper_is_not_found() -> None:
    result = snap(FRONTAL, corners_px(FRONTAL), paper=False)
    assert result == SnapResult("not_found", ["paper_not_detected", "manual_corners_unchanged"])


def test_white_paper_on_a_white_surface_is_not_found_rather_than_guessed() -> None:
    result = snap(FRONTAL, corners_px(FRONTAL), surface_color=(236, 236, 234))
    assert result.status == "not_found" and result.corners_px is None
    assert result.reasons[0] == "low_contrast_with_background"


def test_rough_quad_between_two_sheets_is_ambiguous() -> None:
    result = snap(
        FRONTAL, corners_px(FRONTAL) + np.array([0.0, 175.0]), extra_sheets_cm=((-2.0, 31.0),)
    )
    assert result.status == "ambiguous" and result.reasons[0] == "multiple_candidates"
    assert result.corners_px is None and result.calibration_status is None


def test_second_sheet_does_not_disturb_a_quad_placed_on_the_first() -> None:
    result = snap(FRONTAL, corners_px(FRONTAL), extra_sheets_cm=((-2.0, 31.0),), **ACCURATE)
    assert result.status == "snapped" and corner_error(result, FRONTAL) <= MAX_ERROR_PX


def test_white_garment_touching_the_sheet_is_ambiguous_not_snapped() -> None:
    result = snap(FRONTAL, corners_px(FRONTAL), shirt_color=WHITE, shirt_offset_cm=(-12.0, 0.0))
    assert result.status == "ambiguous" and result.corners_px is None
    assert result.reasons[0] == "paper_merges_with_adjacent_white_region"


def test_white_garment_nearby_but_separate_still_snaps_to_the_sheet() -> None:
    result = snap(
        FRONTAL, corners_px(FRONTAL), shirt_color=WHITE, shirt_offset_cm=(-3.0, 0.0), **ACCURATE
    )
    assert result.status == "snapped" and corner_error(result, FRONTAL) <= MAX_ERROR_PX


def test_sheet_cut_off_by_the_frame_is_invalid() -> None:
    camera = Camera(target_cm=(40.0, 30.0), distance_cm=80)  # sheet's top-left corner at (0, 0)
    approx = np.clip(corners_px(camera), 0, [camera.width - 1, camera.height - 1])
    result = snap(camera, approx)
    assert result.status == "invalid" and result.reasons[0] == "paper_corner_out_of_frame"
    assert result.corners_px is None


def test_tiny_rough_quad_is_invalid() -> None:
    approx = np.array([[100.0, 100.0], [110.0, 100.0], [110.0, 113.0], [100.0, 113.0]])
    assert snap(FRONTAL, approx).status == "invalid"


def test_snapping_never_certifies_sheet_size() -> None:
    # An A4 sheet snaps (it is a clean outline) but its geometry does not fit US Letter.
    camera = Camera(tilt_deg=10)
    a4 = corners_px(camera, 21.0, 29.7)
    result = snap(camera, a4, paper_size_cm=(21.0, 29.7))
    assert result.status == "snapped" and result.calibration_status == "invalid"
    assert "reference_shape_inconsistent" in result.reasons


# --- HTTP contract -----------------------------------------------------------------------------

GOOD_PNG = encode(render(TILTED, **ACCURATE), ".png")
BROWSER_TRUTH = corners_px(TILTED) + PIXEL_CENTRE


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


def request_body(corners: Any = None, **overrides: Any) -> dict[str, Any]:
    approx = BROWSER_TRUTH + 8.0 if corners is None else corners
    body: dict[str, Any] = {
        "schema_version": "paper-calibrate.v0",
        "reference_type": "us_letter",
        "approx_corners_px": np.asarray(approx).tolist(),
    }
    body.update(overrides)
    return body


def post(client: TestClient, data: bytes = GOOD_PNG, annotation: Any = None, **form: str) -> Any:
    raw = annotation if isinstance(annotation, str) else json.dumps(annotation or request_body())
    return client.post(
        "/v1/calibrate-paper",
        files={"image": ("photo.png", data, "image/png")},
        data={"annotation": raw, **form},
    )


def error_code(response: Any) -> str:
    body = response.json()
    assert set(body) == {"error", "request_id"}
    return str(body["error"]["code"])


def test_snapped_response_matches_the_frozen_contract(client: TestClient) -> None:
    response = post(client, request_id="trace-paper-1")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "schema_version",
        "algorithm_version",
        "request_id",
        "detection_status",
        "reference_type",
        "proposed_corners_px",
        "calibration_status",
        "reason_codes",
        "requires_user_confirmation",
    }
    assert body["schema_version"] == "paper-calibrate.v0"
    assert body["algorithm_version"] == "roi-paper-snap-0.1.0"
    assert body["request_id"] == "trace-paper-1" and body["reference_type"] == "us_letter"
    assert body["detection_status"] == "snapped" and body["calibration_status"] == "valid"
    assert body["requires_user_confirmation"] is True
    assert body["reason_codes"][0] == "manual_corner_confirmation_required"
    proposed = np.array(body["proposed_corners_px"])
    assert proposed.shape == (4, 2)
    assert float(np.linalg.norm(proposed - BROWSER_TRUTH, axis=1).max()) <= MAX_ERROR_PX + 0.05


def test_honest_no_snap_responses_carry_no_corners(client: TestClient) -> None:
    no_paper = encode(render(FRONTAL, paper=False), ".png")
    body = post(client, no_paper, request_body(corners_px(FRONTAL) + PIXEL_CENTRE)).json()
    assert body["detection_status"] == "not_found"
    assert body["proposed_corners_px"] is None and body["calibration_status"] is None
    assert body["requires_user_confirmation"] is True
    assert "manual_corners_unchanged" in body["reason_codes"]


@pytest.mark.parametrize(
    "corners",
    [
        BROWSER_TRUTH[[0, 2, 1, 3]],  # crossed
        BROWSER_TRUTH[::-1],  # counter-clockwise
        np.array(
            [
                BROWSER_TRUTH[0],
                (BROWSER_TRUTH[0] + BROWSER_TRUTH[1]) / 2,
                BROWSER_TRUTH[1],
                BROWSER_TRUTH[3],
            ]
        ),
        BROWSER_TRUTH + np.array([TILTED.width, 0.0]),  # outside the photo
        BROWSER_TRUTH * np.array([1.0, -1.0]),  # negative coordinates
    ],
    ids=["crossed", "counter_clockwise", "collinear", "out_of_frame", "negative"],
)
def test_invalid_polygons_are_rejected(client: TestClient, corners: np.ndarray) -> None:
    response = post(client, annotation=request_body(corners))
    assert response.status_code == 422 and error_code(response) == "invalid_geometry"
    assert response.json()["error"]["details"][0]["field"].startswith("approx_corners_px")


@pytest.mark.parametrize(
    "annotation",
    [
        "{not json",
        request_body(schema_version="ai-measure.v0"),
        request_body(reference_type="a4"),
        request_body(corners=BROWSER_TRUTH[:3]),
        request_body(width_cm=21.0),  # no client-supplied physical size
        json.dumps(request_body()).replace(
            json.dumps(request_body()["approx_corners_px"][0]), "[NaN, 10.0]", 1
        ),
        request_body(corners=[["SECRET-VALUE", 1.0], [2.0, 1.0], [2.0, 3.0], [1.0, 3.0]]),
    ],
    ids=["not_json", "wrong_schema", "a4", "three_corners", "extra_field", "nan", "string_value"],
)
def test_malformed_annotations_are_invalid_payload(client: TestClient, annotation: Any) -> None:
    response = post(client, annotation=annotation)
    assert response.status_code == 422 and error_code(response) == "invalid_payload"
    assert "SECRET-VALUE" not in response.text


def test_unsupported_corrupt_and_oversized_inputs(client: TestClient) -> None:
    gif = post(client, b"GIF89a" + b"\x00" * 200)
    assert gif.status_code == 415 and error_code(gif) == "unsupported_media_type"
    corrupt = post(client, b"\xff\xd8\xff\xe0" + b"\x13\x37" * 500)
    assert corrupt.status_code == 422 and error_code(corrupt) == "invalid_image"
    oversized = post(client, GOOD_PNG + b"\x00" * (MAX_BYTES + 1 - len(GOOD_PNG)))
    assert oversized.status_code == 413 and error_code(oversized) == "payload_too_large"
    huge_annotation = post(client, annotation=" " * (MAX_ANNOTATION_BYTES + 1))
    assert huge_annotation.status_code == 413 and error_code(huge_annotation) == "payload_too_large"


def test_logs_carry_outcomes_but_no_coordinates(capsys: pytest.CaptureFixture[str]) -> None:
    with TestClient(create_app()) as client:  # log handler binds to the captured stdout
        post(client, request_id="trace-paper-log")
    logged = capsys.readouterr().out
    assert '"event": "paper_calibrated"' in logged and "trace-paper-log" in logged
    assert str(round(float(BROWSER_TRUTH[0][0]), 1)) not in logged
