"""Stable error envelope: error.code, error.message, error.details, request_id."""

import logging
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .models import Error, ErrorBody

Detail = dict[str, str | int | float | bool | None]
log = logging.getLogger("dzirent.errors")

HTTP_CODES = {
    400: ("bad_request", "The request could not be read."),
    401: ("unauthenticated", "Identity required."),
    403: ("forbidden", "Not allowed."),
    404: ("not_found", "Not found."),
    405: ("method_not_allowed", "Method not allowed."),
    409: ("conflict", "Conflicting request."),
    413: ("payload_too_large", "Request too large."),
    415: ("unsupported_media_type", "Unsupported content type."),
    422: ("validation_error", "Check the submitted fields."),
    429: ("rate_limited", "Try again later."),
    503: ("dependency_unavailable", "Service temporarily unavailable."),
}


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: Sequence[Detail] = (),
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = list(details)
        self.headers = headers


def field_error(field: str, issue: str, message: str) -> Detail:
    return {"field": field, "issue": issue, "message": message}


def invalid(*details: Detail, message: str = "Check the submitted fields.") -> ApiError:
    return ApiError(422, "validation_error", message, details)


def not_found(message: str = "Not found.") -> ApiError:
    return ApiError(404, "not_found", message)


def unavailable(message: str = "Service temporarily unavailable.") -> ApiError:
    return ApiError(503, "dependency_unavailable", message)


def request_id_of(request: Request) -> str:
    return str(getattr(request.state, "request_id", "unknown"))


def envelope(
    request_id: str, code: str, message: str, details: Sequence[Detail] = ()
) -> dict[str, Any]:
    body = Error(
        error=ErrorBody(code=code, message=message, details=list(details)), request_id=request_id
    )
    return body.model_dump(mode="json")


def error_response(
    request: Request,
    status: int,
    code: str,
    message: str,
    details: Sequence[Detail] = (),
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=envelope(request_id_of(request), code, message, details),
        headers=headers,
    )


def _validation_details(exc: RequestValidationError) -> list[Detail]:
    # Field location, error type and the framework's message only; never echo the raw input.
    details: list[Detail] = []
    for item in exc.errors()[:50]:
        loc = ".".join(str(part) for part in item.get("loc", ()))
        details.append(
            field_error(loc, str(item.get("type", "invalid")), str(item.get("msg", "Invalid")))
        )
    return details


def install_error_handlers(app: FastAPI) -> None:
    async def api_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, ApiError)
        return error_response(request, exc.status, exc.code, exc.message, exc.details, exc.headers)

    async def validation_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)
        return error_response(
            request,
            422,
            "validation_error",
            "Check the submitted fields.",
            _validation_details(exc),
        )

    async def http_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, StarletteHTTPException)
        code, message = HTTP_CODES.get(exc.status_code, ("http_error", "Request failed."))
        headers = dict(exc.headers) if exc.headers else None
        return error_response(request, exc.status_code, code, message, headers=headers)

    async def database_unavailable(request: Request, exc: Exception) -> JSONResponse:
        # Connection, pool and statement-timeout failures are temporary dependency failures.
        log.warning("database unavailable: %s", type(exc).__name__)
        return error_response(
            request, 503, "dependency_unavailable", "Service temporarily unavailable."
        )

    app.add_exception_handler(ApiError, api_error)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(StarletteHTTPException, http_error)
    for exc_type in (OperationalError, InterfaceError, PoolTimeoutError):
        app.add_exception_handler(exc_type, database_unavailable)
