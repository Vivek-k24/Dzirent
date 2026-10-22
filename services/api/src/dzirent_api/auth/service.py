"""Synchronous SQLAlchemy native auth; canonical Dzirent users and business roles stay intact."""

import hmac
import secrets
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Literal
from uuid import UUID, uuid4

from fastapi import Request
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from .. import orm, serializers
from ..errors import ApiError, unavailable
from ..settings import Settings
from . import schemas
from .crypto import TOKEN_PATTERN, digest, hash_password, needs_rehash, new_token, verify_password
from .delivery import Purpose, email_delivery, reserved_mailbox
from .dispatch import reserve_after_commit
from .security import client_identity, session_cookie

Capability = Literal["operations:access"]


@dataclass(frozen=True)
class ResolvedSession:
    user: orm.User
    credential: orm.AuthCredential
    session: orm.AuthSession


def native_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    if settings.mode != "connected" or settings.identity_mode != "native":
        raise unavailable("Native accounts are available only in connected mode.")
    return settings


def rejected_login() -> ApiError:
    return ApiError(401, "auth_invalid_credentials", "Invalid email or password.")


def required_session() -> ApiError:
    return ApiError(401, "unauthenticated", "Sign in to continue.")


def throttle(request: Request, action: str, identifier: str = "") -> None:
    """Counters commit independently of a request rollback, using atomic PostgreSQL upserts.

    A signed HttpOnly client cookie separates callers behind the same BFF. Rejected clients
    never consume identifier/global budgets. No asserted forwarded IP/role is trusted.
    """
    settings = native_settings(request)
    factory = request.app.state.sessionmaker
    if factory is None:
        raise unavailable("Database is not configured.")
    now = datetime.now(UTC)
    cutoff = now - timedelta(minutes=15)
    client = client_identity(request, settings)
    if client is None:
        raise ApiError(403, "auth_csrf_failed", "Refresh the session and try again.")
    buckets = [(f"{action}:client", client, 60 if action == "login" else 30)]
    if identifier:
        buckets.append((f"{action}:identity", identifier, 10 if action == "login" else 5))
    buckets.append((f"{action}:aggregate", "global", 2048))
    exceeded = False
    with factory.begin() as counter_session:
        for bucket_action, key, limit in buckets:
            if exceeded:
                break
            key_hash = hmac.new(
                settings.auth_csrf_key.get_secret_value().encode(),
                f"auth-rate-v2:{bucket_action}:{key}".encode(),
                sha256,
            ).hexdigest()
            stale = orm.AuthRateLimit.window_started_at <= cutoff
            attempts = counter_session.scalar(
                insert(orm.AuthRateLimit)
                .values(action=bucket_action, key_hash=key_hash, window_started_at=now, attempts=1)
                .on_conflict_do_update(
                    index_elements=["action", "key_hash"],
                    set_={
                        "attempts": case(
                            (stale, 1), else_=func.least(orm.AuthRateLimit.attempts + 1, 1000000)
                        ),
                        "window_started_at": case(
                            (stale, now), else_=orm.AuthRateLimit.window_started_at
                        ),
                    },
                )
                .returning(orm.AuthRateLimit.attempts)
            )
            exceeded = exceeded or (attempts is not None and attempts > limit)
    if exceeded:
        raise ApiError(
            429,
            "auth_rate_limited",
            "Too many attempts. Try again later.",
            headers={"Retry-After": "900"},
        )


def lock_user(session: Session, user_id: UUID) -> orm.User | None:
    return session.scalar(
        select(orm.User)
        .where(orm.User.id == user_id)
        .with_for_update()
        .options(selectinload(orm.User.roles), selectinload(orm.User.lender_profile))
        .execution_options(populate_existing=True)
    )


def resolve_session(request: Request, session: Session) -> ResolvedSession:
    settings = native_settings(request)
    token = request.cookies.get(session_cookie(settings), "")
    if not TOKEN_PATTERN.fullmatch(token):
        raise required_session()
    row = session.scalar(select(orm.AuthSession).where(orm.AuthSession.token_hash == digest(token)))
    if row is None:
        raise required_session()
    # Mutations serialize on the user row with password reset/change and deactivation.
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        user = lock_user(session, row.user_id)
        session.refresh(row)
    else:
        user = session.scalar(
            select(orm.User)
            .where(orm.User.id == row.user_id)
            .options(selectinload(orm.User.roles), selectinload(orm.User.lender_profile))
        )
    credential = session.get(orm.AuthCredential, row.user_id, populate_existing=True)
    if (
        row.revoked_at is not None
        or row.expires_at <= datetime.now(UTC)
        or user is None
        or user.status != "active"
        or user.auth_provider != "native"
        or credential is None
        or (credential.synthetic and settings.environment not in {"staging", "test"})
    ):
        raise required_session()
    return ResolvedSession(user, credential, row)


def capabilities(session: Session, user_id: UUID) -> list[Capability]:
    grant = session.scalar(
        select(orm.PlatformAdminGrant.id)
        .where(
            orm.PlatformAdminGrant.user_id == user_id,
            orm.PlatformAdminGrant.capability == "operations:access",
            orm.PlatformAdminGrant.revoked_at.is_(None),
            or_(
                orm.PlatformAdminGrant.expires_at.is_(None),
                orm.PlatformAdminGrant.expires_at > datetime.now(UTC),
            ),
        )
        .limit(1)
    )
    return ["operations:access"] if grant is not None else []


def session_read(resolved: ResolvedSession, session: Session) -> schemas.AuthSessionRead:
    return schemas.AuthSessionRead(
        user=serializers.current_user(resolved.user),
        email_verified=resolved.credential.email_verified_at is not None,
        synthetic=resolved.credential.synthetic,
        capabilities=capabilities(session, resolved.user.id)
        if resolved.credential.email_verified_at and not resolved.credential.synthetic
        else [],
        expires_at=resolved.session.expires_at,
    )


def create_session(
    session: Session, user_id: UUID, settings: Settings
) -> tuple[orm.AuthSession, str]:
    token = new_token()
    now = datetime.now(UTC)
    row = orm.AuthSession(
        user_id=user_id,
        token_hash=digest(token),
        created_at=now,
        expires_at=now + timedelta(hours=settings.auth_session_hours),
    )
    session.add(row)
    session.flush()
    return row, token


def revoke_all(session: Session, user_id: UUID) -> None:
    session.execute(
        update(orm.AuthSession)
        .where(orm.AuthSession.user_id == user_id, orm.AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def revoke_token(session: Session, token: str) -> None:
    if TOKEN_PATTERN.fullmatch(token):
        session.execute(
            update(orm.AuthSession)
            .where(
                orm.AuthSession.token_hash == digest(token), orm.AuthSession.revoked_at.is_(None)
            )
            .values(revoked_at=datetime.now(UTC))
        )


def consume_all_tokens(session: Session, user_id: UUID) -> None:
    session.execute(
        update(orm.AuthToken)
        .where(orm.AuthToken.user_id == user_id, orm.AuthToken.consumed_at.is_(None))
        .values(consumed_at=datetime.now(UTC))
    )


def send_token(
    session: Session, credential: orm.AuthCredential, purpose: Purpose, settings: Settings
) -> None:
    delivery = email_delivery(settings)
    tickets = session.info.get("auth_mail_tickets", [])
    ticket = next((item for item in tickets if item.work is None), None)
    if ticket is None:
        ticket = reserve_after_commit(session)
    now = datetime.now(UTC)
    session.execute(
        update(orm.AuthToken)
        .where(
            orm.AuthToken.user_id == credential.user_id,
            orm.AuthToken.purpose == purpose,
            orm.AuthToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    raw = new_token()
    minutes = (
        settings.auth_verification_minutes
        if purpose == "verify_email"
        else settings.auth_reset_minutes
    )
    session.add(
        orm.AuthToken(
            user_id=credential.user_id,
            purpose=purpose,
            token_hash=digest(raw),
            created_at=now,
            expires_at=now + timedelta(minutes=minutes),
        )
    )
    session.flush()
    page = "verify-email" if purpose == "verify_email" else "reset-password"
    # Fragment avoids URL/query/access-log leakage. UI removes it before making API requests.
    recipient = credential.email_normalized
    link = f"{settings.auth_web_origin}/auth/{page}#token={raw}"
    ticket.work = lambda: delivery.send(recipient=recipient, purpose=purpose, link=link)


@contextmanager
def public_response_budget() -> Iterator[None]:
    # SMTP is off the request path. A small floor/jitter also masks ordinary DB-path variation;
    # this is defense in depth, not a constant-time or anti-DDoS guarantee.
    deadline = time.monotonic() + 0.2 + secrets.randbelow(31) / 1000
    try:
        yield
    finally:
        time.sleep(max(0, deadline - time.monotonic()))


def register(session: Session, body: schemas.RegistrationInput, settings: Settings) -> None:
    if reserved_mailbox(body.email):
        raise ApiError(
            422, "auth_reserved_email", "Use an address you own; sample domains cannot register."
        )
    email_delivery(settings)  # Fail before writing any account when delivery is unavailable.
    reserve_after_commit(session)  # Reserve equally before checking existing/dormant identity.
    encoded = hash_password(body.password.get_secret_value())
    existing = session.scalar(
        select(orm.AuthCredential.user_id).where(orm.AuthCredential.email_normalized == body.email)
    )
    dormant = session.scalar(
        select(orm.User.id)
        .where(
            orm.User.auth_provider == "native",
            func.lower(func.btrim(orm.User.email)) == body.email,
        )
        .limit(1)
    )
    if existing is not None or dormant is not None:
        # Same response as accepted registration. Never attach passwords to an existing subject.
        return
    name = body.display_name.strip()
    if not name:
        raise ApiError(422, "validation_error", "Enter a display name.")
    user_id = uuid4()
    session.add(
        orm.User(
            id=user_id,
            auth_provider="native",
            auth_subject=str(user_id),
            email=body.email,
            display_name=name,
            status="active",
        )
    )
    session.flush()
    credential = orm.AuthCredential(
        user_id=user_id, email_normalized=body.email, password_hash=encoded
    )
    session.add_all(
        [
            credential,
            orm.UserRole(user_id=user_id, role="renter"),
            orm.UserPreferences(user_id=user_id),
        ]
    )
    session.flush()
    send_token(session, credential, "verify_email", settings)


def login(
    session: Session, body: schemas.LoginInput, settings: Settings
) -> tuple[orm.User, orm.AuthCredential]:
    credential = session.scalar(
        select(orm.AuthCredential).where(orm.AuthCredential.email_normalized == body.email)
    )
    user = lock_user(session, credential.user_id) if credential is not None else None
    if credential is not None:
        session.refresh(credential)
    valid = verify_password(
        credential.password_hash if credential is not None else None,
        body.password.get_secret_value(),
    )
    if (
        not valid
        or credential is None
        or user is None
        or user.status != "active"
        or user.auth_provider != "native"
        or (credential.synthetic and settings.environment not in {"staging", "test"})
    ):
        raise rejected_login()
    if needs_rehash(credential.password_hash):
        credential.password_hash = hash_password(body.password.get_secret_value())
    return user, credential


def require_password(resolved: ResolvedSession, password: str) -> None:
    if not verify_password(resolved.credential.password_hash, password):
        raise rejected_login()


def replace_password(session: Session, credential: orm.AuthCredential, password: str) -> None:
    credential.password_hash = hash_password(password)
    credential.password_changed_at = datetime.now(UTC)
    consume_all_tokens(session, credential.user_id)
    revoke_all(session, credential.user_id)


def consume_token(
    session: Session, raw: str, purpose: Purpose
) -> tuple[orm.User, orm.AuthCredential]:
    invalid = ApiError(400, "auth_token_invalid", "This link is invalid, expired or already used.")
    if not TOKEN_PATTERN.fullmatch(raw):
        raise invalid
    row = session.scalar(
        select(orm.AuthToken).where(
            orm.AuthToken.token_hash == digest(raw), orm.AuthToken.purpose == purpose
        )
    )
    if row is None:
        raise invalid
    user = lock_user(session, row.user_id)
    session.refresh(row, with_for_update=True)
    credential = session.get(orm.AuthCredential, row.user_id, populate_existing=True)
    if (
        user is None
        or user.status != "active"
        or user.auth_provider != "native"
        or credential is None
        or credential.synthetic
        or row.consumed_at is not None
        or row.expires_at <= datetime.now(UTC)
    ):
        raise invalid
    row.consumed_at = datetime.now(UTC)
    session.flush()
    return user, credential


def deactivate(session: Session, user: orm.User) -> None:
    user.status = "inactive"
    if user.lender_profile is not None:
        user.lender_profile.status = "inactive"
    revoke_all(session, user.id)
    consume_all_tokens(session, user.id)
