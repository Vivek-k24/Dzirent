"""Transactional enqueue/cancellation shared by account and token operations."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from .. import orm
from ..errors import unavailable
from ..settings import Settings
from . import mail_crypto
from .delivery import Purpose, email_delivery

ACTIVE = ("pending", "leased")
ACCEPTED = (
    "If this account is eligible, your email request was accepted. "
    "Delivery may be delayed; sign in to request a new link."
)


def require_ready(settings: Settings) -> None:
    email_delivery(settings)
    mail_crypto.keyring(settings)


def require_capacity(session: Session, settings: Settings) -> None:
    if session.in_nested_transaction():
        raise unavailable("Email delivery requires a root transaction.")
    # Serialize only the short enqueue segment, never password hashing or SMTP.
    session.execute(text("SELECT pg_advisory_xact_lock(724100164)"))
    count = session.scalar(
        select(func.count())
        .select_from(orm.AuthEmailOutbox)
        .where(orm.AuthEmailOutbox.status.in_(ACTIVE))
    )
    if count is not None and count >= settings.auth_outbox_capacity:
        raise unavailable("Email delivery capacity is temporarily unavailable.")


def cancel(session: Session, user_id: UUID, purpose: str | None = None) -> None:
    conditions = [orm.AuthEmailOutbox.user_id == user_id, orm.AuthEmailOutbox.status.in_(ACTIVE)]
    if purpose is not None:
        conditions.append(orm.AuthEmailOutbox.purpose == purpose)
    session.execute(
        update(orm.AuthEmailOutbox)
        .where(*conditions)
        .values(
            status="cancelled",
            payload=None,
            lease_id=None,
            leased_until=None,
            completed_at=datetime.now(UTC),
            error_code="superseded",
        )
    )


def recent(session: Session, user_id: UUID, purpose: Purpose, now: datetime) -> bool:
    return (
        session.scalar(
            select(orm.AuthEmailOutbox.id)
            .join(orm.AuthToken, orm.AuthToken.id == orm.AuthEmailOutbox.token_id)
            .where(
                orm.AuthEmailOutbox.user_id == user_id,
                orm.AuthEmailOutbox.purpose == purpose,
                orm.AuthEmailOutbox.status.in_((*ACTIVE, "sent")),
                orm.AuthEmailOutbox.created_at > now - timedelta(seconds=60),
                orm.AuthToken.consumed_at.is_(None),
                orm.AuthToken.expires_at > now,
            )
            .limit(1)
        )
        is not None
    )


def enqueue(
    session: Session, row: orm.AuthToken, raw: str, recipient: str, settings: Settings
) -> None:
    job_id = uuid4()
    key_id = settings.auth_outbox_active_key_id
    associated = mail_crypto.aad(
        job_id=job_id,
        token_id=row.id,
        user_id=row.user_id,
        purpose=row.purpose,
        expires_at=row.expires_at,
        key_id=key_id,
    )
    session.add(
        orm.AuthEmailOutbox(
            id=job_id,
            token_id=row.id,
            user_id=row.user_id,
            purpose=row.purpose,
            key_id=key_id,
            payload=mail_crypto.seal(
                settings,
                {"token": raw, "recipient": recipient, "origin": settings.auth_web_origin},
                associated,
            ),
            status="pending",
            attempts=0,
            available_at=row.created_at,
            created_at=row.created_at,
            updated_at=row.created_at,
            expires_at=row.expires_at,
        )
    )
