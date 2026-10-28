"""Pure cryptography/rendering/SMTP tests. No real transport or mailbox is used."""

import json
import secrets
import smtplib
import ssl
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from conftest import settings_for
from cryptography.exceptions import InvalidTag
from pydantic import SecretStr, ValidationError

from dzirent_api.auth import delivery, mail_crypto
from dzirent_api.errors import ApiError


@pytest.fixture
def mail_settings() -> Any:
    return settings_for(
        "",
        auth_web_origin="http://127.0.0.1:3500",
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="auth64@dzirent.com",
    )


def test_envelopes_are_randomized_authenticated_and_rotate(mail_settings: Any) -> None:
    raw = secrets.token_urlsafe(32)
    metadata = dict(
        job_id=uuid4(),
        token_id=uuid4(),
        user_id=uuid4(),
        purpose="verify_email",
        expires_at=datetime.now(UTC),
        key_id="local64",
    )
    associated = mail_crypto.aad(**metadata)
    data = {
        "token": raw,
        "recipient": "fixture@mail.dzirent.com",
        "origin": mail_settings.auth_web_origin,
    }
    a = mail_crypto.seal(mail_settings, data, associated)
    b = mail_crypto.seal(mail_settings, data, associated)
    assert a != b and raw.encode() not in a and data["recipient"].encode() not in a
    assert (
        mail_crypto.unseal(mail_settings, "local64", a, associated)["token"].get_secret_value()
        == raw
    )
    assert raw not in repr(mail_crypto.unseal(mail_settings, "local64", a, associated))
    for changed, aad in ((a[:-1] + bytes([a[-1] ^ 1]), associated), (a, associated + b"tamper")):
        with pytest.raises(InvalidTag):
            mail_crypto.unseal(mail_settings, "local64", changed, aad)
    keys = json.loads(mail_settings.auth_outbox_keys.get_secret_value())
    keys["next64"] = secrets.token_urlsafe(32)
    rotated = mail_settings.model_copy(
        update={
            "auth_outbox_keys": SecretStr(json.dumps(keys)),
            "auth_outbox_active_key_id": "next64",
        }
    )
    assert mail_crypto.unseal(rotated, "local64", a, associated)["token"].get_secret_value() == raw
    assert mail_crypto.seal(rotated, data, associated) != a


@pytest.mark.parametrize(
    "keys,active",
    [
        ("", ""),
        ("{}", "local64"),
        ('{"bad":"short"}', "bad"),
        ('{"UPPER":"' + "A" * 43 + '"}', "UPPER"),
        ("[]", "a"),
        ('{"a":1}', "a"),
    ],
)
def test_invalid_encryption_configuration_fails_closed(
    mail_settings: Any, keys: str, active: str
) -> None:
    with pytest.raises(ApiError) as error:
        mail_crypto.keyring(
            mail_settings.model_copy(
                update={"auth_outbox_keys": SecretStr(keys), "auth_outbox_active_key_id": active}
            )
        )
    assert error.value.status == 503
    if keys:
        assert keys not in str(error.value)


def test_encryption_key_cannot_reuse_csrf_secret(mail_settings: Any) -> None:
    raw = secrets.token_urlsafe(32)
    with pytest.raises(ApiError):
        mail_crypto.keyring(
            mail_settings.model_copy(
                update={
                    "auth_csrf_key": SecretStr(raw),
                    "auth_outbox_active_key_id": "k",
                    "auth_outbox_keys": SecretStr(json.dumps({"k": raw})),
                }
            )
        )


@pytest.mark.parametrize(
    "change",
    [
        {"recipient": "test@example.com"},
        {"recipient": "Fixture@mail.dzirent.com"},
        {"recipient": "a@mail.dzirent.com\r\nBcc: leak@mail.dzirent.com"},
        {"link": "https://other.dzirent.com/auth/verify-email#token=bad"},
        {"link": "http://127.0.0.1:3500/auth/verify-email?token=bad"},
        {"link": "http://127.0.0.1:3500/auth/reset-password#token=bad"},
        {"message_id": "bad\r\nBcc: leak@mail.dzirent.com"},
        {"purpose": "other"},
    ],
)
def test_rendering_rejects_injection_reserved_and_wrong_urls(
    mail_settings: Any, change: dict[str, Any]
) -> None:
    values = dict(
        recipient="fixture@mail.dzirent.com",
        purpose="verify_email",
        link=f"{mail_settings.auth_web_origin}/auth/verify-email#token={secrets.token_urlsafe(32)}",
        message_id=f"<dzirent-{uuid4().hex}@dzirent.com>",
    )
    values.update(change)
    with pytest.raises(delivery.DeliveryFailure) as error:
        delivery.render_message(mail_settings, **values)
    assert not error.value.transient


@pytest.mark.parametrize(
    "origin",
    [
        "http://public.dzirent.com",
        "https://UPPER.dzirent.com",
        "https://bad..dzirent.com",
        "https://ok.dzirent.com:443",
        "https://ok.dzirent.com:0",
    ],
)
def test_config_rejects_unsafe_noncanonical_origins(origin: str) -> None:
    with pytest.raises(ValidationError):
        settings_for("", auth_web_origin=origin)


@pytest.mark.parametrize("tls", ["ssl", "starttls"])
@pytest.mark.parametrize(
    "failure,transient",
    [
        (None, None),
        (smtplib.SMTPDataError(451, b"private"), True),
        (smtplib.SMTPAuthenticationError(535, b"private"), False),
        (smtplib.SMTPRecipientsRefused({"private": (550, b"private")}), False),
        (TimeoutError("private"), True),
        (ssl.SSLCertVerificationError("private"), False),
        (smtplib.SMTPNotSupportedError("private"), False),
    ],
)
def test_fake_smtp_tls_failure_classification_and_close(
    mail_settings: Any,
    monkeypatch: pytest.MonkeyPatch,
    tls: str,
    failure: Exception | None,
    transient: bool | None,
) -> None:
    settings = mail_settings.model_copy(
        update={
            "auth_smtp_tls": tls,
            "auth_smtp_user": "local-fixture",
            "auth_smtp_password": SecretStr(secrets.token_urlsafe(32)),
        }
    )
    events: list[str] = []
    contexts: list[ssl.SSLContext] = []

    class FakeSmtp:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            if "context" in kwargs:
                contexts.append(kwargs["context"])

        def __enter__(self) -> Any:
            events.append("open")
            return self

        def __exit__(self, *args: Any) -> None:
            events.append("close")

        def ehlo(self) -> None:
            events.append("ehlo")

        def starttls(self, *, context: ssl.SSLContext) -> None:
            contexts.append(context)
            if isinstance(failure, (ssl.SSLCertVerificationError, smtplib.SMTPNotSupportedError)):
                raise failure

        def login(self, user: str, password: str) -> None:
            assert contexts and contexts[0].check_hostname  # Credentials only after verified TLS.
            assert user == settings.auth_smtp_user
            assert password == settings.auth_smtp_password.get_secret_value()
            events.append("login")

        def send_message(self, message: Any) -> dict[str, Any]:
            assert message["From"] == settings.auth_email_sender
            assert (
                message["To"] == values["recipient"]
                and message["Message-ID"] == values["message_id"]
            )
            assert values["link"] in message.get_content()
            assert not message["Bcc"] and not message["Cc"]
            assert message.get_content_type() == "text/plain" and not message.is_multipart()
            if failure is not None:
                raise failure
            events.append("sent")
            return {}

    monkeypatch.setattr(delivery.smtplib, "SMTP", FakeSmtp)
    monkeypatch.setattr(delivery.smtplib, "SMTP_SSL", FakeSmtp)
    values = dict(
        recipient="fixture@mail.dzirent.com",
        purpose="verify_email",
        link=f"{settings.auth_web_origin}/auth/verify-email#token={secrets.token_urlsafe(32)}",
        message_id=f"<dzirent-{uuid4().hex}@dzirent.com>",
    )
    if failure is None:
        delivery.SmtpDelivery(settings).send(**values)
        assert "sent" in events
    else:
        with pytest.raises(delivery.DeliveryFailure) as error:
            delivery.SmtpDelivery(settings).send(**values)
        assert error.value.transient is transient and "private" not in str(error.value)
        assert "sent" not in events
        if tls == "starttls" and isinstance(
            failure, (ssl.SSLCertVerificationError, smtplib.SMTPNotSupportedError)
        ):
            assert "login" not in events
    assert len(contexts) == 1 and contexts[0].check_hostname
    assert contexts[0].verify_mode == ssl.CERT_REQUIRED and events[-1] == "close"
