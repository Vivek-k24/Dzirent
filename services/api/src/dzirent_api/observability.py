"""Structured JSON logs with request IDs and redaction of identity tokens and secrets."""

import json
import logging
import re
import sys
import time
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .errors import envelope

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
INCOMING_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
REDACTIONS = [
    (re.compile(r"(?i)bearer\s+[^\s\"',]+"), "Bearer [REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"), "[REDACTED_JWT]"),
    (re.compile(r"(://[^:/@\s]+:)[^@\s]+@"), r"\1[REDACTED]@"),
    (re.compile(r"\b(sk|pk|whsec)_(live|test)_[A-Za-z0-9]+"), "[REDACTED_KEY]"),
    (re.compile(r"-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----"), "[REDACTED_PEM]"),
]
STANDARD_FIELDS = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def redact(value: str) -> str:
    for pattern, replacement in REDACTIONS:
        value = pattern.sub(replacement, value)
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact(record.getMessage()),
        }
        request_id = getattr(record, "request_id", None) or request_id_var.get()
        if request_id:
            entry["request_id"] = request_id
        for key, value in vars(record).items():
            if key not in STANDARD_FIELDS and not key.startswith("_"):
                entry[key] = redact(value) if isinstance(value, str) else value
        if record.exc_info:
            entry["exception"] = redact(self.formatException(record.exc_info))
        return json.dumps(entry, default=str)


class _JsonHandler(logging.StreamHandler):  # type: ignore[type-arg]
    pass


def configure_logging(level: str) -> None:
    # Replace only our own handler so repeated app creation never duplicates log lines.
    handler = _JsonHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [h for h in root.handlers if not isinstance(h, _JsonHandler)] + [handler]
    root.setLevel(level)
    for name in ("uvicorn", "uvicorn.error"):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
    # The middleware below logs each request without query strings or headers.
    logging.getLogger("uvicorn.access").disabled = True


class RequestContextMiddleware:
    """Assigns request IDs, logs one line per request and converts crashes to a safe 500."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.log = logging.getLogger("dzirent.request")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if INCOMING_REQUEST_ID.match(incoming) else str(uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500
        response_started = False

        async def send_with_id(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            self.log.exception("unhandled error")
            if response_started:
                raise
            body = json.dumps(
                envelope(request_id, "internal_error", "Unexpected server error.")
            ).encode()
            await send_with_id(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
        finally:
            self.log.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id_var.reset(token)
