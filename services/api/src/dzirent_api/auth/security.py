"""Host-only cookies and session-bound signed double-submit CSRF challenges."""

import hmac
import time
from hashlib import sha256

from fastapi import Request, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..errors import ApiError, error_response
from ..media_policy import MAX_BYTES, PHOTO_TYPES, raw_upload
from ..settings import Settings
from .crypto import TOKEN_PATTERN, digest, new_token

CSRF_HEADER = "X-Dzirent-CSRF"
CSRF_TTL = 1800
CLIENT_TTL = 86400
UNSAFE = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def session_cookie(settings: Settings) -> str:
    return "__Host-dzirent_session" if cookie_secure(settings) else "dzirent_session"


def cookie_secure(settings: Settings) -> bool:
    return settings.deployed or settings.auth_web_origin.startswith("https://")


def csrf_cookie(settings: Settings) -> str:
    return "__Host-dzirent_csrf" if cookie_secure(settings) else "dzirent_csrf"


def client_cookie(settings: Settings) -> str:
    return "__Host-dzirent_client" if cookie_secure(settings) else "dzirent_client"


def _client_mac(settings: Settings, payload: str) -> str:
    return hmac.new(
        settings.auth_csrf_key.get_secret_value().encode(),
        f"auth-client-v1:{payload}".encode(),
        sha256,
    ).hexdigest()


def client_identity(request: Request, settings: Settings) -> str | None:
    token = request.cookies.get(client_cookie(settings), "")
    if not token.isascii() or len(token) > 200:
        return None
    try:
        nonce, expiry, signature = token.split(".")
        expires_at = int(expiry)
    except (ValueError, TypeError):
        return None
    now = int(time.time())
    if not TOKEN_PATTERN.fullmatch(nonce) or expires_at <= now or expires_at > now + CLIENT_TTL:
        return None
    return (
        digest(nonce)
        if hmac.compare_digest(_client_mac(settings, f"{nonce}.{expiry}"), signature)
        else None
    )


def set_cookie(response: Response, settings: Settings, name: str, value: str, seconds: int) -> None:
    response.set_cookie(
        name,
        value,
        max_age=seconds,
        secure=cookie_secure(settings),
        httponly=True,
        samesite="lax",
        path="/",
    )


def clear_cookies(response: Response, settings: Settings) -> None:
    for name in (session_cookie(settings), csrf_cookie(settings)):
        response.delete_cookie(
            name, secure=cookie_secure(settings), httponly=True, samesite="lax", path="/"
        )


def _signature(settings: Settings, payload: str, session: str) -> str:
    # An anonymous challenge cannot authenticate a session mutation after login rotation.
    message = f"dzirent-csrf-v1:{payload}:{digest(session)}".encode()
    return hmac.new(settings.auth_csrf_key.get_secret_value().encode(), message, sha256).hexdigest()


def issue_csrf(request: Request, response: Response) -> str:
    settings: Settings = request.app.state.settings
    if client_identity(request, settings) is None:
        client_payload = f"{new_token()}.{int(time.time()) + CLIENT_TTL}"
        set_cookie(
            response,
            settings,
            client_cookie(settings),
            f"{client_payload}.{_client_mac(settings, client_payload)}",
            CLIENT_TTL,
        )
    payload = f"{new_token()}.{int(time.time()) + CSRF_TTL}"
    token = f"{payload}.{_signature(settings, payload, request.cookies.get(session_cookie(settings), ''))}"
    set_cookie(response, settings, csrf_cookie(settings), token, CSRF_TTL)
    return token


def require_origin(request: Request, settings: Settings) -> None:
    if request.headers.get("origin") != settings.auth_web_origin:
        raise ApiError(403, "auth_origin_rejected", "Request origin is not allowed.")
    if request.headers.get("sec-fetch-site") not in {None, "same-origin"}:
        raise ApiError(403, "auth_origin_rejected", "Request origin is not allowed.")


def require_csrf(request: Request, settings: Settings) -> None:
    require_origin(request, settings)
    if client_identity(request, settings) is None:
        raise ApiError(403, "auth_csrf_failed", "Refresh the session and try again.")
    token = request.headers.get(CSRF_HEADER, "")
    cookie = request.cookies.get(csrf_cookie(settings), "")
    if (
        not token
        or len(token) > 200
        or not token.isascii()
        or not cookie.isascii()
        or not hmac.compare_digest(token, cookie)
    ):
        raise ApiError(403, "auth_csrf_failed", "Refresh the session and try again.")
    try:
        nonce, expiry, signature = token.split(".")
        expires_at = int(expiry)
    except (ValueError, TypeError) as exc:
        raise ApiError(403, "auth_csrf_failed", "Refresh the session and try again.") from exc
    now = int(time.time())
    expected = _signature(
        settings, f"{nonce}.{expiry}", request.cookies.get(session_cookie(settings), "")
    )
    if (
        not TOKEN_PATTERN.fullmatch(nonce)
        or expires_at <= now
        or expires_at > now + CSRF_TTL
        or not hmac.compare_digest(expected, signature)
    ):
        raise ApiError(403, "auth_csrf_failed", "Refresh the session and try again.")


class NativeTransportMiddleware:
    """Protect every connected mutation, including existing domain routers and login CSRF."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        settings: Settings = request.app.state.settings
        path = request.url.path
        photo_put = raw_upload(path, request.method)
        if not path.startswith("/api/v1/") or (settings.mode != "connected" and not photo_put):
            await self.app(scope, receive, send)
            return

        async def no_cache(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (key, value)
                    for key, value in message.get("headers", [])
                    if key.lower() not in {b"cache-control", b"referrer-policy"}
                ]
                headers.extend(
                    [
                        (b"cache-control", b"no-store"),
                        (b"referrer-policy", b"no-referrer"),
                        (b"x-content-type-options", b"nosniff"),
                    ]
                )
                message = {**message, "headers": headers}
            await send(message)

        buffered_body: bytes | None = None
        try:
            if request.method in UNSAFE:
                if settings.mode == "connected":
                    require_csrf(request, settings)
                content_type = request.headers.get("content-type", "").split(";", 1)[0]
                if photo_put:
                    if content_type not in PHOTO_TYPES:
                        raise ApiError(
                            415, "unsupported_media_type", "Use JPEG, PNG or WebP photo bytes."
                        )
                    limit = MAX_BYTES
                else:
                    if request.method != "DELETE" and content_type != "application/json":
                        raise ApiError(415, "unsupported_media_type", "Use application/json.")
                    limit = 16384 if path.startswith("/api/v1/auth/") else 1048576
                parts: list[bytes] = []
                size = 0
                while True:
                    part = await receive()
                    if part["type"] != "http.request":
                        raise ApiError(400, "bad_request", "Request was interrupted.")
                    chunk = part.get("body", b"")
                    size += len(chunk)
                    if size > limit:
                        raise ApiError(413, "payload_too_large", "Request is too large.")
                    parts.append(chunk)
                    if not part.get("more_body", False):
                        break
                buffered_body = b"".join(parts)
            elif path.startswith("/api/v1/auth/"):
                origin = request.headers.get("origin")
                if origin is not None and origin != settings.auth_web_origin:
                    raise ApiError(403, "auth_origin_rejected", "Request origin is not allowed.")
        except ApiError as exc:
            response = error_response(request, exc.status, exc.code, exc.message)
            await response(scope, receive, no_cache)
            return

        async def replay() -> Message:
            nonlocal buffered_body
            if buffered_body is not None:
                body, buffered_body = buffered_body, None
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, no_cache)
