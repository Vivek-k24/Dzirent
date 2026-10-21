"""Calibration assessment and centimetre distances from lender-placed points.

The calculation is deliberately conservative: unreliable calibration yields no numbers, doubtful
calibration yields whole centimetres with cautions, and each measurement can independently be
`not_measurable` with a reason. Nothing here recognises seams; every point comes from the lender.
"""

from dataclasses import dataclass, field
from typing import Final, Literal

import cv2
import numpy as np

from .annotation import GEOMETRY, MEASUREMENT_KEYS, Annotation, Landmark, Point
from .geometry import (
    PAPER_DIAGONAL_CM,
    PAPER_LENGTH_CM,
    PAPER_WIDTH_CM,
    Matrix,
    apply,
    camera_fit,
    fit_homography,
    inside_convex_quad,
    linear_scale_ratio,
    paper_corners_cm,
    path_length,
    quad_problem,
)
from .imaging import DecodedImage

CalibrationStatus = Literal["valid", "uncertain", "invalid"]
MeasurementStatus = Literal["estimated", "not_measurable"]

# Calibration thresholds, chosen from geometry and simulated click noise on synthetic views (not
# field data). 1.5-3 px of corner noise on a 250-500 px sheet gives shape residuals of ~0.01-0.04;
# an A4 sheet mislabelled as US Letter gives ~0.075 and US Legal ~0.23.
MIN_SIDE_PX: Final = 60.0
SMALL_SIDE_PX: Final = 150.0
SHAPE_OK: Final = 0.03  # ≈3% side-ratio or ≈1.7° skew mismatch from an 8.5 × 11 rectangle
SHAPE_MAX: Final = 0.06
TILT_OK_DEG: Final = 25.0
TILT_MAX_DEG: Final = 50.0
ROUND_TRIP_MAX_CM: Final = 0.01
# Per-measurement extrapolation limits, in sheet diagonals (35.3 cm) from the sheet centre. A shirt
# laid beside the sheet typically reaches 2-3 diagonals at the far cuff.
FAR_DIAGONALS: Final = 3.0
MAX_DIAGONALS: Final = 4.5
SCALE_OK: Final = (0.7, 1.4)
SCALE_MAX: Final = (0.5, 2.0)
# Placement sensitivity: how far a value moves (1σ, linearised) if every corner and landmark
# coordinate is off by a typical click error. Used only to choose precision or withhold a value; it
# is not reported as an accuracy or confidence figure.
SENSITIVE_CM: Final = 1.0
TOO_SENSITIVE_CM: Final = 4.0
ALIGNMENT_DEG: Final = 15.0
BACKTRACK_DEG: Final = 120.0
# Generous adult/child ranges; values outside are withheld rather than reported.
PLAUSIBLE_CM: Final[dict[str, tuple[float, float]]] = {
    "shoulder_width_cm": (20.0, 80.0),
    "chest_flat_cm": (20.0, 90.0),
    "body_length_cm": (30.0, 130.0),
    "sleeve_length_cm": (10.0, 100.0),
}

CAUTIONS: Final[dict[str, str]] = {
    "estimated": "All values are estimates from your marked points and the US Letter sheet, pending "
    "your confirmation with a tape measure.",
    "flat_plane": "Only points lying flat on the same surface as the sheet measure correctly; raised "
    "collars, padded shoulders, folds and curved fabric add error.",
    "chest_flat": "Chest is the flat width from underarm to underarm, not the chest circumference.",
    "reference_attested": "The photo cannot prove the sheet's size; results rely on your confirmation "
    "that it is US Letter (8.5 × 11 in).",
    "corners_collinear": "Three or more paper corners are on one line, so they cannot define the sheet.",
    "corners_crossed": "The paper corner lines cross. Place corners in order: top-left, top-right, "
    "bottom-right, bottom-left.",
    "corners_not_convex": "The paper corners do not form a convex sheet outline.",
    "corners_wrong_order": "The paper corners run counter-clockwise. Place them top-left, top-right, "
    "bottom-right, bottom-left.",
    "extreme_perspective": "The sheet is seen at too steep an angle. Hold the camera directly above "
    "the garment.",
    "reference_too_small": "The sheet is too small in the photo for a reliable scale. Move closer.",
    "reference_small_in_frame": "The sheet is small in the photo, so corner placement errors matter "
    "more. Move closer if you can.",
    "paper_orientation_swapped": "The corners look labelled for a sideways sheet. Top-left to "
    "top-right must be the short 8.5 in edge, with the long edge along the garment.",
    "reference_shape_inconsistent": "The corners do not match an 8.5 × 11 in rectangle well. Check "
    "the corner positions and that the sheet is US Letter, flat and uncreased.",
    "camera_not_perpendicular": "The camera was tilted noticeably; hold it more directly overhead.",
    "homography_unstable": "The calibration could not be computed stably from these corners.",
    "reference_region_not_plain_white": "The area inside the corners does not look like a plain "
    "white sheet. Check that the corners sit on the paper itself.",
    "calibration_invalid": "Not calculated because the sheet calibration is unreliable.",
    "not_annotated": "No points were placed for this measurement.",
    "landmark_on_reference": "A point lies on the reference sheet; the garment must lie beside the "
    "sheet, not over it.",
    "beyond_reliable_range": "A point is too far from the sheet for the scale to stay reliable.",
    "perspective_too_strong": "Perspective changes too much between the sheet and these points.",
    "far_from_reference": "Some points are far from the sheet; small tilt errors grow with distance.",
    "perspective_change": "Perspective differs noticeably between the sheet and these points.",
    "outside_plausible_range": "The result is outside the expected range for this garment, so it "
    "is not shown. Check the points and the sheet corners.",
    "line_not_across_garment": "This line is not square across the garment length; place both "
    "points at the same height.",
    "line_not_along_garment_length": "This line is not parallel to the sheet's long edge; place the "
    "hem point straight below the shoulder point.",
    "polyline_backtracks": "The sleeve path doubles back on itself; check the order of its points.",
    "sensitive_to_point_placement": "Small shifts of the sheet corners or these points change the "
    "result noticeably; zoom in to place them precisely or move the camera closer.",
    "too_sensitive_to_point_placement": "Small shifts of the sheet corners or these points change "
    "the result too much to report it. Fill more of the photo with the sheet and garment.",
}


def click_sigma_px(width: int, height: int) -> float:
    # Assumed 1σ placement error: ~1.5 px, growing for large photos usually marked while zoomed out.
    return max(1.5, max(width, height) / 1500)


def placement_sensitivity_cm(corners_px: Matrix, points_px: Matrix, sigma: float) -> float:
    """Linearised 1σ change of the path length for independent errors of `sigma` px per coordinate."""
    target = paper_corners_cm()

    def length(corners: Matrix, points: Matrix) -> float:
        projected, _ = apply(fit_homography(corners, target).matrix, points)
        return path_length(projected)

    variance = 0.0
    for array, is_corner in ((corners_px, True), (points_px, False)):
        for index in np.ndindex(array.shape):
            plus, minus = array.copy(), array.copy()
            plus[index] += sigma
            minus[index] -= sigma
            if is_corner:
                delta = length(plus, points_px) - length(minus, points_px)
            else:
                delta = length(corners_px, plus) - length(corners_px, minus)
            variance += (delta / 2) ** 2
    return float(np.sqrt(variance))


@dataclass(frozen=True)
class Calibration:
    status: CalibrationStatus
    reasons: list[str]
    image_to_cm: Matrix | None = None
    tilt_deg: float | None = None
    shape_residual: float | None = None


@dataclass(frozen=True)
class Measurement:
    key: str
    geometry: str
    points_px: list[Point]
    status: MeasurementStatus
    value_cm: float | None = None
    precision_cm: float | None = None
    points_cm: list[Point] | None = None
    reason: str | None = None
    cautions: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Outcome:
    calibration: Calibration
    measurements: list[Measurement]

    @property
    def cautions(self) -> list[str]:
        codes = ["estimated", "flat_plane", "reference_attested", *self.calibration.reasons]
        for measurement in self.measurements:
            if measurement.key == "chest_flat_cm" and measurement.status == "estimated":
                codes.append("chest_flat")
            codes += [code for code in (measurement.reason, *measurement.cautions) if code]
        unique = [code for code in dict.fromkeys(codes) if code not in {"not_annotated"}]
        return [CAUTIONS[code] for code in unique]

    @property
    def message(self) -> str:
        if self.calibration.status == "invalid":
            return (
                "The sheet corners could not be used, so nothing was calculated. Adjust the "
                "corners or retake the photo."
            )
        if self.calibration.status == "uncertain":
            return (
                "Calibration is uncertain, so values are rounded to whole centimetres. Adjust the "
                "corners or retake the photo if you can."
            )
        return (
            "Estimated from your marked points and the US Letter sheet. Check each value with a "
            "tape measure before confirming."
        )


def reference_looks_plain_white(image: DecodedImage, corners_px: Matrix) -> bool:
    """Coarse photometric sanity check that the marked quad covers a plain, light, neutral sheet."""
    quad = corners_px * image.working_scale
    centre = quad.mean(axis=0)
    inner = np.round(centre + (quad - centre) * 0.8).astype(np.int32)
    mask = np.zeros(image.working.shape[:2], dtype=np.uint8)
    cv2.fillConvexPoly(mask, inner, 255)
    if int(np.count_nonzero(mask)) < 100:
        return True  # too few pixels to judge; the size rules already cover tiny sheets
    hsv = np.asarray(cv2.cvtColor(image.working, cv2.COLOR_BGR2HSV), dtype=np.uint8)
    inside = hsv[mask > 0].astype(np.float64)
    bright_floor = max(90.0, 0.55 * float(np.percentile(hsv[..., 2], 99)))
    paper_like = (inside[:, 2] >= bright_floor) & (inside[:, 1] <= 70)
    return bool(paper_like.mean() >= 0.6 and inside[:, 2].std() <= 35)


def assess_calibration(image: DecodedImage, corners_px: Matrix) -> Calibration:
    problem = quad_problem(corners_px)
    if problem:
        return Calibration("invalid", [problem])
    homography = fit_homography(corners_px, paper_corners_cm())
    if homography.degenerate:
        return Calibration("invalid", ["corners_collinear"])
    round_trip, _ = apply(homography.matrix, corners_px)
    if not np.isfinite(round_trip).all() or (
        np.abs(round_trip - paper_corners_cm()).max() > ROUND_TRIP_MAX_CM
    ):
        return Calibration("invalid", ["homography_unstable"])

    sides = np.linalg.norm(np.roll(corners_px, -1, axis=0) - corners_px, axis=1)
    fit = camera_fit(corners_px, image.width, image.height)
    invalid: list[str] = []
    uncertain: list[str] = []
    if sides.min() < MIN_SIDE_PX:
        invalid.append("reference_too_small")
    elif sides.min() < SMALL_SIDE_PX:
        uncertain.append("reference_small_in_frame")
    if fit.residual > SHAPE_OK and fit.residual_swapped <= SHAPE_OK:
        invalid.append("paper_orientation_swapped")
    elif fit.residual > SHAPE_MAX:
        invalid.append("reference_shape_inconsistent")
    elif fit.residual > SHAPE_OK:
        uncertain.append("reference_shape_inconsistent")
    if fit.tilt_deg > TILT_MAX_DEG:
        invalid.append("extreme_perspective")
    elif fit.tilt_deg > TILT_OK_DEG:
        uncertain.append("camera_not_perpendicular")
    if not invalid and not reference_looks_plain_white(image, corners_px):
        uncertain.append("reference_region_not_plain_white")

    status: CalibrationStatus = "invalid" if invalid else "uncertain" if uncertain else "valid"
    return Calibration(
        status,
        invalid or uncertain,
        image_to_cm=None if invalid else homography.matrix,
        tilt_deg=round(fit.tilt_deg, 1),
        shape_residual=round(fit.residual, 4),
    )


def _angle_from_axis_deg(vector: Matrix, axis: int) -> float:
    # Undirected angle between a segment and the sheet's x (across) or y (lengthwise) axis.
    return float(np.degrees(np.arctan2(abs(vector[1 - axis]), abs(vector[axis]))))


def measure_landmark(
    landmark: Landmark, calibration: Calibration, corners_px: Matrix, sigma_px: float
) -> Measurement:
    key, geometry, points_px = landmark.key, landmark.geometry, list(landmark.points_px)

    def withheld(reason: str) -> Measurement:
        return Measurement(key, geometry, points_px, "not_measurable", reason=reason)

    if calibration.image_to_cm is None:
        return withheld("calibration_invalid")
    pixels = np.array(landmark.points_px, dtype=np.float64)
    if inside_convex_quad(corners_px, pixels).any():
        return withheld("landmark_on_reference")
    points_cm, w = apply(calibration.image_to_cm, pixels)
    _, w_centre = apply(calibration.image_to_cm, corners_px.mean(axis=0, keepdims=True))
    if np.sign(w).min() != np.sign(w_centre[0]) or np.sign(w).max() != np.sign(w_centre[0]):
        return withheld("beyond_reliable_range")  # point is past the plane's horizon line
    sheet_centre = np.array([PAPER_WIDTH_CM / 2, PAPER_LENGTH_CM / 2])
    reach = float(np.linalg.norm(points_cm - sheet_centre, axis=1).max()) / PAPER_DIAGONAL_CM
    scale = linear_scale_ratio(w, float(w_centre[0]))
    if reach > MAX_DIAGONALS:
        return withheld("beyond_reliable_range")
    if scale.min() < SCALE_MAX[0] or scale.max() > SCALE_MAX[1]:
        return withheld("perspective_too_strong")

    value = path_length(points_cm)
    low, high = PLAUSIBLE_CM[landmark.key]
    if not low <= value <= high:
        return withheld("outside_plausible_range")
    sensitivity = placement_sensitivity_cm(corners_px, pixels, sigma_px)
    if sensitivity > TOO_SENSITIVE_CM:
        return withheld("too_sensitive_to_point_placement")

    cautions: list[str] = []
    if sensitivity > SENSITIVE_CM:
        cautions.append("sensitive_to_point_placement")
    if reach > FAR_DIAGONALS:
        cautions.append("far_from_reference")
    if scale.min() < SCALE_OK[0] or scale.max() > SCALE_OK[1]:
        cautions.append("perspective_change")
    span = points_cm[-1] - points_cm[0]
    if landmark.key in {"shoulder_width_cm", "chest_flat_cm"}:
        if _angle_from_axis_deg(span, axis=0) > ALIGNMENT_DEG:
            cautions.append("line_not_across_garment")
    elif landmark.key == "body_length_cm":
        if _angle_from_axis_deg(span, axis=1) > ALIGNMENT_DEG:
            cautions.append("line_not_along_garment_length")
    else:
        segments = np.diff(points_cm, axis=0)
        for a, b in zip(segments, segments[1:], strict=False):
            cosine = float(a @ b) / float(np.linalg.norm(a) * np.linalg.norm(b))
            if np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))) > BACKTRACK_DEG:
                cautions.append("polyline_backtracks")
                break

    # One decimal only when calibration is valid and the measurement itself raised no caution.
    precise = calibration.status == "valid" and not cautions
    precision = 0.1 if precise else 1.0
    return Measurement(
        key,
        geometry,
        points_px,
        "estimated",
        value_cm=round(value, 1) if precise else float(round(value)),
        precision_cm=precision,
        points_cm=[(round(float(x), 2), round(float(y), 2)) for x, y in points_cm],
        cautions=cautions,
    )


def measure(annotation: Annotation, image: DecodedImage) -> Outcome:
    corners_px = np.array(annotation.reference.corners_px, dtype=np.float64)
    calibration = assess_calibration(image, corners_px)
    sigma = click_sigma_px(image.width, image.height)
    by_key = {landmark.key: landmark for landmark in annotation.landmarks}
    measurements = []
    for key in MEASUREMENT_KEYS:
        landmark = by_key.get(key)
        if landmark is None:
            measurements.append(
                Measurement(
                    key=key,
                    geometry=GEOMETRY[key],
                    points_px=[],
                    status="not_measurable",
                    reason="not_annotated",
                )
            )
        else:
            measurements.append(measure_landmark(landmark, calibration, corners_px, sigma))
    return Outcome(calibration=calibration, measurements=measurements)
