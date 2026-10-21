"""Local/test-only garment measurement service (AI-MEASURE-1 contract, schema ai-measure.v0)."""

import json
import logging
import os
import re
import sys
import time
from typing import Any, Final, Literal
from uuid import uuid4

import cv2
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartParser
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import __version__
from .annotation import MAX_ANNOTATION_BYTES, AnnotationRejected, Point, check_coordinates, parse
from .geometry import PAPER_LENGTH_CM, PAPER_WIDTH_CM
from .imaging import MAX_BYTES, ImageRejected, decode
from .measure import CalibrationStatus, Measurement, MeasurementStatus, Outcome, measure

SCHEMA_VERSION: Final = "ai-measure.v0"
ALGORITHM_VERSION: Final = "paper-homography-0.1.0"
METHOD: Final = "paper_homography_and_landmarks"
# Multipart framing around a 10 MiB image plus the annotation; anything larger is refused early.
MAX_REQUEST_BYTES = MAX_BYTES + MAX_ANNOTATION_BYTES + 256 * 1024
REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
DEPLOYED = {"staging", "production"}
log = logging.getLogger("dzirent.ai_measure")

# Uploaded evidence must never touch disk: keep multipart files in memory up to the size cap
# (Starlette's default spills anything over 1 MiB to a temporary file).
MultiPartParser.spool_max_size = MAX_REQUEST_BYTES


class PaperSize(BaseModel):
    width: float = PAPER_WIDTH_CM
    length: float = PAPER_LENGTH_CM


class CalibrationOut(BaseModel):
    reference: Literal["us_letter"] = "us_letter"
    user_confirmed: bool
    paper_cm: PaperSize = PaperSize()
    corners_px: list[Point]
    reasons: list[str]
    camera_tilt_deg: float | None
    shape_residual: float | None


class ImageSize(BaseModel):
    width: int
    height: int


class MeasurementOut(BaseModel):
    key: str
    status: MeasurementStatus
    value_cm: float | None
    precision_cm: float | None
    unit: Literal["cm"] = "cm"
    reason: str | None
    geometry: str
    points_px: list[Point]
    points_cm: list[Point] | None
    method: Literal["paper_homography_and_landmarks"] = METHOD
    confirmed_by_lender: Literal[False] = False
    cautions: list[str]


class MeasureResult(BaseModel):
    schema_version: Literal["ai-measure.v0"] = SCHEMA_VERSION
    algorithm_version: str = ALGORITHM_VERSION
    request_id: str
    garment_class: Literal["sleeved_top"]
    calibration_status: CalibrationStatus
    calibration: CalibrationOut
    image: ImageSize
    method: Literal["paper_homography_and_landmarks"] = METHOD
    confirmed_by_lender: Literal[False] = False
    measurements: dict[str, MeasurementOut]
    cautions: list[str]
    message: str


def safe_request_id(candidate: str | None) -> str:
    # Callers may correlate requests, but unsafe values are replaced rather than echoed.
    return candidate if candidate and REQUEST_ID.match(candidate) else str(uuid4())


def error(
    status: int,
    code: str,
    message: str,
    request_id: str,
    details: list[dict[str, str]] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {"code": code, "message": message, "details": details or []},
            "request_id": request_id,
        },
    )


class BodyLimitMiddleware:
    """Rejects oversized request bodies with 413 by declared length or while streaming."""

    def __init__(self, app: ASGIApp, limit: int) -> None:
        self.app, self.limit = app, limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        request_id = safe_request_id(headers.get(b"x-request-id", b"").decode("latin-1"))
        too_large = error(
            413, "payload_too_large", "The photo must be 10 MiB or smaller.", request_id
        )
        declared = headers.get(b"content-length", b"")
        if declared.isdigit() and int(declared) > self.limit:
            await too_large(scope, receive, send)
            return
        received, exceeded, replaced = 0, False, False

        async def limited_receive() -> Message:
            nonlocal received, exceeded
            if exceeded:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    # Stop feeding the parser; the app's own error response is replaced below.
                    # (Raising here would be swallowed by FastAPI's form parsing as a 400.)
                    exceeded = True
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal replaced
            if not exceeded:
                await send(message)
            elif not replaced and message["type"] == "http.response.start":
                replaced = True
                await too_large(scope, receive, send)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not exceeded:
                raise
        if exceeded and not replaced:
            await too_large(scope, receive, send)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.handlers, log.propagate = [handler], False
    log.setLevel(logging.INFO)


def to_out(measurement: Measurement) -> MeasurementOut:
    return MeasurementOut(
        key=measurement.key,
        status=measurement.status,
        value_cm=measurement.value_cm,
        precision_cm=measurement.precision_cm,
        reason=measurement.reason,
        geometry=measurement.geometry,
        points_px=measurement.points_px,
        points_cm=measurement.points_cm,
        cautions=measurement.cautions,
    )


def build_result(
    request_id: str, corners_px: list[Point], width: int, height: int, outcome: Outcome
) -> MeasureResult:
    calibration = outcome.calibration
    return MeasureResult(
        request_id=request_id,
        garment_class="sleeved_top",
        calibration_status=calibration.status,
        calibration=CalibrationOut(
            user_confirmed=True,
            corners_px=corners_px,
            reasons=calibration.reasons,
            camera_tilt_deg=calibration.tilt_deg,
            shape_residual=calibration.shape_residual,
        ),
        image=ImageSize(width=width, height=height),
        measurements={m.key: to_out(m) for m in outcome.measurements},
        cautions=outcome.cautions,
        message=outcome.message,
    )


def create_app() -> FastAPI:
    environment = os.environ.get("DZIRENT_ENVIRONMENT", "local")
    if environment in DEPLOYED:
        raise RuntimeError(
            "The ai-measure service is local/test-only and refuses deployed environments"
        )
    configure_logging()
    app = FastAPI(title="dzirent ai-measure (local/test only)", version=__version__)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        missing = {str(error["loc"][-1]) for error in exc.errors() if error.get("loc")}
        code = "invalid_image" if "image" in missing else "invalid_payload"
        return error(
            422,
            code,
            "Send one JPEG or PNG photo in 'image' and the annotation JSON in 'annotation'.",
            safe_request_id(request.headers.get("x-request-id")),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = (
            "invalid_payload"
            if exc.status_code == 400
            else "not_found"
            if exc.status_code == 404
            else "request_failed"
        )
        status = 422 if exc.status_code == 400 else exc.status_code
        return error(
            status, code, str(exc.detail), safe_request_id(request.headers.get("x-request-id"))
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        # Geometry from lender-placed points only: there is no model and no seam recognition.
        return {
            "status": "ok",
            "service": "ai-measure",
            "analysis": "planar homography from user-confirmed corners; no ML model",
        }

    @app.get("/version")
    def version() -> dict[str, str]:
        return {
            "service_version": __version__,
            "schema_version": SCHEMA_VERSION,
            "algorithm_version": ALGORITHM_VERSION,
            "opencv_version": cv2.__version__,
        }

    @app.post("/v1/measure", response_model=MeasureResult, responses={413: {}, 415: {}, 422: {}})
    async def measure_garment(
        request: Request,
        image: UploadFile = File(...),
        annotation: str = Form(...),
        request_id: str | None = Form(default=None),
    ) -> Any:
        rid = safe_request_id(request_id or request.headers.get("x-request-id"))
        started = time.perf_counter()
        data = await image.read()
        try:
            # The media type is judged first, then the annotation against the decoded size.
            decoded = decode(data)
            parsed = parse(annotation)
            check_coordinates(parsed, decoded.width, decoded.height)
        except (ImageRejected, AnnotationRejected) as rejected:
            log.info(json.dumps({"event": "rejected", "request_id": rid, "code": rejected.code}))
            details = rejected.details if isinstance(rejected, AnnotationRejected) else None
            return error(rejected.status, rejected.code, rejected.message, rid, details)
        finally:
            await image.close()
        outcome = await run_in_threadpool(measure, parsed, decoded)
        result = build_result(
            rid, list(parsed.reference.corners_px), decoded.width, decoded.height, outcome
        )
        del data, decoded  # nothing about the photo outlives the request
        log.info(
            json.dumps(
                {
                    "event": "measured",
                    "request_id": rid,
                    "calibration": result.calibration_status,
                    "statuses": {key: m.status for key, m in result.measurements.items()},
                    "ms": round((time.perf_counter() - started) * 1000),
                }
            )
        )
        return result

    app.add_middleware(BodyLimitMiddleware, limit=MAX_REQUEST_BYTES)
    return app
