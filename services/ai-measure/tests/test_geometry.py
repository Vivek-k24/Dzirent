"""Pure geometry: homography, known distances under perspective, polylines and corner validation.

These prove the math on exact synthetic points; they say nothing about landmark placement or
real-garment accuracy.
"""

import math

import numpy as np
import pytest
from synthetic import LANDMARKS_CM, TRUE_CM, Camera, corners_px, landmarks_px

from dzirent_ai_measure.geometry import (
    PAPER_LENGTH_CM,
    PAPER_WIDTH_CM,
    apply,
    camera_fit,
    fit_homography,
    inside_convex_quad,
    linear_scale_ratio,
    paper_corners_cm,
    path_length,
    quad_problem,
)
from dzirent_ai_measure.measure import SHAPE_MAX, SHAPE_OK

CAMERAS = {
    "frontal": Camera(),
    "tilted_15": Camera(tilt_deg=15, tilt_axis_deg=30, roll_deg=10),
    "tilted_22_rotated": Camera(tilt_deg=22, tilt_axis_deg=120, roll_deg=-20, focal=1300),
    "tilted_35": Camera(tilt_deg=35, tilt_axis_deg=60, distance_cm=150),
    "portrait_photo": Camera(roll_deg=90, width=1200, height=1600, distance_cm=200),
    "telephoto": Camera(focal=4000, distance_cm=350, tilt_deg=10),
    "wide_angle": Camera(focal=600, distance_cm=55, tilt_deg=20),
}


def image_to_cm(camera: Camera) -> np.ndarray:
    return fit_homography(corners_px(camera), paper_corners_cm()).matrix


def test_four_point_homography_reproduces_a_known_mapping() -> None:
    truth = np.array([[1.3, 0.2, 40.0], [-0.1, 0.9, 25.0], [2e-4, -1e-4, 1.0]])
    src = np.array([[0.0, 0.0], [300.0, 10.0], [280.0, 400.0], [-20.0, 380.0]])
    dst, _ = apply(truth, src)
    fitted = fit_homography(src, dst)
    assert not fitted.degenerate
    np.testing.assert_allclose(fitted.matrix, truth, rtol=1e-9, atol=1e-9)
    probe = np.array([[123.0, 45.0], [-50.0, 600.0]])
    np.testing.assert_allclose(apply(fitted.matrix, probe)[0], apply(truth, probe)[0], atol=1e-8)


@pytest.mark.parametrize("camera", CAMERAS.values(), ids=CAMERAS.keys())
def test_known_distances_are_recovered_through_perspective(camera: Camera) -> None:
    homography = image_to_cm(camera)
    for key, pixels in landmarks_px(camera).items():
        points_cm, _ = apply(homography, pixels)
        np.testing.assert_allclose(points_cm, LANDMARKS_CM[key], atol=1e-6)
        assert path_length(points_cm) == pytest.approx(TRUE_CM[key], abs=1e-6)


def test_a_single_pixel_per_cm_scale_is_wrong_on_an_oblique_photo() -> None:
    camera = CAMERAS["tilted_22_rotated"]
    corners = corners_px(camera)
    px_per_cm = float(np.linalg.norm(corners[1] - corners[0])) / PAPER_WIDTH_CM
    naive = (
        float(np.linalg.norm(np.diff(landmarks_px(camera)["body_length_cm"], axis=0))) / px_per_cm
    )
    assert abs(naive - TRUE_CM["body_length_cm"]) > 3.0  # why the homography is required


def test_sleeve_polyline_sums_segments_instead_of_endpoint_distance() -> None:
    sleeve = np.array(LANDMARKS_CM["sleeve_length_cm"])
    assert path_length(sleeve) == pytest.approx(math.hypot(13, 17) + math.hypot(8, 26))
    assert path_length(sleeve) - float(np.linalg.norm(sleeve[-1] - sleeve[0])) > 0.7


@pytest.mark.parametrize(
    "name", ["frontal", "tilted_15", "tilted_22_rotated", "tilted_35", "wide_angle"]
)
def test_camera_fit_accepts_a_true_letter_sheet_and_recovers_tilt(name: str) -> None:
    camera = CAMERAS[name]
    fit = camera_fit(corners_px(camera), camera.width, camera.height)
    assert fit.residual < 0.005
    assert fit.tilt_deg == pytest.approx(camera.tilt_deg, abs=0.5)


@pytest.mark.parametrize(
    ("size_cm", "expected"),
    [((21.0, 29.7), "inconsistent"), ((21.59, 35.56), "inconsistent"), ((27.94, 21.59), "swapped")],
    ids=["a4_sheet", "us_legal_sheet", "sideways_labelling"],
)
def test_camera_fit_flags_sheets_that_are_not_portrait_us_letter(
    size_cm: tuple[float, float], expected: str
) -> None:
    camera = Camera(tilt_deg=10)
    fit = camera_fit(corners_px(camera, *size_cm), camera.width, camera.height)
    assert fit.residual > SHAPE_MAX
    assert (fit.residual_swapped <= SHAPE_OK) == (expected == "swapped")


def test_corner_problems_are_named() -> None:
    good = corners_px(Camera(tilt_deg=15, tilt_axis_deg=30))
    assert quad_problem(good) is None
    tl, tr, br, bl = good
    collinear = np.array([tl, (tl + tr) / 2, tr, bl])
    assert quad_problem(collinear) == "corners_collinear"
    assert quad_problem(np.array([tl, tl + 0.4, br, bl])) == "corners_collinear"  # duplicate corner
    assert quad_problem(np.array([tl, br, tr, bl])) == "corners_crossed"
    assert quad_problem(good[::-1].copy()) == "corners_wrong_order"
    centre = good.mean(axis=0)
    dart = np.array([tl, tr, centre + (centre - br) * 0.5, bl])
    assert quad_problem(dart) == "corners_not_convex"
    sliver = np.array([[100.0, 100.0], [400.0, 100.0], [800.0, 200.0], [500.0, 200.0]])
    assert quad_problem(sliver) == "extreme_perspective"


def test_degenerate_configurations_do_not_produce_a_homography() -> None:
    line = np.array([[0.0, 0.0], [10.0, 10.0], [20.0, 20.0], [30.0, 30.0]])
    assert fit_homography(line, paper_corners_cm()).degenerate


def test_helpers_for_reliability_checks() -> None:
    camera = Camera()
    homography = image_to_cm(camera)
    corners = corners_px(camera)
    assert inside_convex_quad(corners, corners.mean(axis=0, keepdims=True)).all()
    assert not inside_convex_quad(corners, landmarks_px(camera)["chest_flat_cm"]).any()
    _, w_centre = apply(homography, corners.mean(axis=0, keepdims=True))
    _, w = apply(homography, landmarks_px(camera)["sleeve_length_cm"])
    np.testing.assert_allclose(linear_scale_ratio(w, float(w_centre[0])), 1.0, atol=1e-9)
    assert paper_corners_cm()[2].tolist() == [PAPER_WIDTH_CM, PAPER_LENGTH_CM]
