"""Local/test-only proxy to the internal ai-measure service (AI-MEASURE-1).

Mounted only when DZIRENT_GARMENT_MEASURE_URL is set outside staging/production. The raw multipart
body (photo plus annotation JSON) is streamed through with a hard size cap and never parsed here, so
uploads are not spooled to disk or logged. No URL input exists: the only destination is the
configured internal service. Nothing is written to the listing database.
"""

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .errors import error_response, request_id_of
from .settings import Settings

router = APIRouter(prefix="/api/v1/dev", include_in_schema=False)
log = logging.getLogger("dzirent.dev_garment_measure")
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_ANNOTATION_BYTES = 64 * 1024
# Multipart framing around one 10 MiB image and the annotation field.
MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + MAX_ANNOTATION_BYTES + 256 * 1024
RELAYED_ERRORS = {413, 415, 422}
SCHEMA_VERSION = "ai-measure.v0"
PAPER_SCHEMA_VERSION = "paper-calibrate.v0"
PAPER_DETECTION_STATUSES = {"snapped", "not_found", "ambiguous", "invalid"}
CALIBRATION_STATUSES = {"valid", "uncertain", "invalid"}
# Frozen paper-calibrate.v0 response (#46); anything else from upstream is dropped, never relayed.
PAPER_CONTRACT_KEYS = (
    "schema_version",
    "algorithm_version",
    "request_id",
    "detection_status",
    "reference_type",
    "proposed_corners_px",
    "calibration_status",
    "reason_codes",
    "requires_user_confirmation",
)


def _reject_constant(token: str) -> Any:
    raise ValueError(f"non-finite JSON number {token}")


def unavailable(request: Request) -> JSONResponse:
    return error_response(
        request,
        503,
        "service_unavailable",
        "Garment measurement is temporarily unavailable. Try again.",
    )


def too_large(request: Request) -> JSONResponse:
    return error_response(request, 413, "payload_too_large", "The photo must be 10 MiB or smaller.")


def relayable(status: int, body: Any) -> bool:
    if not isinstance(body, dict):
        return False
    if status == 200:
        return (
            body.get("schema_version") == SCHEMA_VERSION
            and body.get("calibration_status") in CALIBRATION_STATUSES
            and isinstance(body.get("measurements"), dict)
        )
    return status in RELAYED_ERRORS and isinstance(body.get("error"), dict)


@router.post("/garment-measure")
async def measure_garment(request: Request) -> JSONResponse:
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        return error_response(
            request,
            415,
            "unsupported_media_type",
            "Send multipart/form-data with the photo in 'image' and JSON in 'annotation'.",
        )
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:
        return too_large(request)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BYTES:
            return too_large(request)

    settings: Settings = request.app.state.settings
    request_id = request_id_of(request)
    try:
        async with httpx.AsyncClient(
            transport=request.app.state.garment_measure_transport,
            timeout=settings.garment_measure_timeout_s,
            follow_redirects=False,
        ) as client:
            upstream = await client.post(
                f"{settings.garment_measure_url.rstrip('/')}/v1/measure",
                content=bytes(body),
                headers={"content-type": content_type, "x-request-id": request_id},
            )
    except httpx.HTTPError as exc:
        log.warning("garment-measure service unreachable: %s", type(exc).__name__)
        return unavailable(request)
    finally:
        del body
    try:
        payload = upstream.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None
    if not relayable(upstream.status_code, payload):
        # Unexpected status or shape: never pass unknown content through as measurements.
        log.warning("garment-measure service returned unexpected status %s", upstream.status_code)
        return unavailable(request)
    return JSONResponse(status_code=upstream.status_code, content=payload)


@router.post("/paper-calibrate")
async def calibrate_reference_paper(request: Request) -> JSONResponse:
    """Local-only, bounded pass-through to the internal paper corner proposal service.

    No image bytes are persisted; no proposal is accepted as a user-confirmed calibration here.
    """
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        return error_response(
            request,
            415,
            "unsupported_media_type",
            "Send multipart/form-data with an image and the paper-calibrate annotation JSON.",
        )
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:
        return too_large(request)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BYTES:
            return too_large(request)

    settings: Settings = request.app.state.settings
    request_id = request_id_of(request)
    try:
        async with httpx.AsyncClient(
            transport=request.app.state.garment_measure_transport,
            timeout=settings.garment_measure_timeout_s,
            follow_redirects=False,
        ) as client:
            upstream = await client.post(
                f"{settings.garment_measure_url.rstrip('/')}/v1/calibrate-paper",
                content=bytes(body),
                headers={"content-type": content_type, "x-request-id": request_id},
            )
    except httpx.HTTPError as exc:
        log.warning("paper-calibrate service unreachable: %s", type(exc).__name__)
        return unavailable(request)
    finally:
        del body
    try:
        # Strict JSON: NaN/Infinity cannot be re-encoded and are not pixel positions; fail closed.
        payload = json.loads(upstream.content, parse_constant=_reject_constant)
    except ValueError:
        payload = None

    if upstream.status_code == 200 and isinstance(payload, dict):
        status = payload.get("detection_status")
        corners = payload.get("proposed_corners_px")
        diagnostic = payload.get("calibration_status")
        if (
            payload.get("schema_version") == PAPER_SCHEMA_VERSION
            and isinstance(payload.get("algorithm_version"), str)
            and status in PAPER_DETECTION_STATUSES
            and payload.get("reference_type") == "us_letter"
            and payload.get("requires_user_confirmation") is True
            and isinstance(payload.get("reason_codes"), list)
            and all(isinstance(code, str) for code in payload["reason_codes"])
            and (
                (
                    status == "snapped"
                    and diagnostic in CALIBRATION_STATUSES
                    and isinstance(corners, list)
                    and len(corners) == 4
                    and all(
                        isinstance(point, list)
                        and len(point) == 2
                        and all(
                            isinstance(n, (int, float)) and not isinstance(n, bool) for n in point
                        )
                        for point in corners
                    )
                )
                or (status != "snapped" and corners is None and diagnostic is None)
            )
        ):
            # Only contract fields, correlated by the monolith's server-assigned request id.
            relayed = {key: payload.get(key) for key in PAPER_CONTRACT_KEYS}
            return JSONResponse(status_code=200, content={**relayed, "request_id": request_id})
    elif upstream.status_code in RELAYED_ERRORS and isinstance(payload, dict):
        if isinstance(payload.get("error"), dict):
            return JSONResponse(
                status_code=upstream.status_code,
                content={"error": payload["error"], "request_id": request_id},
            )

    log.warning("paper-calibrate service returned unexpected status %s", upstream.status_code)
    return unavailable(request)
