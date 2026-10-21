"""Planar geometry for a US Letter reference sheet (pure NumPy; no pixels are read here).

Image points are intrinsic pixels with y pointing down. World points are centimetres on the surface
plane: the sheet spans x in [0, 21.59] (short edge, TL→TR) and y in [0, 27.94] (long edge, TL→BL).
The physical size is a server constant; clients never supply sheet dimensions.
"""

from dataclasses import dataclass
from typing import Final

import numpy as np
from numpy.typing import NDArray

Matrix = NDArray[np.float64]

PAPER_WIDTH_CM: Final = 21.59  # 8.5 in
PAPER_LENGTH_CM: Final = 27.94  # 11 in
PAPER_DIAGONAL_CM: Final = float(np.hypot(PAPER_WIDTH_CM, PAPER_LENGTH_CM))


def paper_corners_cm(width: float = PAPER_WIDTH_CM, length: float = PAPER_LENGTH_CM) -> Matrix:
    return np.array([[0.0, 0.0], [width, 0.0], [width, length], [0.0, length]])  # TL TR BR BL


# Smallest singular-value ratio of the DLT system below which the four points do not define a
# unique homography (three or four nearly collinear corners).
DEGENERATE_SV_RATIO: Final = 1e-7
# Interior corner angles outside these bounds cannot come from a usable view of a rectangle.
COLLINEAR_ANGLE_DEG: Final = 5.0
EXTREME_ANGLE_DEG: Final = (25.0, 155.0)
# Focal lengths searched for the rectangle-consistency fit, as multiples of the image long side
# (covers phone ultra-wide ≈0.36 through 5x telephoto ≈3.5 with margin).
FOCAL_GRID: Final = np.geomspace(0.3, 6.0, 600)


def to_homogeneous(points: Matrix) -> Matrix:
    return np.hstack([points, np.ones((len(points), 1))])


def apply(matrix: Matrix, points: Matrix) -> tuple[Matrix, Matrix]:
    """Projects points through a homography; returns (xy, w) so callers can check the w sign."""
    projected = to_homogeneous(points) @ matrix.T
    w = projected[:, 2]
    with np.errstate(divide="ignore", invalid="ignore"):
        xy = projected[:, :2] / w[:, None]
    return xy, w


def _normalizer(points: Matrix) -> Matrix:
    centroid = points.mean(axis=0)
    spread = float(np.linalg.norm(points - centroid, axis=1).mean())
    scale = np.sqrt(2) / spread if spread > 0 else 1.0
    return np.array(
        [[scale, 0.0, -scale * centroid[0]], [0.0, scale, -scale * centroid[1]], [0.0, 0.0, 1.0]]
    )


@dataclass(frozen=True)
class Homography:
    matrix: Matrix  # maps src → dst, scaled so that matrix[2, 2] == 1 where possible
    sv_ratio: float  # conditioning of the point configuration (0 = degenerate)

    @property
    def degenerate(self) -> bool:
        return self.sv_ratio < DEGENERATE_SV_RATIO or not np.isfinite(self.matrix).all()


def fit_homography(src: Matrix, dst: Matrix) -> Homography:
    """Exact four-point DLT with Hartley normalisation."""
    src_t, dst_t = _normalizer(src), _normalizer(dst)
    s, _ = apply(src_t, src)
    d, _ = apply(dst_t, dst)
    rows = []
    for (x, y), (u, v) in zip(s, d, strict=True):
        rows.append([-x, -y, -1.0, 0.0, 0.0, 0.0, u * x, u * y, u])
        rows.append([0.0, 0.0, 0.0, -x, -y, -1.0, v * x, v * y, v])
    _, singular, vt = np.linalg.svd(np.array(rows))
    normalized = vt[-1].reshape(3, 3)
    matrix = np.linalg.inv(dst_t) @ normalized @ src_t
    matrix = matrix / matrix[2, 2] if abs(matrix[2, 2]) > 1e-12 else matrix
    return Homography(matrix=matrix, sv_ratio=float(singular[-1] / singular[0]))


def _cross(a: Matrix, b: Matrix) -> float:
    return float(a[0] * b[1] - a[1] * b[0])


def _segments_cross(p1: Matrix, p2: Matrix, q1: Matrix, q2: Matrix) -> bool:
    d1, d2 = _cross(q2 - q1, p1 - q1), _cross(q2 - q1, p2 - q1)
    d3, d4 = _cross(p2 - p1, q1 - p1), _cross(p2 - p1, q2 - p1)
    return d1 * d2 < 0 and d3 * d4 < 0


def interior_angles_deg(quad: Matrix) -> Matrix:
    previous, following = np.roll(quad, 1, axis=0) - quad, np.roll(quad, -1, axis=0) - quad
    norms = np.linalg.norm(previous, axis=1) * np.linalg.norm(following, axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        cosine = np.clip((previous * following).sum(axis=1) / norms, -1.0, 1.0)
    return np.asarray(np.degrees(np.arccos(np.nan_to_num(cosine, nan=1.0))), dtype=np.float64)


def signed_area(quad: Matrix) -> float:
    # Positive for TL→TR→BR→BL in y-down image coordinates (clockwise on screen).
    x, y = quad[:, 0], quad[:, 1]
    return float(0.5 * (x * np.roll(y, -1) - np.roll(x, -1) * y).sum())


def quad_problem(quad: Matrix) -> str | None:
    """First structural reason the four corners cannot define the sheet, if any."""
    sides = np.linalg.norm(np.roll(quad, -1, axis=0) - quad, axis=1)
    angles = interior_angles_deg(quad)
    if (
        sides.min() < 1.0
        or angles.min() < COLLINEAR_ANGLE_DEG
        or angles.max() > 180 - COLLINEAR_ANGLE_DEG
    ):
        return "corners_collinear"
    if _segments_cross(quad[0], quad[1], quad[2], quad[3]) or _segments_cross(
        quad[1], quad[2], quad[3], quad[0]
    ):
        return "corners_crossed"
    turns = [
        _cross(quad[(i + 1) % 4] - quad[i], quad[(i + 2) % 4] - quad[(i + 1) % 4]) for i in range(4)
    ]
    if not (all(t > 0 for t in turns) or all(t < 0 for t in turns)):
        return "corners_not_convex"
    if signed_area(quad) < 0:
        return "corners_wrong_order"
    if angles.min() < EXTREME_ANGLE_DEG[0] or angles.max() > EXTREME_ANGLE_DEG[1]:
        return "extreme_perspective"
    return None


@dataclass(frozen=True)
class CameraFit:
    residual: float  # 0 when the corners are exactly a 21.59 × 27.94 rectangle in some pinhole view
    residual_swapped: float  # same, with the sheet's short/long edges exchanged
    tilt_deg: float  # angle between the camera axis and the surface normal at the best fit
    focal_px: float


def _rectangle_residuals(
    corners_px: Matrix, center: Matrix, long_side: float, width: float, length: float
) -> tuple[Matrix, Matrix, Matrix]:
    world_to_image = fit_homography(paper_corners_cm(width, length), corners_px).matrix
    shift = np.array([[1.0, 0.0, -center[0]], [0.0, 1.0, -center[1]], [0.0, 0.0, 1.0]])
    centred = shift @ world_to_image
    focal = FOCAL_GRID * long_side
    # Columns of K^-1 H for each candidate focal length (principal point at the image centre).
    r1 = np.stack(
        [centred[0, 0] / focal, centred[1, 0] / focal, np.full_like(focal, centred[2, 0])], 1
    )
    r2 = np.stack(
        [centred[0, 1] / focal, centred[1, 1] / focal, np.full_like(focal, centred[2, 1])], 1
    )
    n1, n2 = np.linalg.norm(r1, axis=1), np.linalg.norm(r2, axis=1)
    # A true rectangle of this size needs equal-length, orthogonal rotation columns.
    residual = np.maximum(np.abs(np.log(n1 / n2)), np.abs((r1 * r2).sum(axis=1)) / (n1 * n2))
    return residual, r1, r2


def camera_fit(corners_px: Matrix, image_width: int, image_height: int) -> CameraFit:
    """How well the corners match a US Letter rectangle seen by a plausible pinhole camera.

    With four exact correspondences a homography always fits, so reprojection error is zero by
    construction. Consistency is checked instead against the physical model: some focal length must
    make the sheet's edge directions orthogonal and its 8.5:11 sides equal in metric scale.
    Assumes square pixels and a roughly central principal point (uncropped photo).
    """
    center = np.array([image_width / 2.0, image_height / 2.0])
    long_side = float(max(image_width, image_height))
    residual, r1, r2 = _rectangle_residuals(
        corners_px, center, long_side, PAPER_WIDTH_CM, PAPER_LENGTH_CM
    )
    swapped, _, _ = _rectangle_residuals(
        corners_px, center, long_side, PAPER_LENGTH_CM, PAPER_WIDTH_CM
    )
    best = int(np.argmin(residual))
    normal = np.cross(r1[best], r2[best])
    tilt = float(np.degrees(np.arccos(min(1.0, abs(normal[2]) / np.linalg.norm(normal)))))
    return CameraFit(
        residual=float(residual[best]),
        residual_swapped=float(swapped.min()),
        tilt_deg=tilt,
        focal_px=float(FOCAL_GRID[best] * long_side),
    )


def linear_scale_ratio(w_point: Matrix, w_reference: float) -> Matrix:
    """Local cm-per-pixel at each point relative to the sheet centre.

    For a homography the Jacobian determinant is det(H) / w^3 (det(H) cancels in the ratio), so the
    linear ratio is (|w_ref| / |w|)^(3/2). Values far from 1 mean strong perspective change between
    the sheet and the point.
    """
    return np.asarray((abs(w_reference) / np.abs(w_point)) ** 1.5, dtype=np.float64)


def inside_convex_quad(quad: Matrix, points: Matrix) -> NDArray[np.bool_]:
    edges = np.roll(quad, -1, axis=0) - quad
    rel = points[:, None, :] - quad[None, :, :]
    side = edges[None, :, 0] * rel[:, :, 1] - edges[None, :, 1] * rel[:, :, 0]
    return np.asarray((side >= 0).all(axis=1) | (side <= 0).all(axis=1))


def path_length(points_cm: Matrix) -> float:
    return float(np.linalg.norm(np.diff(points_cm, axis=0), axis=1).sum())
