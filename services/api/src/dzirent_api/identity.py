"""Request identity boundary.

The local/test demo verifier is isolated from the connected first-party implementation.
Until native session verification lands, all connected protected requests fail closed.
"""

import re
from dataclasses import dataclass
from typing import Literal, Protocol

from fastapi import Request
from fastapi.security import HTTPBearer

from .errors import ApiError, unavailable
from .settings import Settings

bearer = HTTPBearer(auto_error=False)
MOCK_PREFIX = "mock:"
MOCK_SUBJECT = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


@dataclass(frozen=True)
class Principal:
    provider: Literal["native", "mock"]
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


class NativeVerifier:
    """Temporary denial boundary; Issue #26 adds real server-side sessions.

    Never accept client-supplied subjects, demo tokens, or unverified bearer credentials.
    """

    def verify(self, authorization: str | None) -> Principal:
        raise unavailable("First-party authentication is not available yet.")


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
        if not MOCK_SUBJECT.fullmatch(subject):
            raise unauthenticated("token-invalid")
        return Principal(provider="mock", subject=subject, email=f"{subject}@example.invalid")


def build_verifier(settings: Settings) -> Verifier:
    if settings.identity_mode == "mock":
        return MockVerifier(settings)
    if settings.identity_mode == "native" and settings.mode == "connected":
        return NativeVerifier()
    raise RuntimeError("Unsupported identity configuration")


def current_principal(request: Request) -> Principal:
    verifier: Verifier = request.app.state.verifier
    return verifier.verify(request.headers.get("authorization"))
