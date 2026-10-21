"""The `annotation` form field (schema ai-measure.v0): strict parsing and coordinate validation."""

import math
from typing import Annotated, Any, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

MAX_ANNOTATION_BYTES: Final = 64 * 1024
MAX_POLYLINE_POINTS: Final = 20
MIN_SEGMENT_PX: Final = 1.0

MeasurementKey = Literal["shoulder_width_cm", "chest_flat_cm", "body_length_cm", "sleeve_length_cm"]
MEASUREMENT_KEYS: Final[tuple[MeasurementKey, ...]] = (
    "shoulder_width_cm",
    "chest_flat_cm",
    "body_length_cm",
    "sleeve_length_cm",
)
# Straight seam-to-seam distances are lines; the sleeve follows its outer seam as a polyline.
GEOMETRY: Final[dict[str, str]] = {
    "shoulder_width_cm": "line",
    "chest_flat_cm": "line",
    "body_length_cm": "line",
    "sleeve_length_cm": "polyline",
}
SUPPORTED_GARMENT_CLASSES: Final = {"sleeved_top"}

Point = tuple[float, float]


class AnnotationRejected(Exception):
    def __init__(
        self, status: int, code: str, message: str, details: list[dict[str, str]] | None = None
    ) -> None:
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details or []


class Strict(BaseModel):
    # Unknown fields are refused, so a client cannot smuggle in sheet sizes or scale factors.
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False, frozen=True)


class Reference(Strict):
    type: Literal["us_letter"]
    user_confirmed: bool
    corners_px: Annotated[list[Point], Field(min_length=4, max_length=4)]  # TL, TR, BR, BL


class Landmark(Strict):
    key: MeasurementKey
    geometry: Literal["line", "polyline"]
    points_px: Annotated[list[Point], Field(min_length=2, max_length=MAX_POLYLINE_POINTS)]


class Annotation(Strict):
    schema_version: Literal["ai-measure.v0"]
    garment_class: Annotated[str, Field(max_length=64)]
    reference: Reference
    landmarks: Annotated[list[Landmark], Field(max_length=len(MEASUREMENT_KEYS))]


def _field(location: tuple[Any, ...]) -> str:
    return ".".join(str(part) for part in location) or "annotation"


def invalid(
    message: str, field: str = "annotation", code: str = "invalid_payload"
) -> AnnotationRejected:
    return AnnotationRejected(422, code, message, [{"field": field, "problem": message}])


def load_strict[Model: Strict](model: type[Model], raw: str, schema: str) -> Model:
    """Size-capped strict JSON validation shared by every annotation schema of this service."""
    if len(raw.encode()) > MAX_ANNOTATION_BYTES:
        raise AnnotationRejected(
            413, "payload_too_large", "The annotation must be 64 KiB or smaller."
        )
    try:
        return model.model_validate_json(raw)
    except ValidationError as exc:
        # Locations and messages only: submitted values are never echoed back.
        details = [
            {"field": _field(error["loc"]), "problem": error["msg"]}
            for error in exc.errors(include_input=False, include_url=False)[:20]
        ]
        raise AnnotationRejected(
            422,
            "invalid_payload",
            f"The annotation does not match schema {schema}.",
            details,
        ) from None


def parse(raw: str) -> Annotation:
    annotation = load_strict(Annotation, raw, "ai-measure.v0")
    if annotation.garment_class not in SUPPORTED_GARMENT_CLASSES:
        raise invalid(
            "Only flat-laid sleeved tops (shirt, blouse, blazer, jacket) are supported.",
            "garment_class",
            "unsupported_garment_class",
        )
    if annotation.reference.user_confirmed is not True:
        raise invalid(
            "Confirm that the reference is an actual US Letter (8.5 × 11 in) sheet.",
            "reference.user_confirmed",
            "reference_not_confirmed",
        )
    seen: set[str] = set()
    for index, landmark in enumerate(annotation.landmarks):
        where = f"landmarks.{index}"
        if landmark.key in seen:
            raise invalid(f"'{landmark.key}' is annotated more than once.", f"{where}.key")
        seen.add(landmark.key)
        expected = GEOMETRY[landmark.key]
        if landmark.geometry != expected:
            raise invalid(f"'{landmark.key}' must use geometry '{expected}'.", f"{where}.geometry")
        if expected == "line" and len(landmark.points_px) != 2:
            raise invalid(f"'{landmark.key}' needs exactly two points.", f"{where}.points_px")
    return annotation


def check_coordinates(annotation: Annotation, width: int, height: int) -> None:
    """Coordinates are intrinsic pixels of the decoded, upright image (not display/CSS pixels)."""

    def in_frame(points: list[Point], field: str) -> None:
        for index, (x, y) in enumerate(points):
            if not (0 <= x <= width and 0 <= y <= height):
                raise invalid(
                    f"Point is outside the {width}×{height} px photo; send intrinsic image pixels.",
                    f"{field}.{index}",
                    "invalid_geometry",
                )

    in_frame(annotation.reference.corners_px, "reference.corners_px")
    for index, landmark in enumerate(annotation.landmarks):
        field = f"landmarks.{index}.points_px"
        in_frame(landmark.points_px, field)
        for step, (a, b) in enumerate(
            zip(landmark.points_px, landmark.points_px[1:], strict=False)
        ):
            if math.hypot(a[0] - b[0], a[1] - b[1]) < MIN_SEGMENT_PX:
                raise invalid(
                    "Consecutive points coincide; every segment needs a non-zero length.",
                    f"{field}.{step + 1}",
                    "invalid_geometry",
                )
