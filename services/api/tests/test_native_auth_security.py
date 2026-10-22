"""Additional local transport, concurrency, throttling and delivery regressions."""

import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Event
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, event, func, select, update
from test_native_auth import EMAIL, ORIGIN, Mailbox, csrf, login, mutate, signup, verified
from test_native_auth import mailbox as mailbox
from test_native_auth import native as native
from test_native_auth import password as password

from dzirent_api import orm
from dzirent_api.auth import crypto, delivery, schemas, security, service
from dzirent_api.auth.dispatch import DeliveryDispatcher, reserve_after_commit
from dzirent_api.db import session_factory
from dzirent_api.errors import ApiError


def test_commit_failure_discards_delivery(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    with session_factory(db)() as session:
        session.info["auth_delivery"] = native.app.state.auth_delivery
        service.register(
            session,
            schemas.RegistrationInput(email=EMAIL, display_name="Fixture", password=password),
            native.app.state.settings,
        )

        def fail_commit(_: Any) -> None:
            raise RuntimeError("simulated failed commit")

        event.listen(session, "before_commit", fail_commit)
        with pytest.raises(RuntimeError, match="simulated failed commit"):
            session.commit()
        session.rollback()
    assert native.app.state.auth_delivery.drain()
    assert len(mailbox.messages) == 0
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 0


def test_savepoint_cannot_schedule_rolled_back_mail(db: Engine) -> None:
    dispatcher = DeliveryDispatcher(capacity=1)
    calls: list[bool] = []
    try:
        with session_factory(db)() as session:
            session.info["auth_delivery"] = dispatcher
            with session.begin():
                with pytest.raises(ApiError), session.begin_nested():
                    ticket = reserve_after_commit(session)
                    ticket.work = lambda: calls.append(True)
                    raise RuntimeError("uncommitted savepoint")
        assert dispatcher.drain() and not calls
    finally:
        dispatcher.close()


def test_delivery_capacity_rollback_and_safe_failure(
    db: Engine, caplog: pytest.LogCaptureFixture
) -> None:
    dispatcher = DeliveryDispatcher(capacity=1)
    try:
        with session_factory(db)() as session:
            session.info["auth_delivery"] = dispatcher
            reserve_after_commit(session)
            with pytest.raises(ApiError) as error:
                dispatcher.reserve()
            assert error.value.status == 503
            session.rollback()
        ticket = dispatcher.reserve()
        private = SecretStr(secrets.token_urlsafe(32))

        def failing_transport() -> None:
            raise OSError(private.get_secret_value())

        ticket.work = failing_transport
        ticket.submit()
        assert dispatcher.drain()
        assert private.get_secret_value() not in caplog.text
        assert "post_commit_delivery_failed" in caplog.text
        dispatcher.reserve().release()
    finally:
        dispatcher.close()


def test_response_enumeration_floor_and_slow_mail_off_request(
    native: TestClient, mailbox: Mailbox, password: SecretStr, monkeypatch: pytest.MonkeyPatch
) -> None:
    started, release = Event(), Event()

    def slow_send(**_: Any) -> None:
        started.set()
        assert release.wait(timeout=5)

    monkeypatch.setattr(mailbox, "send", slow_send)
    monkeypatch.setattr(service.secrets, "randbelow", lambda _: 0)
    token = csrf(native)
    elapsed: list[float] = []
    responses = []
    try:
        for email in (EMAIL, EMAIL.upper()):
            before = time.perf_counter()
            responses.append(
                native.post(
                    "/api/v1/auth/register",
                    headers={"Origin": ORIGIN, "X-Dzirent-CSRF": token},
                    json={
                        "email": email,
                        "display_name": "Fixture",
                        "password": password.get_secret_value(),
                    },
                )
            )
            elapsed.append(time.perf_counter() - before)
        assert started.wait(timeout=1)
        assert all(response.status_code == 202 for response in responses)
        assert responses[0].json() == responses[1].json()
        for email in (EMAIL, "absent@mail.dzirent.com"):
            before = time.perf_counter()
            responses.append(
                native.post(
                    "/api/v1/auth/password/request",
                    headers={"Origin": ORIGIN, "X-Dzirent-CSRF": token},
                    json={"email": email},
                )
            )
            elapsed.append(time.perf_counter() - before)
        assert responses[-1].json() == responses[-2].json()
        assert all(0.19 <= duration < 1.5 for duration in elapsed)
        # A bounded local observation, not a constant-time proof on arbitrary hardware.
        assert max(elapsed) - min(elapsed) < 0.4
    finally:
        release.set()
        assert native.app.state.auth_delivery.drain()


def test_parallel_limits_persist_after_rollback_reset_and_aggregate(
    native: TestClient, db: Engine, make_client: Any
) -> None:
    clients = [
        make_client(mode="connected", identity_mode="native", auth_web_origin=ORIGIN)
        for _ in range(12)
    ]
    tokens = [csrf(client) for client in clients]

    def attempt(pair: tuple[TestClient, str]) -> Any:
        client, token = pair
        return mutate(
            client,
            "/auth/login",
            {"email": "absent@mail.dzirent.com", "password": secrets.token_urlsafe(24)},
            token=token,
            headers={"X-Forwarded-For": secrets.token_hex(8)},
        )

    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = [
            response.status_code
            for response in pool.map(attempt, zip(clients, tokens, strict=True))
        ]
    assert statuses.count(401) == 10 and statuses.count(429) == 2
    with db.connect() as connection:
        identity = connection.execute(
            select(orm.AuthRateLimit).where(orm.AuthRateLimit.action == "login:identity")
        ).one()
        assert identity.attempts == 12  # Failed login transactions did not roll counters back.
        assert (
            connection.scalar(
                select(orm.AuthRateLimit.attempts).where(
                    orm.AuthRateLimit.action == "login:aggregate"
                )
            )
            == 10
        )
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthRateLimit).values(
                window_started_at=datetime.now(UTC) - timedelta(minutes=16)
            )
        )
    assert attempt((clients[0], tokens[0])).status_code == 401
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthRateLimit)
            .where(orm.AuthRateLimit.action == "login:aggregate")
            .values(attempts=2048)
        )
    response = attempt((clients[0], tokens[0]))
    assert response.status_code == 429 and response.headers["retry-after"] == "900"


def test_client_cookie_tamper_expiry_and_csrf_expiry(
    native: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = csrf(native)
    client_cookie = native.cookies.get("dzirent_client")
    assert client_cookie
    headers = {"Origin": ORIGIN, "X-Dzirent-CSRF": token}
    for value in ("", "forged", client_cookie[:-1] + ("a" if client_cookie[-1] != "a" else "b")):
        assert (
            native.post(
                "/api/v1/auth/logout",
                headers={**headers, "Cookie": f"dzirent_csrf={token}; dzirent_client={value}"},
                json={},
            ).status_code
            == 403
        )
    old_time = security.time.time()
    monkeypatch.setattr(security.time, "time", lambda: old_time + security.CSRF_TTL + 1)
    assert native.post("/api/v1/auth/logout", headers=headers, json={}).status_code == 403
    monkeypatch.setattr(security.time, "time", lambda: old_time + security.CLIENT_TTL + 1)
    assert native.post("/api/v1/auth/logout", headers=headers, json={}).status_code == 403


def test_https_cookies_and_native_headers_are_not_identity(
    make_client: Any, mailbox: Mailbox, password: SecretStr
) -> None:
    secure = make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin="https://auth62.localhost",
        client_base_url="https://auth62.localhost",
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth62@dzirent.com",
    )
    challenge = secure.get("/api/v1/auth/csrf")
    for value in challenge.headers.get_list("set-cookie"):
        assert value.startswith("__Host-") and "HttpOnly" in value and "Secure" in value
        assert "SameSite=lax" in value and "Path=/" in value and "Domain=" not in value
    verified(secure, mailbox, password)
    response = login(secure, password)
    for value in response.headers.get_list("set-cookie"):
        assert (
            value.startswith("__Host-")
            and "HttpOnly" in value
            and "Secure" in value
            and "Domain=" not in value
        )
    result = secure.get(
        "/api/v1/me",
        headers={
            "Authorization": "Bearer mock:sample-lender",
            "X-User-ID": "other",
            "X-Role": "platform_admin",
        },
    )
    assert result.status_code == 200 and result.json()["email"] == EMAIL
    assert result.json()["roles"] == ["renter"]


@pytest.mark.parametrize("tls", ["starttls", "ssl"])
def test_smtp_uses_verified_tls_without_network(
    tls: str, make_client: Any, mailbox: Mailbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    import ssl

    settings = make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin=ORIGIN,
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth62@dzirent.com",
    ).app.state.settings.model_copy(update={"auth_smtp_tls": tls})
    contexts: list[ssl.SSLContext] = []
    sent: list[bool] = []

    class LocalSmtp:
        def __init__(self, *_: Any, **kwargs: Any) -> None:
            if "context" in kwargs:
                contexts.append(kwargs["context"])

        def __enter__(self) -> "LocalSmtp":
            return self

        def __exit__(self, *_: Any) -> None:
            pass

        def ehlo(self) -> None:
            pass

        def starttls(self, *, context: ssl.SSLContext) -> None:
            contexts.append(context)

        def send_message(self, _: Any) -> None:
            sent.append(True)

    monkeypatch.setattr(delivery.smtplib, "SMTP", LocalSmtp)
    monkeypatch.setattr(delivery.smtplib, "SMTP_SSL", LocalSmtp)
    transport = delivery.SmtpDelivery(settings)
    transport.send(recipient=EMAIL, purpose="verify_email", link="http://127.0.0.1/private-fixture")
    assert sent == [True] and len(contexts) == 1
    assert contexts[0].check_hostname and contexts[0].verify_mode == ssl.CERT_REQUIRED
    with pytest.raises(ApiError):
        transport.send(
            recipient="test01_renter@example.com", purpose="verify_email", link="private"
        )
    assert sent == [True]


def test_dormant_native_and_legacy_subjects_cannot_be_adopted(
    native: TestClient, password: SecretStr, db: Engine
) -> None:
    # Match an existing native email without a credential: public signup cannot attach one.
    from uuid import uuid4

    user_id = uuid4()
    with session_factory(db).begin() as session:
        session.add(
            orm.User(
                id=user_id,
                auth_provider="native",
                auth_subject=str(user_id),
                email=EMAIL.upper(),
                display_name="Dormant",
                status="active",
            )
        )
    signup(native, password)
    assert login(native, password).status_code == 401
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 0
        assert (
            connection.scalar(
                select(func.count()).select_from(orm.User).where(orm.User.email == EMAIL.upper())
            )
            == 1
        )


def test_concurrent_signup_and_reset_are_serialized(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any, db: Engine
) -> None:
    clients = [
        make_client(
            mode="connected",
            identity_mode="native",
            auth_web_origin=ORIGIN,
            auth_email_backend="smtp",
            auth_smtp_host="unused.localhost",
            auth_email_sender="auth62@dzirent.com",
        )
        for _ in range(2)
    ]
    tokens = [csrf(client) for client in clients]

    def register(pair: tuple[TestClient, str]) -> int:
        client, token = pair
        return mutate(
            client,
            "/auth/register",
            {
                "email": EMAIL,
                "display_name": "Concurrent fixture",
                "password": password.get_secret_value(),
            },
            token=token,
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(register, zip(clients, tokens, strict=True))) == [202, 202]
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 1
    assert len(mailbox.messages) == 1
    assert login(native, password).status_code == 200
    assert mutate(native, "/auth/password/request", {"email": EMAIL}).status_code == 202
    raw = mailbox.token("reset_password")

    def reset(client: TestClient) -> int:
        return mutate(
            client,
            "/auth/password/reset",
            {"token": raw, "new_password": secrets.token_urlsafe(24)},
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reset, clients)) == [200, 400]
    assert native.get("/api/v1/auth/session").status_code == 401


def test_unknown_login_does_real_dummy_work_and_old_profile_rehashes(
    native: TestClient, password: SecretStr, db: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    from argon2 import PasswordHasher, Type

    signup(native, password)
    original = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1, type=Type.ID).hash(
        password.get_secret_value()
    )
    with db.begin() as connection:
        connection.execute(update(orm.AuthCredential).values(password_hash=original))
    assert login(native, password).status_code == 200
    with db.connect() as connection:
        updated = connection.scalar(select(orm.AuthCredential.password_hash))
    assert updated != original and not crypto.needs_rehash(updated)
    called: list[bool] = []
    verify = crypto._hasher.verify

    def observed(_: Any, encoded: str, candidate: str) -> bool:
        called.append(encoded == crypto._dummy_hash())
        return verify(encoded, candidate)

    monkeypatch.setattr(type(crypto._hasher), "verify", observed)
    assert (
        login(native, SecretStr(secrets.token_urlsafe(24)), "absent@mail.dzirent.com").status_code
        == 401
    )
    assert called == [True]
