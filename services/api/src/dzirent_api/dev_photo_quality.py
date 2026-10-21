"""Local/test-only proxy to the internal ai-quality service (AI-QUALITY-1).

Mounted only when DZIRENT_PHOTO_QUALITY_URL is set outside staging/production. The raw multipart body is
streamed through with a hard size cap and never parsed here, so uploads are not spooled to disk or logged.
No URL input exists: the only destination is the configured internal service.
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
log = logging.getLogger("dzirent.dev_photo_quality")
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 256 * 1024  # multipart framing around one 10 MiB image
RELAYED_ERRORS = {413, 415, 422}
SCHEMA_VERSION = "ai-quality.v0"


def unavailable(request: Request) -> JSONResponse:
    return error_response(
        request, 503, "service_unavailable", "Photo checking is temporarily unavailable. Try again."
    )


def too_large(request: Request) -> JSONResponse:
    return error_response(request, 413, "payload_too_large", "The photo must be 10 MiB or smaller.")


def relayable(status: int, body: Any) -> bool:
    if not isinstance(body, dict):
        return False
    if status == 200:
        return body.get("schema_version") == SCHEMA_VERSION and isinstance(body.get("checks"), dict)
    return status in RELAYED_ERRORS and isinstance(body.get("error"), dict)


@router.post("/photo-quality")
async def check_photo_quality(request: Request) -> JSONResponse:
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("multipart/form-data"):
        return error_response(
            request,
            415,
            "unsupported_media_type",
            "Send the photo as multipart/form-data in the 'image' field.",
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
            transport=request.app.state.photo_quality_transport,
            timeout=settings.photo_quality_timeout_s,
            follow_redirects=False,
        ) as client:
            upstream = await client.post(
                f"{settings.photo_quality_url.rstrip('/')}/v1/check",
                content=bytes(body),
                headers={"content-type": content_type, "x-request-id": request_id},
            )
    except httpx.HTTPError as exc:
        log.warning("photo-quality service unreachable: %s", type(exc).__name__)
        return unavailable(request)
    finally:
        del body
    try:
        payload = upstream.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None
    if not relayable(upstream.status_code, payload):
        # Unexpected status or shape: never pass unknown content through as an analysis result.
        log.warning("photo-quality service returned unexpected status %s", upstream.status_code)
        return unavailable(request)
    return JSONResponse(status_code=upstream.status_code, content=payload)
