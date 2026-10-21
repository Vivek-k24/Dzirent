"""Deterministic synthetic scenes: a pinhole camera viewing a flat surface with a known sheet and shirt.

World coordinates are centimetres on the surface plane with the US Letter sheet's top-left corner at
the origin (x across the short edge, y along the long edge). Every landmark has an exact,
hand-computable true length, so tests check the math, not landmark detection or field accuracy.
"""

import math
from dataclasses import dataclass, replace

import cv2
import numpy as np
from numpy.typing import NDArray

from dzirent_ai_measure.geometry import paper_corners_cm

Matrix = NDArray[np.float64]

# A flat-laid shirt beside the sheet. True lengths: shoulder 42.0, chest flat 50.0, body 70.0,
# sleeve hypot(13, 17) + hypot(8, 26) ≈ 48.604.
LANDMARKS_CM: dict[str, list[tuple[float, float]]] = {
    "shoulder_width_cm": [(43.0, 3.0), (85.0, 3.0)],
    "chest_flat_cm": [(39.0, 24.0), (89.0, 24.0)],
    "body_length_cm": [(56.0, 1.0), (56.0, 71.0)],
    "sleeve_length_cm": [(85.0, 3.0), (98.0, 20.0), (106.0, 46.0)],
}
TRUE_CM = {
    "shoulder_width_cm": 42.0,
    "chest_flat_cm": 50.0,
    "body_length_cm": 70.0,
    "sleeve_length_cm": math.hypot(13, 17) + math.hypot(8, 26),
}
SHIRT_OUTLINE_CM = [
    (43, 3), (56, 0), (72, 0), (85, 3), (98, 20), (106, 46), (98, 49), (89, 30), (89, 71),
    (39, 71), (39, 30), (30, 49), (22, 46), (30, 20),
]  # fmt: skip


@dataclass(frozen=True)
class Camera:
    width: int = 1600
    height: int = 1200
    focal: float = 1600.0  # pixels
    tilt_deg: float = 0.0  # rotation of the optical axis away from the surface normal
    tilt_axis_deg: float = 0.0  # direction of the tilt in the surface plane
    roll_deg: float = 0.0  # rotation about the optical axis
    distance_cm: float = 140.0  # along the optical axis to the target point
    target_cm: tuple[float, float] = (56.0, 36.0)  # surface point at the image centre
    principal_shift: float = 0.0  # used only for supersampled rendering

    def world_to_image(self) -> Matrix:
        def rot_z(deg: float) -> Matrix:
            c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
            return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])

        def rot_x(deg: float) -> Matrix:
            c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
            return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])

        # Camera axes start aligned with the world (x right, y down the image, z into the surface).
        tilt = rot_z(self.tilt_axis_deg) @ rot_x(self.tilt_deg) @ rot_z(-self.tilt_axis_deg)
        rotation = (rot_z(self.roll_deg) @ tilt).T  # world → camera
        axis_in_world = rotation.T @ np.array([0.0, 0.0, 1.0])
        target = np.array([*self.target_cm, 0.0])
        centre = target - self.distance_cm * axis_in_world
        translation = -rotation @ centre
        cx, cy = self.width / 2 + self.principal_shift, self.height / 2 + self.principal_shift
        intrinsics = np.array([[self.focal, 0.0, cx], [0.0, self.focal, cy], [0.0, 0.0, 1.0]])
        homography = intrinsics @ np.column_stack([rotation[:, 0], rotation[:, 1], translation])
        return homography / homography[2, 2]

    def project(self, points_cm: list[tuple[float, float]] | Matrix) -> Matrix:
        pts = np.asarray(points_cm, dtype=np.float64)
        homogeneous = np.hstack([pts, np.ones((len(pts), 1))]) @ self.world_to_image().T
        assert (homogeneous[:, 2] > 0).all(), "scene point behind the camera"
        return homogeneous[:, :2] / homogeneous[:, 2:]


def corners_px(camera: Camera, width_cm: float = 21.59, length_cm: float = 27.94) -> Matrix:
    return camera.project(paper_corners_cm(width_cm, length_cm))


def landmarks_px(camera: Camera) -> dict[str, Matrix]:
    return {key: camera.project(points) for key, points in LANDMARKS_CM.items()}


def render(
    camera: Camera,
    paper_color: tuple[int, int, int] = (244, 244, 242),
    paper_size_cm: tuple[float, float] = (21.59, 27.94),
    seed: int = 7,
    *,
    paper: bool = True,
    surface_color: tuple[int, int, int] = (96, 118, 138),  # muted wooden floor, BGR
    shirt_color: tuple[int, int, int] = (118, 64, 42),  # navy
    shirt_offset_cm: tuple[float, float] = (0.0, 0.0),
    extra_sheets_cm: tuple[tuple[float, float], ...] = (),  # offsets of further white sheets
    supersample: int = 1,
) -> NDArray[np.uint8]:
    """Renders the scene. `supersample > 1` draws at that factor and area-averages down, which removes
    OpenCV's inclusive-boundary fill bias (~0.5 px) so edge positions are accurate to ~0.1 px."""
    if supersample > 1:
        return _render_supersampled(
            camera, paper_color, paper_size_cm, seed, paper, surface_color, shirt_color,
            shirt_offset_cm, extra_sheets_cm, supersample,
        )  # fmt: skip
    rng = np.random.default_rng(seed)
    image = np.empty((camera.height, camera.width, 3), dtype=np.uint8)
    image[:] = surface_color
    noise = rng.normal(0, 4, image.shape)
    image = np.clip(image.astype(np.float64) + noise, 0, 255).astype(np.uint8)

    def fill(points_cm: list[tuple[float, float]] | Matrix, color: tuple[int, int, int]) -> None:
        polygon = np.round(camera.project(points_cm) * 16).astype(np.int32)
        cv2.fillPoly(image, [polygon], color, lineType=cv2.LINE_AA, shift=4)

    for dx, dy in extra_sheets_cm:
        fill(paper_corners_cm(*paper_size_cm) + np.array([dx, dy]), paper_color)
    if paper:
        fill(paper_corners_cm(*paper_size_cm), paper_color)
    fill(np.array(SHIRT_OUTLINE_CM, dtype=np.float64) + np.array(shirt_offset_cm), shirt_color)
    return np.asarray(cv2.GaussianBlur(image, (3, 3), 0.8), dtype=np.uint8)


def _render_supersampled(
    camera: Camera,
    paper_color: tuple[int, int, int],
    paper_size_cm: tuple[float, float],
    seed: int,
    paper: bool,
    surface_color: tuple[int, int, int],
    shirt_color: tuple[int, int, int],
    shirt_offset_cm: tuple[float, float],
    extra_sheets_cm: tuple[tuple[float, float], ...],
    factor: int,
) -> NDArray[np.uint8]:
    # High-res pixel centre s*x + (s-1)/2 averages onto low-res pixel centre x.
    big = replace(
        camera,
        width=camera.width * factor,
        height=camera.height * factor,
        focal=camera.focal * factor,
        principal_shift=(factor - 1) / 2,
    )
    canvas = np.empty((big.height, big.width, 3), dtype=np.uint8)
    canvas[:] = surface_color

    def fill(points_cm: list[tuple[float, float]] | Matrix, color: tuple[int, int, int]) -> None:
        polygon = np.round(big.project(points_cm) * 16).astype(np.int32)
        cv2.fillPoly(canvas, [polygon], color, lineType=cv2.LINE_8, shift=4)

    for dx, dy in extra_sheets_cm:
        fill(paper_corners_cm(*paper_size_cm) + np.array([dx, dy]), paper_color)
    if paper:
        fill(paper_corners_cm(*paper_size_cm), paper_color)
    fill(np.array(SHIRT_OUTLINE_CM, dtype=np.float64) + np.array(shirt_offset_cm), shirt_color)
    image = cv2.resize(canvas, (camera.width, camera.height), interpolation=cv2.INTER_AREA)
    noise = np.random.default_rng(seed).normal(0, 3, image.shape)
    image = np.clip(image.astype(np.float64) + noise, 0, 255).astype(np.uint8)
    return np.asarray(cv2.GaussianBlur(image, (3, 3), 0.8), dtype=np.uint8)


def encode(image: NDArray[np.uint8], ext: str = ".jpg") -> bytes:
    ok, buffer = cv2.imencode(ext, image, [cv2.IMWRITE_JPEG_QUALITY, 92] if ext == ".jpg" else [])
    assert ok
    return buffer.tobytes()


def annotation(
    camera: Camera,
    *,
    corners: Matrix | list[list[float]] | None = None,
    keys: tuple[str, ...] = tuple(LANDMARKS_CM),
    **overrides: object,
) -> dict[str, object]:
    points = landmarks_px(camera)
    geometry = {"sleeve_length_cm": "polyline"}
    payload: dict[str, object] = {
        "schema_version": "ai-measure.v0",
        "garment_class": "sleeved_top",
        "reference": {
            "type": "us_letter",
            "user_confirmed": True,
            "corners_px": np.asarray(
                corners if corners is not None else corners_px(camera)
            ).tolist(),
        },
        "landmarks": [
            {
                "key": key,
                "geometry": geometry.get(key, "line"),
                "points_px": points[key].tolist(),
            }
            for key in keys
        ],
    }
    payload.update(overrides)
    return payload
