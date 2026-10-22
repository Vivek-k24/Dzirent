"""Durable email workflow against a disposable loopback PostgreSQL 17; fake mail only."""

import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Event
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, event, func, select, update
from test_native_auth import EMAIL, Mailbox, csrf, login, mutate, signup
from test_native_auth import mailbox as mailbox
from test_native_auth import native as native
from test_native_auth import password as password

from dzirent_api import orm
from dzirent_api.auth import delivery, dispatch, schemas, service
from dzirent_api.db import session_factory
from dzirent_api.errors import ApiError


def queue(native: TestClient, password: SecretStr, email: str = EMAIL) -> Any:
    return native.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Outbox fixture",
            "password": password.get_secret_value(),
        },
        headers={
            "Origin": native.app.state.settings.auth_web_origin,
            "X-Dzirent-CSRF": csrf(native),
        },
    )


def job(db: Engine) -> orm.AuthEmailOutbox:
    with session_factory(db)() as session:
        row = session.scalar(
            select(orm.AuthEmailOutbox).order_by(orm.AuthEmailOutbox.created_at.desc())
        )
        assert row is not None
        session.expunge(row)
        return row


def test_atomic_encrypted_registration_restart_and_session_refresh(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    assert queue(native, password).status_code == 202 and not mailbox.messages
    queued = job(db)
    assert queued.status == "pending" and queued.payload is not None
    assert (
        EMAIL.encode() not in queued.payload
        and password.get_secret_value().encode() not in queued.payload
    )
    assert login(native, password).json()["email_verified"] is False
    restarted = dispatch.DeliveryDispatcher(session_factory(db), native.app.state.settings)
    assert restarted.drain() and job(db).payload is None
    raw = mailbox.token()
    assert all(item.committed for item in mailbox.messages)
    response = mutate(native, "/auth/email/verify", {"token": raw})
    assert response.status_code == 200
    current = native.get("/api/v1/auth/session").json()
    assert current["email_verified"] is True and current["user"]["roles"] == ["renter"]
    assert current["capabilities"] == []
    assert mutate(native, "/auth/email/verify", {"token": raw}).status_code == 400


def test_uncommitted_work_is_invisible_and_rollback_purges(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    with session_factory(db)() as session:
        service.register(
            session,
            schemas.RegistrationInput(email=EMAIL, display_name="Fixture", password=password),
            native.app.state.settings,
        )
        session.flush()
        assert native.app.state.auth_delivery.claim() is None
        session.rollback()
    assert native.app.state.auth_delivery.drain() and not mailbox.messages
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthEmailOutbox)) == 0


@pytest.mark.parametrize(
    "config",
    [
        {"auth_email_backend": "disabled"},
        {"auth_outbox_active_key_id": "", "auth_outbox_keys": SecretStr("")},
        {"auth_outbox_keys": SecretStr("not-json")},
    ],
)
def test_unconfigured_delivery_never_creates_account(
    native: TestClient, db: Engine, password: SecretStr, config: dict[str, Any]
) -> None:
    native.app.state.settings = native.app.state.settings.model_copy(update=config)
    assert queue(native, password).status_code == 503
    with db.connect() as connection:
        for table in (orm.AuthCredential, orm.AuthToken, orm.AuthEmailOutbox):
            assert connection.scalar(select(func.count()).select_from(table)) == 0


def test_capacity_generic_duplicates_and_rollback_recovery(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    native.app.state.settings.auth_outbox_capacity = 1
    assert queue(native, password).status_code == 202
    for email in (EMAIL, "other@mail.dzirent.com"):
        assert queue(native, password, email).status_code == 503
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 1
    assert native.app.state.auth_delivery.drain()
    assert queue(native, password, "other@mail.dzirent.com").status_code == 202


def test_expired_claim_restarts_with_fencing_and_no_duplicate_claim(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    assert queue(native, password).status_code == 202
    first = native.app.state.auth_delivery
    claim = first.claim()
    assert claim is not None
    second = dispatch.DeliveryDispatcher(
        session_factory(db),
        native.app.state.settings,
        clock=lambda: datetime.now(UTC) + timedelta(seconds=121),
    )
    assert first.claim() is None
    newer = second.claim()
    assert newer is not None and newer[1] != claim[1]
    first.deliver(claim)
    assert not mailbox.messages
    second.deliver(newer)
    first.deliver(newer)
    assert len(mailbox.messages) == 1 and job(db).attempts == 2


def test_concurrent_workers_handoff_once(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    assert queue(native, password).status_code == 202
    workers = [
        dispatch.DeliveryDispatcher(session_factory(db), native.app.state.settings)
        for _ in range(4)
    ]
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert all(pool.map(lambda worker: worker.drain(), workers))
    assert len(mailbox.messages) == 1 and job(db).attempts == 1


def test_ack_failure_duplicates_same_link_but_verification_is_single_use(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    assert queue(native, password).status_code == 202
    claim = native.app.state.auth_delivery.claim()
    assert claim is not None
    factory = native.app.state.auth_delivery.factory

    class Interrupt(BaseException):
        pass

    def interrupted(session: Any) -> None:
        if any(
            isinstance(row, orm.AuthEmailOutbox) and row.status == "sent" for row in session.dirty
        ):
            raise Interrupt()

    event.listen(factory.class_, "before_commit", interrupted)
    try:
        with pytest.raises(Interrupt):
            native.app.state.auth_delivery.deliver(claim)
    finally:
        event.remove(factory.class_, "before_commit", interrupted)
    # SMTP acceptance happened but acknowledgement rolled back to the durable lease.
    assert len(mailbox.messages) == 1 and job(db).status == "leased"
    restarted = dispatch.DeliveryDispatcher(
        factory, native.app.state.settings, clock=lambda: datetime.now(UTC) + timedelta(seconds=121)
    )
    assert restarted.drain() and len(mailbox.messages) == 2
    assert mailbox.messages[0].token == mailbox.messages[1].token
    assert mailbox.messages[0].message_id == mailbox.messages[1].message_id
    raw = mailbox.token()
    assert mutate(native, "/auth/email/verify", {"token": raw}).status_code == 200
    assert mutate(native, "/auth/email/verify", {"token": raw}).status_code == 400


@pytest.mark.parametrize("permanent", [False, True])
def test_bounded_retry_and_terminal_purge(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    permanent: bool,
) -> None:
    assert queue(native, password).status_code == 202
    now = [datetime.now(UTC)]
    worker = dispatch.DeliveryDispatcher(
        session_factory(db), native.app.state.settings, clock=lambda: now[0]
    )
    private = secrets.token_urlsafe(32)

    def fail(**kwargs: Any) -> None:
        if permanent:
            raise delivery.DeliveryFailure(transient=False)
        raise OSError(private)

    monkeypatch.setattr(mailbox, "send", fail)
    for attempt in range(1, 2 if permanent else 7):
        assert worker.drain()
        row = job(db)
        assert row.attempts == attempt
        if row.status == "pending":
            assert (
                30 * 2 ** (attempt - 1)
                <= (row.available_at - now[0]).total_seconds()
                <= min(900, 30 * 2 ** (attempt - 1)) + 10
            )
            assert worker.claim() is None
            now[0] = row.available_at
    assert row.status == "failed" and row.payload is None and row.completed_at is not None
    assert private not in caplog.text


def test_transient_failure_recovers_without_new_signup(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert queue(native, password).status_code == 202
    send = mailbox.send

    def fail(**kwargs: Any) -> None:
        raise delivery.DeliveryFailure(transient=True)

    monkeypatch.setattr(mailbox, "send", fail)
    assert native.app.state.auth_delivery.drain() and not mailbox.messages
    row = job(db)
    monkeypatch.setattr(mailbox, "send", send)
    recovered = dispatch.DeliveryDispatcher(
        session_factory(db), native.app.state.settings, clock=lambda: row.available_at
    )
    assert recovered.drain() and job(db).status == "sent" and len(mailbox.messages) == 1


def test_backoff_begins_after_slow_transport_failure(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert queue(native, password).status_code == 202
    now = [datetime.now(UTC)]
    worker = dispatch.DeliveryDispatcher(
        session_factory(db), native.app.state.settings, clock=lambda: now[0]
    )

    def slow_failure(**kwargs: Any) -> None:
        now[0] += timedelta(seconds=45)
        raise delivery.DeliveryFailure(transient=True)

    monkeypatch.setattr(mailbox, "send", slow_failure)
    assert worker.drain()
    row = job(db)
    assert 30 <= (row.available_at - now[0]).total_seconds() <= 40
    assert worker.claim() is None


def test_poison_job_does_not_block_next_job(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    assert queue(native, password).status_code == 202
    with db.begin() as connection:
        connection.execute(update(orm.AuthEmailOutbox).values(payload=b"x" * 40))
    assert queue(native, password, "second@mail.dzirent.com").status_code == 202
    assert native.app.state.auth_delivery.drain()
    with db.connect() as connection:
        rows = connection.execute(
            select(orm.AuthEmailOutbox.status, orm.AuthEmailOutbox.payload)
        ).all()
    assert sorted(status for status, _ in rows) == ["failed", "sent"]
    assert all(payload is None for _, payload in rows) and len(mailbox.messages) == 1


def test_resend_coalesces_then_supersedes_and_confirm_cancels_work(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    signup(native, password)
    old = mailbox.token()
    assert login(native, password).json()["email_verified"] is False
    assert mutate(native, "/auth/email/request").status_code == 202
    assert len(mailbox.messages) == 1  # One-minute cooldown, same live link.
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthEmailOutbox).values(
                created_at=datetime.now(UTC) - timedelta(minutes=2),
                expires_at=orm.AuthEmailOutbox.expires_at - timedelta(minutes=2),
            )
        )
    assert mutate(native, "/auth/email/request").status_code == 202
    assert len(mailbox.messages) == 2
    assert mutate(native, "/auth/email/verify", {"token": old}).status_code == 400
    assert mutate(native, "/auth/email/verify", {"token": mailbox.token()}).status_code == 200
    assert mutate(native, "/auth/email/request").status_code == 202
    assert len(mailbox.messages) == 2


@pytest.mark.parametrize(
    "change", ["inactive", "synthetic", "verified", "consumed", "expired", "origin"]
)
def test_dispatch_revalidates_current_account_and_token(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox, change: str
) -> None:
    assert queue(native, password).status_code == 202
    with db.begin() as connection:
        if change == "inactive":
            connection.execute(
                update(orm.User).where(orm.User.auth_provider == "native").values(status="inactive")
            )
        elif change in {"synthetic", "verified"}:
            connection.execute(
                update(orm.AuthCredential).values(
                    **(
                        {"synthetic": True}
                        if change == "synthetic"
                        else {"email_verified_at": datetime.now(UTC)}
                    )
                )
            )
        elif change == "consumed":
            connection.execute(update(orm.AuthToken).values(consumed_at=datetime.now(UTC)))
        elif change == "expired":
            connection.execute(
                update(orm.AuthToken).values(
                    created_at=datetime.now(UTC) - timedelta(hours=2),
                    expires_at=datetime.now(UTC) - timedelta(hours=1),
                )
            )
    if change == "origin":
        native.app.state.settings.auth_web_origin = "http://127.0.0.1:3501"
    assert native.app.state.auth_delivery.drain() and not mailbox.messages
    assert job(db).status in {"failed", "cancelled"} and job(db).payload is None


def test_bounded_expiry_cleanup_and_metadata_retention(
    native: TestClient, db: Engine, password: SecretStr, mailbox: Mailbox
) -> None:
    assert queue(native, password).status_code == 202
    # Payload lifetime is immutable and bound by AEAD/DB; advance a private worker clock.
    future = datetime.now(UTC) + timedelta(days=2)
    worker = dispatch.DeliveryDispatcher(
        session_factory(db), native.app.state.settings, clock=lambda: future
    )
    worker.cleanup()
    assert job(db).payload is None and job(db).error_code == "expired"
    later = dispatch.DeliveryDispatcher(
        session_factory(db), native.app.state.settings, clock=lambda: future + timedelta(days=8)
    )
    later.cleanup()
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthEmailOutbox)) == 0


def test_failed_dispatch_can_resend_immediately_without_adopting_signup(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert queue(native, password).status_code == 202
    send = mailbox.send

    def rejected(**kwargs: Any) -> None:
        raise delivery.DeliveryFailure(transient=False)

    monkeypatch.setattr(mailbox, "send", rejected)
    assert native.app.state.auth_delivery.drain() and job(db).status == "failed"
    # Public duplicate signup does not resend; recovery requires authentication.
    assert queue(native, password, EMAIL.upper()).status_code == 202
    assert job(db).status == "failed" and not mailbox.messages
    monkeypatch.setattr(mailbox, "send", send)
    assert login(native, password).json()["email_verified"] is False
    assert mutate(native, "/auth/email/request").status_code == 202
    assert len(mailbox.messages) == 1 and job(db).status == "sent"
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 1


def test_missing_key_after_enqueue_preserves_work_until_configuration_recovers(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
) -> None:
    assert queue(native, password).status_code == 202
    worker = native.app.state.auth_delivery
    keys = worker.settings.auth_outbox_keys
    worker.settings.auth_outbox_keys = SecretStr("")
    with pytest.raises(ApiError):
        worker.drain()
    assert job(db).status == "pending" and job(db).attempts == 0
    worker.settings.auth_outbox_keys = keys
    assert worker.drain() and len(mailbox.messages) == 1


def test_resend_serializes_with_sending_worker(
    native: TestClient,
    password: SecretStr,
    mailbox: Mailbox,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert queue(native, password).status_code == 202
    origin = native.app.state.settings.auth_web_origin
    result = native.post(
        "/api/v1/auth/login",
        headers={"Origin": origin, "X-Dzirent-CSRF": csrf(native)},
        json={"email": EMAIL, "password": password.get_secret_value()},
    )
    assert result.status_code == 200 and result.json()["email_verified"] is False
    challenge = csrf(native)
    started, release = Event(), Event()
    send = mailbox.send

    def slow(**kwargs: Any) -> None:
        started.set()
        assert release.wait(timeout=4)
        send(**kwargs)

    monkeypatch.setattr(mailbox, "send", slow)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sent = pool.submit(native.app.state.auth_delivery.drain)
        try:
            assert started.wait(timeout=2)
            resent = pool.submit(
                native.post,
                "/api/v1/auth/email/request",
                headers={"Origin": origin, "X-Dzirent-CSRF": challenge},
                json={},
            )
            assert not resent.done()
        finally:
            release.set()
        assert sent.result(timeout=5)
        assert resent.result(timeout=5).status_code == 202
    assert native.app.state.auth_delivery.drain() and len(mailbox.messages) == 1


def test_superseded_pending_job_is_cancelled_before_any_handoff(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
) -> None:
    assert queue(native, password).status_code == 202
    first = job(db)
    origin = native.app.state.settings.auth_web_origin
    assert (
        native.post(
            "/api/v1/auth/login",
            headers={"Origin": origin, "X-Dzirent-CSRF": csrf(native)},
            json={"email": EMAIL, "password": password.get_secret_value()},
        ).status_code
        == 200
    )
    # Test-only metadata aging; ciphertext will be cancelled, never decrypted with changed AAD.
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthEmailOutbox).values(
                created_at=orm.AuthEmailOutbox.created_at - timedelta(minutes=2),
                expires_at=orm.AuthEmailOutbox.expires_at - timedelta(minutes=2),
            )
        )
    assert mutate(native, "/auth/email/request").status_code == 202
    with db.connect() as connection:
        row = connection.execute(
            select(orm.AuthEmailOutbox.status, orm.AuthEmailOutbox.payload).where(
                orm.AuthEmailOutbox.id == first.id
            )
        ).one()
    assert row.status == "cancelled" and row.payload is None
    assert len(mailbox.messages) == 1


def test_verification_expiry_is_rejected_without_setting_verified(
    native: TestClient,
    db: Engine,
    password: SecretStr,
    mailbox: Mailbox,
) -> None:
    signup(native, password)
    raw = mailbox.token()
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthToken).values(
                created_at=datetime.now(UTC) - timedelta(hours=2),
                expires_at=datetime.now(UTC) - timedelta(hours=1),
            )
        )
    assert mutate(native, "/auth/email/verify", {"token": raw}).status_code == 400
    assert login(native, password).json()["email_verified"] is False


def test_cleanup_is_bounded_and_abandoned_final_attempt_is_purged(
    native: TestClient,
    db: Engine,
    password: SecretStr,
) -> None:
    assert queue(native, password).status_code == 202
    original = job(db)
    now = datetime.now(UTC)
    with session_factory(db).begin() as session:
        for _ in range(101):
            token = orm.AuthToken(
                id=uuid4(),
                user_id=original.user_id,
                purpose="verify_email",
                token_hash=secrets.token_hex(32),
                created_at=now,
                expires_at=now + timedelta(hours=1),
            )
            session.add(token)
            session.flush()
            session.add(
                orm.AuthEmailOutbox(
                    id=uuid4(),
                    token_id=token.id,
                    user_id=original.user_id,
                    purpose="verify_email",
                    key_id="local64",
                    payload=b"x" * 40,
                    status="leased",
                    attempts=6,
                    available_at=now,
                    lease_id=uuid4(),
                    leased_until=now + timedelta(seconds=120),
                    created_at=now,
                    expires_at=now + timedelta(hours=1),
                    updated_at=now,
                )
            )
    worker = dispatch.DeliveryDispatcher(
        session_factory(db), native.app.state.settings, clock=lambda: now + timedelta(seconds=121)
    )
    worker.cleanup()
    with db.connect() as connection:
        count = connection.scalar(
            select(func.count())
            .select_from(orm.AuthEmailOutbox)
            .where(orm.AuthEmailOutbox.status == "failed")
        )
        assert count == dispatch.CLEANUP_BATCH
    worker.cleanup()
    with db.connect() as connection:
        assert (
            connection.scalar(
                select(func.count())
                .select_from(orm.AuthEmailOutbox)
                .where(orm.AuthEmailOutbox.status == "failed")
            )
            == 101
        )
