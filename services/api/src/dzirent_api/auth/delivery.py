"""Strict provider-neutral SMTP adapter; no console links or insecure fallback."""

import re
import smtplib
import ssl
from email.message import EmailMessage
from typing import Literal, Protocol
from urllib.parse import urlsplit

from ..errors import unavailable
from ..settings import Settings
from .crypto import TOKEN_PATTERN, normalize_email

Purpose = Literal["verify_email", "reset_password"]


def reserved_mailbox(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].casefold()
    reserved = {"example.com", "example.net", "example.org", "example.invalid", "localhost"}
    return any(
        domain == base or domain.endswith(f".{base}") for base in reserved
    ) or domain.endswith((".invalid", ".test", ".example", ".localhost"))


class DeliveryFailure(Exception):
    def __init__(self, *, transient: bool) -> None:
        super().__init__("Email transport unavailable")
        self.transient = transient


class EmailDelivery(Protocol):
    def send(self, *, recipient: str, purpose: Purpose, link: str, message_id: str) -> None: ...


def render_message(
    settings: Settings, *, recipient: str, purpose: Purpose, link: str, message_id: str
) -> EmailMessage:
    try:
        for mailbox in (recipient, settings.auth_email_sender):
            if normalize_email(mailbox) != mailbox or reserved_mailbox(mailbox):
                raise ValueError
        if purpose not in {"verify_email", "reset_password"}:
            raise ValueError
        page = "verify-email" if purpose == "verify_email" else "reset-password"
        parsed = urlsplit(link)
        origin = urlsplit(settings.auth_web_origin)
        if (
            parsed.scheme != origin.scheme
            or parsed.netloc != origin.netloc
            or parsed.path != f"/auth/{page}"
            or parsed.query
            or not parsed.fragment.startswith("token=")
            or not TOKEN_PATTERN.fullmatch(parsed.fragment[6:])
            or link != f"{settings.auth_web_origin}/auth/{page}#{parsed.fragment}"
        ):
            raise ValueError
        if not re.fullmatch(r"<dzirent-[0-9a-f]{32}@[a-z0-9.-]+>", message_id):
            raise ValueError
    except (ValueError, TypeError):
        raise DeliveryFailure(transient=False) from None
    message = EmailMessage()
    message["From"] = settings.auth_email_sender
    message["To"] = recipient
    message["Message-ID"] = message_id
    message["Subject"] = (
        "Verify your Dzirent email" if purpose == "verify_email" else "Reset your Dzirent password"
    )
    message.set_content(
        f"Complete your Dzirent request using this single-use link:\n\n{link}\n\n"
        "If you did not request this, ignore this message."
    )
    return message


class SmtpDelivery:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, *, recipient: str, purpose: Purpose, link: str, message_id: str) -> None:
        settings = self.settings
        message = render_message(
            settings, recipient=recipient, purpose=purpose, link=link, message_id=message_id
        )
        try:
            context = ssl.create_default_context()
            client: smtplib.SMTP
            if settings.auth_smtp_tls == "ssl":
                client = smtplib.SMTP_SSL(
                    settings.auth_smtp_host, settings.auth_smtp_port, timeout=8, context=context
                )
            else:
                client = smtplib.SMTP(settings.auth_smtp_host, settings.auth_smtp_port, timeout=8)
            with client:
                if settings.auth_smtp_tls == "starttls":
                    client.ehlo()
                    client.starttls(context=context)
                    client.ehlo()
                if settings.auth_smtp_user:
                    client.login(
                        settings.auth_smtp_user, settings.auth_smtp_password.get_secret_value()
                    )
                refused = client.send_message(message)
                if refused:
                    codes = [code for code, _ in refused.values()]
                    raise DeliveryFailure(transient=all(400 <= code < 500 for code in codes))
        except DeliveryFailure:
            raise
        except (ssl.SSLCertVerificationError, smtplib.SMTPNotSupportedError):
            raise DeliveryFailure(transient=False) from None
        except smtplib.SMTPRecipientsRefused as exc:
            raise DeliveryFailure(
                transient=all(400 <= code < 500 for code, _ in exc.recipients.values())
            ) from None
        except smtplib.SMTPResponseException as exc:
            raise DeliveryFailure(transient=400 <= exc.smtp_code < 500) from None
        except (OSError, smtplib.SMTPException):
            raise DeliveryFailure(transient=True) from None


def email_delivery(settings: Settings) -> EmailDelivery:
    if settings.auth_email_backend != "smtp" or reserved_mailbox(settings.auth_email_sender):
        raise unavailable("Email delivery is not configured. No email was sent.")
    return SmtpDelivery(settings)
