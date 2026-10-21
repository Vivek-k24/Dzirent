"""Measurement engine on rendered synthetic photos: calibration outcomes and per-measurement rules."""

import json

import numpy as np
import pytest
from synthetic import TRUE_CM, Camera, annotation, corners_px, encode, render

from dzirent_ai_measure.annotation import parse
from dzirent_ai_measure.imaging import decode
from dzirent_ai_measure.measure import CAUTIONS, Measurement, Outcome, measure

# 1600 × 1200 px overhead view; the sheet's short edge is ~250 px.
FRONTAL = Camera()
# Close view of the sheet and a nearby line: small placement sensitivity, so one decimal is allowed.
CLOSE_UP = Camera(focal=1300, distance_cm=52, target_cm=(32.5, 14.0))


def run(camera: Camera, payload: dict[str, object] | None = None, **render_args: object) -> Outcome:
    image = decode(encode(render(camera, **render_args)))  # type: ignore[arg-type]
    return measure(parse(json.dumps(payload or annotation(camera))), image)


def by_key(outcome: Outcome) -> dict[str, Measurement]:
    return {m.key: m for m in outcome.measurements}


def with_landmarks(
    camera: Camera, landmarks: dict[str, list[tuple[float, float]]]
) -> dict[str, object]:
    payload = annotation(camera, keys=())
    payload["landmarks"] = [
        {
            "key": key,
            "geometry": "polyline" if key == "sleeve_length_cm" else "line",
            "points_px": camera.project(points).tolist(),
        }
        for key, points in landmarks.items()
    ]
    return payload


def test_overhead_photo_measures_all_four_keys_close_to_truth() -> None:
    outcome = run(FRONTAL)
    assert outcome.calibration.status == "valid" and outcome.calibration.reasons == []
    for key, measurement in by_key(outcome).items():
        assert measurement.status == "estimated" and measurement.value_cm is not None
        # Whole centimetres here: at this framing a ~1.5 px placement error moves values > 1 cm.
        assert measurement.precision_cm == 1.0
        assert "sensitive_to_point_placement" in measurement.cautions
        assert abs(measurement.value_cm - TRUE_CM[key]) <= 0.5
        assert measurement.points_cm is not None and len(measurement.points_cm) == len(
            measurement.points_px
        )


def test_one_decimal_only_when_calibration_is_valid_and_placement_is_insensitive() -> None:
    outcome = run(
        CLOSE_UP, with_landmarks(CLOSE_UP, {"shoulder_width_cm": [(28.0, 6.0), (60.0, 6.0)]})
    )
    shoulder = by_key(outcome)["shoulder_width_cm"]
    assert outcome.calibration.status == "valid"
    assert shoulder.precision_cm == 0.1 and shoulder.cautions == []
    assert shoulder.value_cm == pytest.approx(32.0, abs=0.05)


def test_perspective_view_within_limits_still_measures_correctly() -> None:
    camera = Camera(tilt_deg=20, tilt_axis_deg=120, roll_deg=-20, focal=1300)
    outcome = run(camera)
    assert outcome.calibration.status == "valid" and outcome.calibration.tilt_deg == pytest.approx(
        20, abs=0.5
    )
    for key, measurement in by_key(outcome).items():
        assert measurement.value_cm is not None and abs(measurement.value_cm - TRUE_CM[key]) <= 0.5


def test_tilted_camera_is_uncertain_and_rounded_to_whole_centimetres() -> None:
    outcome = run(Camera(tilt_deg=35, tilt_axis_deg=60, distance_cm=150))
    assert outcome.calibration.status == "uncertain"
    assert outcome.calibration.reasons == ["camera_not_perpendicular"]
    for measurement in outcome.measurements:
        assert measurement.precision_cm == 1.0 and measurement.value_cm == round(
            measurement.value_cm
        )
    assert "Calibration is uncertain" in outcome.message


@pytest.mark.parametrize(
    ("camera", "size_cm", "reason"),
    [
        (Camera(tilt_deg=58, distance_cm=170, focal=1100), (21.59, 27.94), "extreme_perspective"),
        (Camera(tilt_deg=10), (21.0, 29.7), "reference_shape_inconsistent"),  # A4 used as Letter
        (Camera(tilt_deg=10), (21.59, 35.56), "reference_shape_inconsistent"),  # US Legal
        (Camera(tilt_deg=10), (27.94, 21.59), "paper_orientation_swapped"),
    ],
    ids=["extreme_tilt", "a4_sheet", "us_legal_sheet", "sideways_labelling"],
)
def test_bad_calibration_returns_no_numbers(
    camera: Camera, size_cm: tuple[float, float], reason: str
) -> None:
    payload = annotation(camera, corners=corners_px(camera, *size_cm))
    outcome = run(camera, payload, paper_size_cm=size_cm)
    assert outcome.calibration.status == "invalid" and reason in outcome.calibration.reasons
    for measurement in outcome.measurements:
        assert measurement.status == "not_measurable" and measurement.value_cm is None
        assert measurement.reason == "calibration_invalid"
    assert "nothing was calculated" in outcome.message


@pytest.mark.parametrize(
    ("corners", "reason"),
    [
        (lambda c: c[[0, 2, 1, 3]], "corners_crossed"),
        (lambda c: c[::-1], "corners_wrong_order"),
        (lambda c: np.array([c[0], (c[0] + c[1]) / 2, c[1], c[3]]), "corners_collinear"),
    ],
    ids=["crossed", "counter_clockwise", "collinear"],
)
def test_malformed_corner_sets_are_invalid(corners: object, reason: str) -> None:
    bad = corners(corners_px(FRONTAL))  # type: ignore[operator]
    outcome = run(FRONTAL, annotation(FRONTAL, corners=bad))
    assert outcome.calibration.status == "invalid" and outcome.calibration.reasons == [reason]
    assert all(m.value_cm is None for m in outcome.measurements)


def test_corners_that_do_not_sit_on_white_paper_make_calibration_uncertain() -> None:
    on_floor = corners_px(FRONTAL) + np.array([0.0, 600.0])
    outcome = run(FRONTAL, annotation(FRONTAL, corners=on_floor))
    assert outcome.calibration.status == "uncertain"
    assert outcome.calibration.reasons == ["reference_region_not_plain_white"]


def test_small_sheet_in_frame_withholds_sensitive_values() -> None:
    outcome = run(Camera(distance_cm=300))  # sheet edge ~115 px
    assert outcome.calibration.reasons == ["reference_small_in_frame"]
    assert {m.reason for m in outcome.measurements} == {"too_sensitive_to_point_placement"}


def test_points_far_beyond_the_sheet_are_not_measurable() -> None:
    camera = Camera(distance_cm=300)
    outcome = run(camera, with_landmarks(camera, {"chest_flat_cm": [(150.0, 36.0), (190.0, 36.0)]}))
    assert by_key(outcome)["chest_flat_cm"].reason == "beyond_reliable_range"


def test_unannotated_measurements_are_reported_not_invented() -> None:
    outcome = run(FRONTAL, annotation(FRONTAL, keys=("chest_flat_cm",)))
    measurements = by_key(outcome)
    assert set(measurements) == set(TRUE_CM)
    for key in ("shoulder_width_cm", "body_length_cm", "sleeve_length_cm"):
        assert measurements[key].status == "not_measurable"
        assert measurements[key].reason == "not_annotated" and measurements[key].value_cm is None
    assert measurements["chest_flat_cm"].status == "estimated"


def test_point_on_the_reference_sheet_is_not_measurable() -> None:
    payload = with_landmarks(FRONTAL, {"shoulder_width_cm": [(10.0, 10.0), (50.0, 10.0)]})
    assert by_key(run(FRONTAL, payload))["shoulder_width_cm"].reason == "landmark_on_reference"


def test_implausible_lengths_are_withheld() -> None:
    camera = Camera(distance_cm=200)  # wide enough to keep a 135 cm line in frame
    payload = with_landmarks(
        camera,
        {
            "shoulder_width_cm": [(40.0, 5.0), (45.0, 5.0)],
            "body_length_cm": [(30.0, -35.0), (30.0, 100.0)],
        },
    )
    measurements = by_key(run(camera, payload))
    assert measurements["shoulder_width_cm"].reason == "outside_plausible_range"
    assert measurements["body_length_cm"].reason == "outside_plausible_range"
    assert measurements["shoulder_width_cm"].value_cm is None


def test_alignment_and_path_cautions() -> None:
    payload = with_landmarks(
        FRONTAL,
        {
            "shoulder_width_cm": [(43.0, 3.0), (85.0, 20.0)],  # slanted, not square across
            "body_length_cm": [(56.0, 1.0), (80.0, 71.0)],  # not along the sheet's long edge
            "sleeve_length_cm": [(85.0, 3.0), (100.0, 30.0), (88.0, 8.0)],  # doubles back
        },
    )
    measurements = by_key(run(FRONTAL, payload))
    assert "line_not_across_garment" in measurements["shoulder_width_cm"].cautions
    assert "line_not_along_garment_length" in measurements["body_length_cm"].cautions
    assert "polyline_backtracks" in measurements["sleeve_length_cm"].cautions


def test_cautions_are_human_readable_and_always_include_the_estimate_notice() -> None:
    outcome = run(FRONTAL)
    assert outcome.cautions[0] == CAUTIONS["estimated"]
    assert (
        CAUTIONS["chest_flat"] in outcome.cautions
        and CAUTIONS["reference_attested"] in outcome.cautions
    )
    assert all(not caution.islower() and " " in caution for caution in outcome.cautions)
