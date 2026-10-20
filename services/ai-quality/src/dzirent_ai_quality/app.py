"""Local/test-only photo-quality service (AI-QUALITY-1 contract, schema ai-quality.v0)."""

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
from .analysis import CheckResult, Decision, Status, analyze, message_for
from .imaging import MAX_BYTES, ImageRejected, decode

SCHEMA_VERSION: Final = "ai-quality.v0"
ALGORITHM_VERSION = "quality-rules-0.1.0"
# Multipart framing around a 10 MiB image; anything larger is refused before buffering.
MAX_REQUEST_BYTES = MAX_BYTES + 256 * 1024
REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
DEPLOYED = {"staging", "production"}
log = logging.getLogger("dzirent.ai_quality")

# Uploaded evidence must never touch disk: keep multipart files in memory up to the size cap
# (Starlette's default spills anything over 1 MiB to a temporary file).
MultiPartParser.spool_max_size = MAX_REQUEST_BYTES


class Check(BaseModel):
    status: Status
    reason: str


class Checks(BaseModel):
    blur: Check
    exposure: Check
    paper: Check
    framing: Check


class QualityResult(BaseModel):
    schema_version: Literal["ai-quality.v0"] = SCHEMA_VERSION
    algorithm_version: str = ALGORITHM_VERSION
    request_id: str
    decision: Decision
    checks: Checks
    message: str


def safe_request_id(candidate: str | None) -> str:
    # Callers may correlate requests, but unsafe values are replaced rather than echoed.
    return candidate if candidate and REQUEST_ID.match(candidate) else str(uuid4())


def error(status: int, code: str, message: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {"code": code, "message": message, "details": []},
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


def create_app() -> FastAPI:
    environment = os.environ.get("DZIRENT_ENVIRONMENT", "local")
    if environment in DEPLOYED:
        raise RuntimeError(
            "The ai-quality service is local/test-only and refuses deployed environments"
        )
    configure_logging()
    app = FastAPI(title="dzirent ai-quality (local/test only)", version=__version__)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error(
            422,
            "invalid_image",
            "Attach one JPEG or PNG photo in the 'image' form field.",
            safe_request_id(request.headers.get("x-request-id")),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = (
            "invalid_image"
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
        # Rule-based heuristics only: there is no ML model to load or report as available.
        return {
            "status": "ok",
            "service": "ai-quality",
            "analysis": "rule-based heuristics; no ML model",
        }

    @app.get("/version")
    def version() -> dict[str, str]:
        return {
            "service_version": __version__,
            "schema_version": SCHEMA_VERSION,
            "algorithm_version": ALGORITHM_VERSION,
            "opencv_version": cv2.__version__,
        }

    @app.post("/v1/check", response_model=QualityResult, responses={413: {}, 415: {}, 422: {}})
    async def check(
        request: Request, image: UploadFile = File(...), request_id: str | None = Form(default=None)
    ) -> Any:
        rid = safe_request_id(request_id or request.headers.get("x-request-id"))
        started = time.perf_counter()
        data = await image.read()
        try:
            decoded = decode(data)
        except ImageRejected as rejected:
            log.info(json.dumps({"event": "rejected", "request_id": rid, "code": rejected.code}))
            return error(rejected.status, rejected.code, rejected.message, rid)
        finally:
            await image.close()
        analysis = await run_in_threadpool(analyze, decoded)
        del data, decoded  # nothing about the photo outlives the request

        def to_check(result: CheckResult) -> Check:
            return Check(status=result.status, reason=result.reason)

        result = QualityResult(
            request_id=rid,
            decision=analysis.decision,
            checks=Checks(
                blur=to_check(analysis.blur),
                exposure=to_check(analysis.exposure),
                paper=to_check(analysis.paper),
                framing=to_check(analysis.framing),
            ),
            message=message_for(analysis),
        )
        statuses = {
            name: getattr(analysis, name).status
            for name in ("blur", "exposure", "paper", "framing")
        }
        log.info(
            json.dumps(
                {
                    "event": "checked",
                    "request_id": rid,
                    "decision": result.decision,
                    "checks": statuses,
                    "ms": round((time.perf_counter() - started) * 1000),
                }
            )
        )
        return result

    app.add_middleware(BodyLimitMiddleware, limit=MAX_REQUEST_BYTES)
    return app
