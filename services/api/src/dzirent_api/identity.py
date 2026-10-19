"""Verified request identity. Ownership is always derived from the verified subject."""

import logging
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import (
    AuthenticateRequestOptions,
    TokenVerificationErrorReason,
)
from fastapi import Request
from fastapi.security import HTTPBearer

from .errors import ApiError, unavailable
from .settings import Settings

log = logging.getLogger("dzirent.identity")
# Declares the bearer scheme in OpenAPI; verification and the 401 envelope are handled below.
bearer = HTTPBearer(auto_error=False)
MOCK_PREFIX = "mock:"
MOCK_SUBJECT = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
# Failures to reach or read Clerk's signing keys are dependency outages, not bad credentials.
PROVIDER_OUTAGES = {
    TokenVerificationErrorReason.JWK_FAILED_TO_LOAD,
    TokenVerificationErrorReason.JWK_REMOTE_INVALID,
    TokenVerificationErrorReason.SERVER_ERROR,
}


@dataclass(frozen=True)
class Principal:
    provider: Literal["clerk", "mock"]
    subject: str
    email: str | None = None
    name: str | None = None


class Verifier(Protocol):
    def verify(self, authorization: str | None) -> Principal: ...


def unauthenticated(reason: str = "missing") -> ApiError:
    return ApiError(
        401,
        "unauthenticated",
        "Identity required.",
        [{"reason": reason}],
        headers={"WWW-Authenticate": "Bearer"},
    )


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise unauthenticated()
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or " " in token or len(token) > 8192:
        raise unauthenticated("malformed")
    return token


@dataclass(frozen=True)
class _HeaderOnly:
    # Pass only the Authorization header so the SDK never falls back to cookie sessions.
    headers: Mapping[str, str]


class ClerkVerifier:
    def __init__(self, settings: Settings) -> None:
        self.issuer = settings.clerk_issuer.rstrip("/")
        self.options = AuthenticateRequestOptions(
            jwt_key=settings.clerk_jwt_key.get_secret_value() or None,
            secret_key=settings.clerk_secret_key.get_secret_value() or None,
            authorized_parties=list(settings.clerk_authorized_parties),
            audience=settings.clerk_audience or None,
            accepts_token=["session_token"],
        )

    def verify(self, authorization: str | None) -> Principal:
        token = bearer_token(authorization)
        state = authenticate_request(
            _HeaderOnly({"Authorization": f"Bearer {token}"}), self.options
        )
        if not state.is_signed_in or state.payload is None:
            if state.reason in PROVIDER_OUTAGES:
                log.warning(
                    "identity provider unavailable", extra={"reason": state.reason.value[0]}
                )
                raise unavailable("Identity provider temporarily unavailable.")
            reason = state.reason.value[0] if state.reason is not None else "invalid"
            raise unauthenticated(reason)
        payload = state.payload
        # The SDK verifies signature, expiry, nbf and authorized party; issuer is checked here.
        if str(payload.get("iss", "")).rstrip("/") != self.issuer:
            raise unauthenticated("token-invalid-issuer")
        if not isinstance(payload.get("exp"), int):
            raise unauthenticated("token-invalid")
        subject = payload.get("sub")
        if not isinstance(subject, str) or not 0 < len(subject) <= 255:
            raise unauthenticated("token-invalid")
        email = payload.get("email")
        name = payload.get("name")
        return Principal(
            provider="clerk",
            subject=subject,
            email=email if isinstance(email, str) and len(email) <= 320 else None,
            name=name if isinstance(name, str) else None,
        )


class MockVerifier:
    """Local/test demo identity only; Settings refuses it in connected or deployed environments."""

    def __init__(self, settings: Settings) -> None:
        if not settings.mock_identity_allowed or settings.identity_mode != "mock":
            raise RuntimeError("Mock identity is restricted to explicit local/test demo mode")

    def verify(self, authorization: str | None) -> Principal:
        token = bearer_token(authorization)
        if not token.startswith(MOCK_PREFIX):
            raise unauthenticated("token-invalid")
        subject = token[len(MOCK_PREFIX) :]
        if not MOCK_SUBJECT.match(subject):
            raise unauthenticated("token-invalid")
        return Principal(provider="mock", subject=subject, email=f"{subject}@example.invalid")


def build_verifier(settings: Settings) -> Verifier:
    if settings.identity_mode == "mock":
        return MockVerifier(settings)
    return ClerkVerifier(settings)


def current_principal(request: Request) -> Principal:
    verifier: Verifier = request.app.state.verifier
    return verifier.verify(request.headers.get("authorization"))
