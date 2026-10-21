"""Provider-neutral delivery port. Disabled is a hard failure, never a console token sink."""

import smtplib
import ssl
from email.message import EmailMessage
from typing import Literal, Protocol

from ..errors import unavailable
from ..settings import Settings

Purpose = Literal["verify_email", "reset_password"]


def reserved_mailbox(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].casefold()
    reserved = {"example.com", "example.net", "example.org", "example.invalid"}
    return any(domain == base or domain.endswith(f".{base}") for base in reserved) or domain.endswith((".invalid", ".test", ".example", ".localhost"))


class EmailDelivery(Protocol):
    def send(self, *, recipient: str, purpose: Purpose, link: str) -> None: ...


class SmtpDelivery:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, *, recipient: str, purpose: Purpose, link: str) -> None:
        if reserved_mailbox(recipient):
            raise unavailable("Email delivery to reserved sample domains is disabled.")
        settings = self.settings
        message = EmailMessage()
        message["From"] = settings.auth_email_sender
        message["To"] = recipient
        message["Subject"] = "Verify your Dzirent email" if purpose == "verify_email" else "Reset your Dzirent password"
        message.set_content(
            f"Complete your Dzirent request using this single-use link:\n\n{link}\n\n"
            "If you did not request this, ignore this message."
        )
        try:
            context = ssl.create_default_context()
            if settings.auth_smtp_tls == "ssl":
                client: smtplib.SMTP = smtplib.SMTP_SSL(
                    settings.auth_smtp_host, settings.auth_smtp_port, timeout=8, context=context
                )
            else:
                client = smtplib.SMTP(settings.auth_smtp_host, settings.auth_smtp_port, timeout=8)
                client.ehlo()
                client.starttls(context=context)
                client.ehlo()
            with client:
                if settings.auth_smtp_user:
                    client.login(settings.auth_smtp_user, settings.auth_smtp_password.get_secret_value())
                client.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            # Never include SMTP errors, recipient, message or link in API errors/logs.
            raise unavailable("Email delivery is temporarily unavailable.") from exc


def email_delivery(settings: Settings) -> EmailDelivery:
    if settings.auth_email_backend != "smtp":
        raise unavailable("Email delivery is not configured. No email was sent.")
    return SmtpDelivery(settings)
