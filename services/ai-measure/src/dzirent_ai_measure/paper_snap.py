"""ROI-guided US Letter corner proposals (POST /v1/calibrate-paper, schema paper-calibrate.v0).

The lender drags an approximate quadrilateral over the sheet; this module searches only a bounded region
around it for a bright, neutral, four-sided outline, ranks candidates by overlap with the approximate quad,
physical consistency with a portrait 8.5 x 11 rectangle and edge contrast on all four sides, and refines
the winner's edges to sub-pixel precision at full resolution.

It only *proposes* corners. Nothing here changes a stored calibration or proves the sheet's physical size:
the proposal must be reviewed and confirmed by the user, and US Letter size rests on their attestation.
When the sheet blends with the background, is cut off by the frame, or competes with another bright
region, the answer is an honest `not_found`, `invalid` or `ambiguous` with no corners.

Coordinates in and out are intrinsic pixels of the decoded, upright image with (0, 0) at the top-left
corner of the top-left pixel (the browser convention); OpenCV's pixel-centre convention is used inside.
"""

from dataclasses import dataclass, field
from typing import Annotated, Final, Literal

import cv2
import numpy as np
from numpy.typing import NDArray
from pydantic import Field

from .annotation import Point, Strict, invalid, load_strict
from .geometry import Matrix, camera_fit, quad_problem, signed_area
from .imaging import DecodedImage
from .measure import CalibrationStatus, assess_calibration

SCHEMA_VERSION: Final = "paper-calibrate.v0"
ALGORITHM_VERSION: Final = "roi-paper-snap-0.1.0"
DetectionStatus = Literal["snapped", "not_found", "ambiguous", "invalid"]

PIXEL_CENTRE: Final = 0.5  # browser (corner-origin) minus OpenCV (centre-origin) coordinates
ROI_MARGIN: Final = 0.6  # search margin as a fraction of the approximate quad's longest side
MIN_ROI_MARGIN_PX: Final = 24.0
ANALYSIS_LONG_SIDE: Final = 900  # candidate search resolution for the ROI; refinement is full-res
MIN_APPROX_SIDE_PX: Final = 16.0
MIN_IOU: Final = 0.25  # a proposal must overlap the lender's approximate quad at least this much
RIVAL_IOU: Final = 0.1  # any plausible sheet overlapping this much competes as a rival
RIVAL_LOCALITY: Final = 0.6  # a rival overlapping >= 60% as much as the best makes it ambiguous
AREA_RATIO: Final = (0.35, 2.8)  # candidate area relative to the approximate quad
MIN_FILL: Final = 0.9  # contour area / fitted quad area (a solid four-sided region)
MAX_SHAPE_RESIDUAL: Final = 0.10  # looser than calibration's 0.06; calibration reports the rest
MIN_SIDE_CONTRAST: Final = 12.0  # grey levels, inside brighter than outside, on every side
AMBIGUITY_RATIO: Final = 0.85  # a distinct rival scoring this close to the best makes it ambiguous
MERGED_AREA_RATIO: Final = 1.8
MOSTLY_COVERED: Final = (
    0.6  # a bright region covering this much of the approximate quad is "the" sheet
)
EDGE_MARGIN_PX: Final = 2.0
LARGE_ADJUSTMENT: Final = 0.15  # fraction of the approximate quad's diagonal
STRAIGHTNESS_PX: Final = 1.0
STRAIGHTNESS_RELATIVE: Final = 0.004
GRADIENT_MIN: Final = 2.0  # grey levels per pixel at a usable edge sample
STRUCTURAL_PROBLEMS: Final = {
    "corners_collinear": "Three or more approximate corners are on one line.",
    "corners_crossed": "The approximate corner lines cross; use top-left, top-right, bottom-right, "
    "bottom-left order.",
    "corners_not_convex": "The approximate corners do not form a convex outline.",
    "corners_wrong_order": "The approximate corners run counter-clockwise; use top-left, top-right, "
    "bottom-right, bottom-left order.",
}

MANUAL_CONFIRMATION: Final = "manual_corner_confirmation_required"
MANUAL_UNCHANGED: Final = "manual_corners_unchanged"


class PaperRequest(Strict):
    schema_version: Literal["paper-calibrate.v0"]
    reference_type: Literal["us_letter"]
    approx_corners_px: Annotated[list[Point], Field(min_length=4, max_length=4)]  # TL TR BR BL


def parse_request(raw: str) -> PaperRequest:
    return load_strict(PaperRequest, raw, "paper-calibrate.v0")


def check_approx_corners(request: PaperRequest, width: int, height: int) -> Matrix:
    """Bounds and structure of the approximate quad; returns it in OpenCV pixel-centre coordinates."""
    for index, (x, y) in enumerate(request.approx_corners_px):
        if not (0 <= x <= width and 0 <= y <= height):
            raise invalid(
                f"Point is outside the {width}×{height} px photo; send intrinsic image pixels.",
                f"approx_corners_px.{index}",
                "invalid_geometry",
            )
    corners = np.array(request.approx_corners_px, dtype=np.float64)
    problem = quad_problem(corners)
    if problem in STRUCTURAL_PROBLEMS:
        raise invalid(STRUCTURAL_PROBLEMS[problem], "approx_corners_px", "invalid_geometry")
    return corners - PIXEL_CENTRE


@dataclass(frozen=True)
class SnapResult:
    status: DetectionStatus
    reasons: list[str]
    corners_px: list[Point] | None = None  # browser convention, rounded to 0.1 px
    calibration_status: CalibrationStatus | None = None


@dataclass
class Candidate:
    corners: Matrix  # intrinsic, OpenCV convention, TL TR BR BL
    small: Matrix  # analysis-resolution ROI coordinates
    score: float
    iou: float
    notes: list[str] = field(default_factory=list)


@dataclass
class Flags:
    off_frame: bool = False
    merged: bool = False
    beyond_roi: bool = False


def _sample(gray: NDArray[np.float32], points: Matrix) -> NDArray[np.float32]:
    """Bilinear samples at float coordinates of any leading shape (..., 2)."""
    shape = points.shape[:-1]
    flat = points.reshape(-1, 2).astype(np.float32)
    values = cv2.remap(
        gray,
        flat[:, 0].reshape(-1, 1),
        flat[:, 1].reshape(-1, 1),
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return np.asarray(values, dtype=np.float32).reshape(shape)


def _outward_normals(quad: Matrix) -> Matrix:
    # For TL→TR→BR→BL (positive signed area, y down) the outward normal of p→q is (dy, -dx).
    edges = np.roll(quad, -1, axis=0) - quad
    unit = edges / np.linalg.norm(edges, axis=1, keepdims=True)
    return np.stack([unit[:, 1], -unit[:, 0]], axis=1)


def side_contrast(gray: NDArray[np.float32], quad: Matrix) -> float:
    """Smallest median (inside − outside) brightness step across the four sides."""
    normals = _outward_normals(quad)
    steps = np.array([3.0, 4.0, 5.0, 6.0])
    worst = np.inf
    for i in range(4):
        p, q = quad[i], quad[(i + 1) % 4]
        along = p + np.linspace(0.15, 0.85, 24)[:, None] * (q - p)
        inside = _sample(gray, along[:, None, :] - steps[None, :, None] * normals[i])
        outside = _sample(gray, along[:, None, :] + steps[None, :, None] * normals[i])
        worst = min(worst, float(np.median(inside.mean(axis=1) - outside.mean(axis=1))))
    return worst


def _order_like(quad: Matrix, reference: Matrix) -> Matrix:
    if signed_area(quad) < 0:
        quad = quad[::-1]
    rotations = [np.roll(quad, -shift, axis=0) for shift in range(4)]
    return min(rotations, key=lambda r: float(np.linalg.norm(r - reference, axis=1).sum()))


def _polygon_mask(shape: tuple[int, int], quad: Matrix) -> NDArray[np.bool_]:
    mask = np.zeros(shape, dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.round(quad * 16).astype(np.int32), 1, cv2.LINE_8, 4)
    return mask.astype(bool)


def _iou(a: NDArray[np.bool_], b: NDArray[np.bool_]) -> float:
    union = int(np.count_nonzero(a | b))
    return int(np.count_nonzero(a & b)) / union if union else 0.0


def _fit_quad(contour: NDArray[np.int32]) -> Matrix | None:
    hull = cv2.convexHull(contour)
    perimeter = cv2.arcLength(hull, True)
    for epsilon in (0.01, 0.015, 0.02, 0.03, 0.04, 0.06):
        approx = cv2.approxPolyDP(hull, epsilon * perimeter, True)
        if len(approx) == 4:
            return np.asarray(approx.reshape(4, 2), dtype=np.float64)
    return None


def _intersect(p1: Matrix, v1: Matrix, p2: Matrix, v2: Matrix) -> Matrix | None:
    denominator = v1[0] * v2[1] - v1[1] * v2[0]
    if abs(denominator) < 1e-9:
        return None
    s = ((p2[0] - p1[0]) * v2[1] - (p2[1] - p1[1]) * v2[0]) / denominator
    return np.asarray(p1 + s * v1, dtype=np.float64)


def _edge_offsets(profiles: NDArray[np.float32], offsets: Matrix) -> Matrix:
    """Sub-pixel position of the bright→dark step in each outward profile (NaN where there is none).

    The step is located where the profile crosses halfway between the inside (paper) and outside
    (surface) levels, taking the crossing nearest the steepest descent. For an area-sampled edge the
    half-level crossing of linearly interpolated samples is unbiased; peak-gradient picking is not,
    because linear interpolation makes the gradient piecewise constant.
    """
    band = max(2, len(offsets) // 5)
    inside = profiles[:, :band].mean(axis=1)
    outside = profiles[:, -band:].mean(axis=1)
    half = (inside + outside) / 2
    steepest = np.argmin(np.gradient(profiles, axis=1), axis=1)
    result = np.full(len(profiles), np.nan)
    for row in np.nonzero(inside - outside >= GRADIENT_MIN * 4)[0]:
        values = profiles[row] - half[row]
        crossings = np.nonzero((values[:-1] >= 0) & (values[1:] < 0))[0]
        if not len(crossings):
            continue
        j = int(crossings[np.argmin(np.abs(crossings - steepest[row]))])
        step = offsets[j + 1] - offsets[j]
        result[row] = offsets[j] + step * values[j] / (values[j] - values[j + 1])
    return result


def refine_corners(
    gray: NDArray[np.float32], quad: Matrix, search_px: float
) -> tuple[Matrix, float] | None:
    """Sub-pixel corners from straight-line fits to the strongest bright→dark step along each side.

    Returns refined corners and the worst side's RMS distance of edge samples from its line, or None when
    an edge cannot be followed (the caller then keeps the coarse corners and says so).
    """
    normals = _outward_normals(quad)
    offsets = np.arange(-search_px, search_px + 1e-9, 0.25)
    lines: list[tuple[Matrix, Matrix]] = []
    worst_rms = 0.0
    for i in range(4):
        p, q = quad[i], quad[(i + 1) % 4]
        count = int(np.clip(np.linalg.norm(q - p) / 3, 16, 120))
        along = p + np.linspace(0.12, 0.88, count)[:, None] * (q - p)
        profiles = _sample(gray, along[:, None, :] + offsets[None, :, None] * normals[i])
        shift = _edge_offsets(profiles, offsets)
        found = np.isfinite(shift)
        if int(found.sum()) < 8:
            return None
        points = along[found] + shift[found, None] * normals[i]
        vx, vy, x0, y0 = cv2.fitLine(
            points.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01
        ).ravel()
        direction, origin = np.array([vx, vy], np.float64), np.array([x0, y0], np.float64)
        rel = points - origin
        distances = np.abs(rel[:, 0] * direction[1] - rel[:, 1] * direction[0])
        worst_rms = max(worst_rms, float(np.sqrt(np.mean(distances**2))))
        lines.append((origin, direction))
    corners = []
    for i in range(4):
        corner = _intersect(*lines[(i - 1) % 4], *lines[i])
        if corner is None or np.linalg.norm(corner - quad[i]) > 2 * search_px:
            return None
        corners.append(corner)
    return np.array(corners), worst_rms


def search_roi(approx: Matrix, width: int, height: int) -> tuple[int, int, int, int]:
    sides = np.linalg.norm(np.roll(approx, -1, axis=0) - approx, axis=1)
    margin = max(MIN_ROI_MARGIN_PX, ROI_MARGIN * float(sides.max()))
    x0, y0 = np.floor(approx.min(axis=0) - margin).astype(int)
    x1, y1 = np.ceil(approx.max(axis=0) + margin).astype(int) + 1
    return max(0, int(x0)), max(0, int(y0)), min(width, int(x1)), min(height, int(y1))


def snap_paper(image: DecodedImage, approx: Matrix) -> SnapResult:
    """Proposes refined corners for the sheet under `approx` (OpenCV-convention intrinsic pixels)."""
    if image.full is None:
        raise ValueError("snap_paper needs the full-resolution image (decode with keep_full=True)")
    sides = np.linalg.norm(np.roll(approx, -1, axis=0) - approx, axis=1)
    if sides.min() < MIN_APPROX_SIDE_PX:
        return SnapResult("invalid", ["approx_quad_too_small", MANUAL_UNCHANGED])

    x0, y0, x1, y1 = search_roi(approx, image.width, image.height)
    crop = image.full[y0:y1, x0:x1]
    scale = min(1.0, ANALYSIS_LONG_SIDE / max(crop.shape[:2]))
    small = np.asarray(
        crop
        if scale >= 1
        else cv2.resize(
            crop,
            (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale))),
            interpolation=cv2.INTER_AREA,
        ),
        dtype=np.uint8,
    )
    sy, sx = small.shape[0] / crop.shape[0], small.shape[1] / crop.shape[1]
    offset = np.array([x0, y0], dtype=np.float64)
    factors = np.array([sx, sy])
    gray_small = np.asarray(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), dtype=np.float32)
    saturation = np.asarray(cv2.cvtColor(small, cv2.COLOR_BGR2HSV)[..., 1], dtype=np.uint8)
    approx_small = (approx - offset) * factors
    approx_mask = _polygon_mask(gray_small.shape, approx_small)
    approx_area = float(np.count_nonzero(approx_mask))
    # Which ROI sides lie on the image frame (a region touching them may continue out of view).
    on_frame = (x0 == 0, y0 == 0, x1 == image.width, y1 == image.height)

    gray_full = np.asarray(
        cv2.GaussianBlur(
            np.asarray(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), dtype=np.float32), (0, 0), 1.0
        ),
        dtype=np.float32,
    )
    search_px = max(3.0, 2.5 / min(sx, sy))

    flags = Flags()
    candidates: list[Candidate] = []
    for threshold in _thresholds(gray_small, approx_small):
        mask = ((gray_small > threshold) & (saturation <= 80)).astype(np.uint8)
        mask = np.asarray(
            cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.uint8
        )
        mask = np.asarray(
            cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), np.uint8
        )
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < 0.2 * approx_area:
                continue
            region = np.zeros_like(mask)
            cv2.drawContours(region, [contour], -1, 1, thickness=cv2.FILLED)
            covered = np.count_nonzero(region.astype(bool) & approx_mask) / approx_area
            if covered < 0.2:
                continue  # not the region the lender pointed at
            bx, by, bw, bh = cv2.boundingRect(contour)
            touches = (bx <= 0, by <= 0, bx + bw >= mask.shape[1], by + bh >= mask.shape[0])
            if any(t and f for t, f in zip(touches, on_frame, strict=True)):
                flags.off_frame = True
                continue
            leaves_roi = any(t and not f for t, f in zip(touches, on_frame, strict=True))
            # The bright region under the quad continuing into something else means a merge.
            if covered >= MOSTLY_COVERED and (leaves_roi or area > MERGED_AREA_RATIO * approx_area):
                flags.merged = True
            if leaves_roi:
                flags.beyond_roi = flags.beyond_roi or bool(covered < MOSTLY_COVERED)
                continue
            candidate = _evaluate(
                np.asarray(contour, np.int32), area, approx, approx_small, approx_mask, approx_area, gray_small, gray_full,
                offset, factors, search_px, image,
            )  # fmt: skip
            if candidate is None:
                continue
            if isinstance(candidate, str):  # its refined corners reach the frame edge
                flags.off_frame = True
                continue
            duplicate = next(
                (c for c in candidates if _iou(_polygon_mask(gray_small.shape, c.small),
                                               _polygon_mask(gray_small.shape, candidate.small)) > 0.8),
                None,
            )  # fmt: skip
            if duplicate is None:
                candidates.append(candidate)
            elif candidate.score > duplicate.score:
                candidates[candidates.index(duplicate)] = candidate

    if candidates:
        candidates.sort(key=lambda c: c.score, reverse=True)
        best = candidates[0]
        rivals = [
            c
            for c in candidates[1:]
            if c.iou >= RIVAL_LOCALITY * best.iou or c.score >= AMBIGUITY_RATIO * best.score
        ]
        if rivals:
            return SnapResult("ambiguous", ["multiple_candidates", MANUAL_UNCHANGED])
        if best.iou >= MIN_IOU:
            return _snapped(image, best)
        flags.beyond_roi = True  # a sheet is nearby but the approximate quad is not on it

    # No usable outline: explain why, most fundamental cause first.
    if not _looks_like_paper(small, approx_mask):
        return SnapResult("not_found", ["paper_not_detected", MANUAL_UNCHANGED])
    if _region_contrast(gray_small, approx_small) < MIN_SIDE_CONTRAST:
        return SnapResult("not_found", ["low_contrast_with_background", MANUAL_UNCHANGED])
    if flags.off_frame:
        return SnapResult("invalid", ["paper_corner_out_of_frame", MANUAL_UNCHANGED])
    if flags.merged:
        return SnapResult(
            "ambiguous", ["paper_merges_with_adjacent_white_region", MANUAL_UNCHANGED]
        )
    if flags.beyond_roi:
        return SnapResult("not_found", ["paper_extends_beyond_search_area", MANUAL_UNCHANGED])
    return SnapResult("not_found", ["paper_outline_not_confident", MANUAL_UNCHANGED])


def _evaluate(
    contour: NDArray[np.int32],
    area: float,
    approx: Matrix,
    approx_small: Matrix,
    approx_mask: NDArray[np.bool_],
    approx_area: float,
    gray_small: NDArray[np.float32],
    gray_full: NDArray[np.float32],
    offset: Matrix,
    factors: Matrix,
    search_px: float,
    image: DecodedImage,
) -> "Candidate | Literal['off_frame'] | None":
    quad_small = _fit_quad(contour)
    if quad_small is None:
        return None
    quad_small = _order_like(quad_small, approx_small)
    if area / max(abs(signed_area(quad_small)), 1.0) < MIN_FILL:
        return None
    if not AREA_RATIO[0] <= abs(signed_area(quad_small)) / approx_area <= AREA_RATIO[1]:
        return None
    overlap = _iou(_polygon_mask(gray_small.shape, quad_small), approx_mask)
    if overlap < RIVAL_IOU or quad_problem(quad_small) is not None:
        return None
    contrast = side_contrast(gray_small, quad_small)
    if contrast < MIN_SIDE_CONTRAST:
        return None

    coarse_crop = quad_small / factors
    notes: list[str] = []
    refined = refine_corners(gray_full, coarse_crop, search_px)
    if refined is None:
        corners_crop, notes = coarse_crop, ["subpixel_refinement_unavailable"]
    else:
        corners_crop, rms = refined
        side = float(np.linalg.norm(np.roll(corners_crop, -1, axis=0) - corners_crop, axis=1).min())
        if rms > max(STRAIGHTNESS_PX, STRAIGHTNESS_RELATIVE * side):
            notes.append("paper_edges_not_straight")
    corners = corners_crop + offset
    upper = np.array([image.width - 1, image.height - 1], dtype=np.float64)
    if (corners < EDGE_MARGIN_PX - PIXEL_CENTRE).any() or (
        corners > upper - EDGE_MARGIN_PX + PIXEL_CENTRE
    ).any():
        return "off_frame"
    if quad_problem(corners) is not None:
        return None
    residual = camera_fit(corners, image.width, image.height).residual
    if residual > MAX_SHAPE_RESIDUAL:
        return None
    diagonal = float(np.linalg.norm(approx[2] - approx[0]))
    if float(np.linalg.norm(corners - approx, axis=1).max()) > LARGE_ADJUSTMENT * diagonal:
        notes.append("large_adjustment_from_approximate_corners")
    score = (
        0.45 * overlap
        + 0.30 * min(1.0, contrast / 48.0)
        + 0.25 * (1.0 - residual / MAX_SHAPE_RESIDUAL)
    )
    return Candidate(corners=corners, small=quad_small, score=score, iou=overlap, notes=notes)


def _thresholds(gray: NDArray[np.float32], approx_small: Matrix) -> list[float]:
    """Brightness cut-offs to try: global and local Otsu, and midway between sheet and surround.

    A single global cut-off fails on light surfaces (it separates dark garments from everything else),
    so local statistics around the approximate quad are tried as well.
    """
    pixels = gray.astype(np.uint8)
    cuts = [float(cv2.threshold(pixels, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[0])]
    centre = approx_small.mean(axis=0)
    near = _polygon_mask(gray.shape, centre + (approx_small - centre) * 1.3)
    if np.count_nonzero(near) > 64:
        local = pixels[near].reshape(-1, 1)
        cuts.append(float(cv2.threshold(local, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[0]))
    inside, ring = _inside_and_ring(gray, approx_small)
    if inside - ring >= MIN_SIDE_CONTRAST:
        cuts.append((inside + ring) / 2)
    return sorted({round(cut, 1) for cut in cuts})


def _inside_and_ring(gray: NDArray[np.float32], approx_small: Matrix) -> tuple[float, float]:
    centre = approx_small.mean(axis=0)
    inner = _polygon_mask(gray.shape, centre + (approx_small - centre) * 0.7)
    outer = _polygon_mask(gray.shape, centre + (approx_small - centre) * 1.3)
    ring = outer & ~_polygon_mask(gray.shape, centre + (approx_small - centre) * 1.05)
    if not inner.any() or not ring.any():
        return 0.0, 0.0
    return float(np.median(gray[inner])), float(np.median(gray[ring]))


def _looks_like_paper(small: NDArray[np.uint8], approx_mask: NDArray[np.bool_]) -> bool:
    hsv = np.asarray(cv2.cvtColor(small, cv2.COLOR_BGR2HSV), dtype=np.uint8)
    inside = hsv[approx_mask].astype(np.float64)
    if not len(inside):
        return False
    neutral_bright = (inside[:, 1] <= 70) & (inside[:, 2] >= 110)
    return bool(neutral_bright.mean() >= 0.4)


def _region_contrast(gray: NDArray[np.float32], approx_small: Matrix) -> float:
    inside, ring = _inside_and_ring(gray, approx_small)
    return inside - ring


def _snapped(image: DecodedImage, best: Candidate) -> SnapResult:
    # Geometric diagnostic only: the same checks /v1/measure applies, never a size certification.
    calibration = assess_calibration(image, best.corners)
    status: CalibrationStatus = calibration.status
    if status == "valid" and set(best.notes) - {"large_adjustment_from_approximate_corners"}:
        status = "uncertain"  # unrefined or bowed edges
    reasons = [MANUAL_CONFIRMATION, *calibration.reasons, *best.notes]
    browser = best.corners + PIXEL_CENTRE
    return SnapResult(
        "snapped",
        list(dict.fromkeys(reasons)),
        corners_px=[(round(float(x), 1), round(float(y), 1)) for x, y in browser],
        calibration_status=status,
    )
