"""Real local PG17 auth regressions. No network mail, hosted database, or real identities."""

import secrets
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import TAXONOMY, write_body
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, func, select, update

from dzirent_api import orm
from dzirent_api.auth import crypto, dispatch, outbox, schemas, service
from dzirent_api.db import session_factory
from dzirent_api.errors import unavailable

ORIGIN = "http://127.0.0.1:3500"
EMAIL = "auth62-renter@mail.dzirent.com"


@dataclass(repr=False)
class Mail:
    recipient: str
    purpose: str
    token: SecretStr
    committed: bool
    message_id: str


@dataclass(repr=False)
class Mailbox:
    engine: Engine
    messages: list[Mail] = field(default_factory=list)

    def send(self, *, recipient: str, purpose: str, link: str, message_id: str) -> None:
        raw = parse_qs(urlsplit(link).fragment)["token"][0]
        with self.engine.connect() as connection:
            committed = (
                connection.scalar(
                    select(orm.AuthToken.id).where(orm.AuthToken.token_hash == crypto.digest(raw))
                )
                is not None
            )
        self.messages.append(Mail(recipient, purpose, SecretStr(raw), committed, message_id))

    def token(self, purpose: str = "verify_email", email: str = EMAIL) -> str:
        return next(
            item.token.get_secret_value()
            for item in reversed(self.messages)
            if item.purpose == purpose and item.recipient == email
        )


@pytest.fixture
def password() -> SecretStr:
    return SecretStr(secrets.token_urlsafe(24))


@pytest.fixture
def mailbox(db: Engine, monkeypatch: pytest.MonkeyPatch) -> Mailbox:
    mailbox = Mailbox(db)

    def factory(settings: Any) -> Mailbox:
        if settings.auth_email_backend == "disabled":
            raise unavailable("Email delivery is not configured. No email was sent.")
        return mailbox

    monkeypatch.setattr(dispatch, "email_delivery", factory)
    monkeypatch.setattr(outbox, "email_delivery", factory)
    return mailbox


@pytest.fixture
def native(mailbox: Mailbox, make_client: Any) -> TestClient:
    return make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin=ORIGIN,
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth62@dzirent.com",
    )


def csrf(client: TestClient) -> str:
    response = client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    return str(response.json()["csrf_token"])


def mutate(
    client: TestClient,
    path: str,
    data: dict[str, Any] | None = None,
    *,
    method: str = "POST",
    token: str | None = None,
    headers: dict[str, str] | None = None,
) -> Any:
    expected_origin = client.app.state.settings.auth_web_origin
    response = client.request(
        method,
        f"/api/v1{path}",
        json=data or {},
        headers={
            "Origin": expected_origin,
            "X-Dzirent-CSRF": token or csrf(client),
            **(headers or {}),
        },
    )
    if client.app.state.settings.auth_email_backend == "smtp":
        assert client.app.state.auth_delivery.drain(timeout=3)
    return response


def signup(client: TestClient, password: SecretStr, email: str = EMAIL) -> None:
    response = mutate(
        client,
        "/auth/register",
        {
            "email": email,
            "display_name": "Local auth fixture",
            "password": password.get_secret_value(),
        },
    )
    assert response.status_code == 202


def login(client: TestClient, password: SecretStr, email: str = EMAIL) -> Any:
    return mutate(client, "/auth/login", {"email": email, "password": password.get_secret_value()})


def verified(client: TestClient, mailbox: Mailbox, password: SecretStr, email: str = EMAIL) -> Any:
    signup(client, password, email)
    assert (
        mutate(client, "/auth/email/verify", {"token": mailbox.token(email=email)}).status_code
        == 200
    )
    result = login(client, password, email)
    assert result.status_code == 200
    return result


def test_signup_is_unverified_and_does_not_adopt_mock(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    signup(native, password, "  AUTH62-Renter@mail.dzirent.com  ")
    result = login(native, password)
    assert result.status_code == 200
    assert result.json()["email_verified"] is False
    assert result.json()["user"]["roles"] == ["renter"]
    assert result.json()["capabilities"] == []
    assert set(result.json()) == {
        "user",
        "email_verified",
        "synthetic",
        "capabilities",
        "expires_at",
    }
    assert (
        mutate(
            native, "/me", {"display_name": "Forbidden before verification"}, method="PATCH"
        ).status_code
        == 403
    )
    assert mutate(native, "/me/bootstrap").json()["id"] == result.json()["user"]["id"]
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 1
        assert (
            connection.scalar(
                select(func.count()).select_from(orm.User).where(orm.User.auth_provider == "mock")
            )
            == 1
        )
        assert connection.scalar(select(orm.AuthCredential.email_normalized)) == EMAIL


@pytest.mark.parametrize(
    "length,accepted", [(0, False), (11, False), (12, True), (128, True), (129, False)]
)
def test_password_policy(native: TestClient, length: int, accepted: bool) -> None:
    # Non-secret generated test input; never the owner's supplied staging password.
    value = secrets.token_urlsafe(128)[:length]
    response = mutate(
        native,
        "/auth/register",
        {"email": EMAIL, "display_name": "Local fixture", "password": value},
    )
    assert response.status_code == (202 if accepted else 422)


def test_unique_normalized_email_and_independent_argon_salts(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    signup(native, password)
    signup(native, password, EMAIL.upper())
    signup(native, password, "auth62-other@mail.dzirent.com")
    with db.connect() as connection:
        rows = connection.execute(select(orm.AuthCredential.password_hash)).scalars().all()
    assert len(rows) == 2 and all(row.startswith("$argon2id$") for row in rows)
    assert len(set(rows)) == 2
    assert all(crypto.verify_password(row, password.get_secret_value()) for row in rows)
    assert len(mailbox.messages) == 2


def test_unknown_wrong_password_and_client_identity_are_denied(
    native: TestClient, password: SecretStr
) -> None:
    signup(native, password)
    wrong = SecretStr(secrets.token_urlsafe(24))
    known = login(native, wrong)
    unknown = login(native, wrong, "missing@mail.dzirent.com")
    assert known.status_code == unknown.status_code == 401
    assert known.json()["error"] == unknown.json()["error"]
    for identity_field, value in (
        ("roles", ["platform_admin"]),
        ("user_id", secrets.token_hex(16)),
        ("auth_provider", "mock"),
        ("owner_id", "other"),
    ):
        response = mutate(
            native,
            "/auth/register",
            {
                "email": EMAIL,
                "display_name": "Fixture",
                "password": password.get_secret_value(),
                identity_field: value,
            },
        )
        assert response.status_code == 422
    for authorization in (
        "Bearer mock:sample-lender",
        "Bearer dzirent-demo-lender",
        "Bearer unsigned",
    ):
        assert (
            native.get(
                "/api/v1/me",
                headers={
                    "Authorization": authorization,
                    "X-User-ID": "other",
                    "X-Role": "platform_admin",
                },
            ).status_code
            == 401
        )


def test_session_rotation_logout_and_secure_storage(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    first = verified(native, mailbox, password)
    old = native.cookies.get("dzirent_session")
    assert old is not None
    assert login(native, password).status_code == 200
    current = native.cookies.get("dzirent_session")
    assert current != old
    with db.connect() as connection:
        rows = connection.execute(
            select(orm.AuthSession.token_hash, orm.AuthSession.revoked_at)
        ).all()
    assert all(row.token_hash not in {old, current} for row in rows)
    assert next(row.revoked_at for row in rows if row.token_hash == crypto.digest(old)) is not None
    assert native.get("/api/v1/auth/session").json()["user"]["id"] == first.json()["user"]["id"]
    assert mutate(native, "/auth/logout").status_code == 204
    assert native.get("/api/v1/auth/session").status_code == 401


def test_csrf_session_binding_origin_fetch_and_limits(
    native: TestClient, mailbox: Mailbox, password: SecretStr
) -> None:
    anonymous = csrf(native)
    verified(native, mailbox, password)
    session_token = native.cookies.get("dzirent_session")
    client_token = native.cookies.get("dzirent_client")
    response = mutate(
        native,
        "/auth/logout",
        token=anonymous,
        headers={
            "Cookie": f"dzirent_session={session_token}; dzirent_csrf={anonymous}; dzirent_client={client_token}"
        },
    )
    assert response.status_code == 403
    good = csrf(native)
    for headers in (
        {"Origin": "https://evil.example"},
        {"Origin": "null"},
        {"Sec-Fetch-Site": "cross-site"},
        {"Sec-Fetch-Site": "same-site"},
        {"X-Dzirent-CSRF": "wrong"},
    ):
        assert mutate(native, "/auth/logout", token=good, headers=headers).status_code == 403
    assert native.post("/api/v1/auth/logout", json={}).status_code == 403
    assert (
        native.post("/api/v1/auth/logout", json={}, headers={"X-Dzirent-CSRF": good}).status_code
        == 403
    )
    assert (
        native.post(
            "/api/v1/auth/logout",
            content=b"x" * 17000,
            headers={"Origin": ORIGIN, "X-Dzirent-CSRF": good, "Content-Type": "application/json"},
        ).status_code
        == 413
    )
    assert (
        native.post(
            "/api/v1/auth/logout",
            content="{}",
            headers={"Origin": ORIGIN, "X-Dzirent-CSRF": good, "Content-Type": "text/plain"},
        ).status_code
        == 415
    )


def test_password_change_logout_all_deactivation(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    verified(native, mailbox, password)
    other = make_client(mode="connected", identity_mode="native", auth_web_origin=ORIGIN)
    assert login(other, password).status_code == 200
    fresh = SecretStr(secrets.token_urlsafe(24))
    assert (
        mutate(
            native,
            "/auth/password/change",
            {
                "current_password": password.get_secret_value(),
                "new_password": fresh.get_secret_value(),
            },
        ).status_code
        == 200
    )
    assert other.get("/api/v1/auth/session").status_code == 401
    assert login(other, password).status_code == 401
    assert login(other, fresh).status_code == 200
    assert (
        mutate(
            native, "/auth/logout-all", {"current_password": fresh.get_secret_value()}
        ).status_code
        == 204
    )
    assert other.get("/api/v1/auth/session").status_code == 401
    assert login(native, fresh).status_code == 200
    assert mutate(native, "/me", method="DELETE").status_code == 403
    assert (
        mutate(
            native, "/auth/deactivate", {"current_password": fresh.get_secret_value()}
        ).status_code
        == 204
    )
    assert login(native, fresh).status_code == 401


def test_verification_replay_reset_wrong_purpose_and_expiry(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    signup(native, password)
    token = mailbox.token()
    assert (
        mutate(
            native,
            "/auth/password/reset",
            {"token": token, "new_password": secrets.token_urlsafe(24)},
        ).status_code
        == 400
    )
    assert mutate(native, "/auth/email/verify", {"token": token}).status_code == 200
    assert mutate(native, "/auth/email/verify", {"token": token}).status_code == 400
    assert login(native, password).status_code == 200
    assert mutate(native, "/auth/password/request", {"email": EMAIL}).status_code == 202
    reset = mailbox.token("reset_password")
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthToken)
            .where(orm.AuthToken.token_hash == crypto.digest(reset))
            .values(
                created_at=datetime.now(UTC) - timedelta(days=1),
                expires_at=datetime.now(UTC) - timedelta(seconds=1),
            )
        )
    assert (
        mutate(
            native,
            "/auth/password/reset",
            {"token": reset, "new_password": secrets.token_urlsafe(24)},
        ).status_code
        == 400
    )
    assert mutate(native, "/auth/password/request", {"email": EMAIL}).status_code == 202
    reset = mailbox.token("reset_password")
    fresh = SecretStr(secrets.token_urlsafe(24))
    assert (
        mutate(
            native,
            "/auth/password/reset",
            {"token": reset, "new_password": fresh.get_secret_value()},
        ).status_code
        == 200
    )
    assert native.get("/api/v1/auth/session").status_code == 401
    assert (
        mutate(
            native,
            "/auth/password/reset",
            {"token": reset, "new_password": secrets.token_urlsafe(24)},
        ).status_code
        == 400
    )
    assert login(native, fresh).status_code == 200


def test_expired_revoked_and_inactive_sessions(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    verified(native, mailbox, password)
    token = native.cookies.get("dzirent_session")
    with db.begin() as connection:
        connection.execute(
            update(orm.AuthSession)
            .where(orm.AuthSession.token_hash == crypto.digest(str(token)))
            .values(
                created_at=datetime.now(UTC) - timedelta(days=2),
                expires_at=datetime.now(UTC) - timedelta(days=1),
            )
        )
    assert native.get("/api/v1/auth/session").status_code == 401
    assert login(native, password).status_code == 200
    with db.begin() as connection:
        connection.execute(
            update(orm.User).where(orm.User.email == EMAIL).values(status="inactive")
        )
    assert native.get("/api/v1/auth/session").status_code == 401
    assert login(native, password).status_code == 401


def test_lender_enrollment_preserves_renter_and_cross_owner_denies(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    verified(native, mailbox, password)
    metro = TAXONOMY["locations"]["items"][0]["id"]
    assert (
        mutate(
            native, "/me/lender-profile", {"display_name": "Local lender", "metro_id": metro}
        ).status_code
        == 200
    )
    assert native.get("/api/v1/me").json()["roles"] == ["renter", "lender"]
    product = mutate(native, "/lender/products", write_body(image_ids=[]))
    assert product.status_code == 201
    second = make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin=ORIGIN,
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth62@dzirent.com",
    )
    verified(second, mailbox, password, "auth62-second@mail.dzirent.com")
    assert (
        mutate(
            second, "/me/lender-profile", {"display_name": "Other lender", "metro_id": metro}
        ).status_code
        == 200
    )
    assert second.get(f"/api/v1/lender/products/{product.json()['id']}").status_code == 404
    assert (
        mutate(
            second,
            f"/lender/products/{product.json()['id']}",
            {"expected_version": 1, "is_available": False},
            method="PATCH",
        ).status_code
        == 404
    )
    assert (
        mutate(
            native,
            "/me/studio",
            {"display_name": "Local Studio", "bio": "", "is_public": True},
            method="PUT",
        ).status_code
        == 200
    )
    assert second.get("/api/v1/me/studio").status_code == 404
    assert native.get("/api/v1/admin/access").status_code == 403


def test_disabled_delivery_and_reserved_domains(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    disabled = make_client(mode="connected", identity_mode="native", auth_web_origin=ORIGIN)
    assert (
        mutate(
            disabled,
            "/auth/register",
            {"email": EMAIL, "display_name": "Fixture", "password": password.get_secret_value()},
        ).status_code
        == 503
    )
    assert (
        mutate(
            disabled, "/auth/password/request", {"email": "missing@mail.dzirent.com"}
        ).status_code
        == 503
    )
    for email in (
        "test01_renter@example.com",
        "x@sub.example.com",
        "x@example.net",
        "x@sample.invalid",
    ):
        assert (
            mutate(
                native,
                "/auth/register",
                {
                    "email": email,
                    "display_name": "Fixture",
                    "password": password.get_secret_value(),
                },
            ).status_code
            == 422
        )
    assert not mailbox.messages


def test_mail_only_after_committed_token(
    native: TestClient, mailbox: Mailbox, password: SecretStr
) -> None:
    signup(native, password)
    assert len(mailbox.messages) == 1
    assert mailbox.messages[0].committed is True


def test_rollback_never_delivers_link(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    with session_factory(db)() as session:
        session.info["auth_delivery"] = native.app.state.auth_delivery
        service.register(
            session,
            schemas.RegistrationInput(email=EMAIL, display_name="Fixture", password=password),
            native.app.state.settings,
        )
        session.rollback()
    assert len(mailbox.messages) == 0


def test_one_client_cannot_exhaust_shared_proxy_for_another(
    native: TestClient, mailbox: Mailbox, make_client: Any
) -> None:
    token = csrf(native)
    for attempt in range(65):
        response = mutate(
            native,
            "/auth/password/request",
            {"email": f"absent-{attempt}@mail.dzirent.com"},
            token=token,
        )
        assert response.status_code in {202, 429}
    other = make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin=ORIGIN,
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth62@dzirent.com",
    )
    assert (
        mutate(other, "/auth/password/request", {"email": "unrelated@mail.dzirent.com"}).status_code
        == 202
    )


def test_concurrent_verification_is_single_use(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    signup(native, password)
    token = mailbox.token()
    clients = [
        make_client(mode="connected", identity_mode="native", auth_web_origin=ORIGIN)
        for _ in range(2)
    ]
    for client in clients:
        csrf(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(
            pool.map(
                lambda client: mutate(client, "/auth/email/verify", {"token": token}).status_code,
                clients,
            )
        )
    assert sorted(statuses) == [200, 400]
