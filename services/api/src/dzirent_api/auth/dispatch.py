"""PostgreSQL outbox worker: at-least-once handoff, bounded retries and expiring claims."""

import hmac
import logging
import secrets
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import Event, Thread
from typing import cast
from uuid import UUID, uuid4

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session, sessionmaker

from .. import orm
from ..settings import Settings
from . import mail_crypto
from .crypto import TOKEN_PATTERN, digest
from .delivery import DeliveryFailure, Purpose, email_delivery, reserved_mailbox
from .outbox import ACTIVE, require_ready

log = logging.getLogger("dzirent.auth.delivery")
LEASE_SECONDS = 120
MAX_ATTEMPTS = 6
CLEANUP_BATCH = 100


def finish(row: orm.AuthEmailOutbox, status: str, code: str | None, now: datetime) -> None:
    row.status, row.error_code = status, code
    row.payload = None
    row.lease_id = row.leased_until = None
    row.completed_at = row.updated_at = now


class DeliveryDispatcher:
    def __init__(
        self,
        factory: sessionmaker[Session],
        settings: Settings,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.factory, self.settings = factory, settings
        self.clock = clock or (lambda: datetime.now(UTC))
        self.stop = Event()
        self.thread: Thread | None = None

    def start(self) -> None:
        if (
            not self.settings.auth_email_worker_enabled
            or self.settings.auth_email_backend != "smtp"
        ):
            return
        try:
            require_ready(self.settings)
        except Exception:
            log.warning("email_worker_configuration_unavailable")
            return
        self.thread = Thread(target=self._run, name="dzirent-mail", daemon=True)
        self.thread.start()

    def _run(self) -> None:
        while not self.stop.is_set():
            try:
                self.drain(timeout=2, limit=10)
            except Exception:
                log.warning("email_worker_cycle_failed")
            self.stop.wait(self.settings.auth_outbox_poll_seconds)

    def close(self) -> None:
        self.stop.set()
        if self.thread is not None:
            self.thread.join(timeout=10)

    def cleanup(self) -> None:
        now = self.clock()
        with self.factory.begin() as session:
            rows = session.scalars(
                select(orm.AuthEmailOutbox)
                .where(
                    orm.AuthEmailOutbox.status.in_(ACTIVE),
                    or_(
                        orm.AuthEmailOutbox.expires_at <= now,
                        and_(
                            orm.AuthEmailOutbox.attempts >= MAX_ATTEMPTS,
                            or_(
                                orm.AuthEmailOutbox.status == "pending",
                                orm.AuthEmailOutbox.leased_until <= now,
                            ),
                        ),
                    ),
                )
                .order_by(orm.AuthEmailOutbox.expires_at, orm.AuthEmailOutbox.id)
                .with_for_update(skip_locked=True)
                .limit(CLEANUP_BATCH)
            ).all()
            for row in rows:
                finish(row, "failed", "expired" if row.expires_at <= now else "max_attempts", now)
            old = session.scalars(
                select(orm.AuthEmailOutbox.id)
                .where(
                    orm.AuthEmailOutbox.completed_at < now - timedelta(days=7),
                    ~orm.AuthEmailOutbox.status.in_(ACTIVE),
                )
                .order_by(orm.AuthEmailOutbox.completed_at, orm.AuthEmailOutbox.id)
                .with_for_update(skip_locked=True)
                .limit(CLEANUP_BATCH)
            ).all()
            if old:
                session.execute(delete(orm.AuthEmailOutbox).where(orm.AuthEmailOutbox.id.in_(old)))

    def claim(self) -> tuple[UUID, UUID, UUID] | None:
        now = self.clock()
        with self.factory.begin() as session:
            row = session.scalar(
                select(orm.AuthEmailOutbox)
                .where(
                    orm.AuthEmailOutbox.expires_at > now,
                    orm.AuthEmailOutbox.attempts < MAX_ATTEMPTS,
                    or_(
                        and_(
                            orm.AuthEmailOutbox.status == "pending",
                            orm.AuthEmailOutbox.available_at <= now,
                        ),
                        and_(
                            orm.AuthEmailOutbox.status == "leased",
                            orm.AuthEmailOutbox.leased_until <= now,
                        ),
                    ),
                )
                .order_by(orm.AuthEmailOutbox.available_at, orm.AuthEmailOutbox.id)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if row is None:
                return None
            row.status, row.lease_id = "leased", uuid4()
            row.leased_until = now + timedelta(seconds=LEASE_SECONDS)
            row.attempts += 1
            row.updated_at = now
            return row.id, row.lease_id, row.user_id

    def deliver(self, claim: tuple[UUID, UUID, UUID]) -> None:
        # Recheck config before touching a job. Lock order matches auth mutations:
        # user -> token -> job. Claim transaction has already committed.
        transport = email_delivery(self.settings)
        mail_crypto.keyring(self.settings)
        job_id, lease_id, user_id = claim
        with self.factory.begin() as session:
            user = session.scalar(select(orm.User).where(orm.User.id == user_id).with_for_update())
            token_id = session.scalar(
                select(orm.AuthEmailOutbox.token_id).where(orm.AuthEmailOutbox.id == job_id)
            )
            token = session.scalar(
                select(orm.AuthToken).where(orm.AuthToken.id == token_id).with_for_update()
            )
            row = session.scalar(
                select(orm.AuthEmailOutbox)
                .where(orm.AuthEmailOutbox.id == job_id)
                .with_for_update()
            )
            now = self.clock()
            if (
                row is None
                or row.status != "leased"
                or row.lease_id != lease_id
                or row.leased_until is None
                or row.leased_until <= now
            ):
                return
            credential = session.get(orm.AuthCredential, user_id)
            if row.expires_at <= now or token is None or token.expires_at <= now:
                finish(row, "failed", "expired", now)
                return
            if (
                token.consumed_at is not None
                or token.purpose != row.purpose
                or token.user_id != user_id
            ):
                finish(row, "cancelled", "consumed", now)
                return
            if (
                user is None
                or user.status != "active"
                or user.auth_provider != "native"
                or credential is None
                or credential.synthetic
                or reserved_mailbox(credential.email_normalized)
                or (row.purpose == "verify_email" and credential.email_verified_at is not None)
            ):
                finish(row, "cancelled", "ineligible", now)
                return
            try:
                associated = mail_crypto.aad(
                    job_id=row.id,
                    token_id=row.token_id,
                    user_id=row.user_id,
                    purpose=row.purpose,
                    expires_at=row.expires_at,
                    key_id=row.key_id,
                )
                data = mail_crypto.unseal(self.settings, row.key_id, row.payload or b"", associated)
                raw = data["token"].get_secret_value()
                if (
                    not TOKEN_PATTERN.fullmatch(raw)
                    or not hmac.compare_digest(digest(raw), token.token_hash)
                    or data["recipient"].get_secret_value() != credential.email_normalized
                    or data["origin"].get_secret_value() != self.settings.auth_web_origin
                ):
                    raise ValueError
            except Exception:
                finish(row, "failed", "invalid_payload", now)
                return
            page = "verify-email" if row.purpose == "verify_email" else "reset-password"
            try:
                transport.send(
                    recipient=credential.email_normalized,
                    purpose=cast(Purpose, row.purpose),
                    link=f"{self.settings.auth_web_origin}/auth/{page}#token={raw}",
                    message_id=f"<dzirent-{row.id.hex}@{self.settings.auth_email_sender.rsplit('@', 1)[-1]}>",
                )
            except Exception as exc:
                now = (
                    self.clock()
                )  # Backoff starts after the failed handoff, not before socket waits.
                transient = not isinstance(exc, DeliveryFailure) or exc.transient
                retry_at = now + timedelta(
                    seconds=min(900, 30 * 2 ** (row.attempts - 1)) + secrets.randbelow(11)
                )
                if not transient or row.attempts >= MAX_ATTEMPTS or retry_at >= row.expires_at:
                    finish(row, "failed", "permanent" if not transient else "max_attempts", now)
                else:
                    row.status, row.error_code, row.available_at = "pending", "transient", retry_at
                    row.lease_id = row.leased_until = None
                    row.updated_at = now
                log.warning("email_handoff_failed")
            else:
                finish(row, "sent", None, self.clock())

    def drain(self, timeout: float = 5, limit: int = 100) -> bool:
        require_ready(self.settings)
        self.cleanup()
        deadline = time.monotonic() + timeout
        for _ in range(limit):
            claim = self.claim()
            if claim is None:
                return True
            self.deliver(claim)
            if time.monotonic() >= deadline:
                return False
        return False
