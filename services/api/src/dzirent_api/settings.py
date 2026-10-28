import json
import re
from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MODES = json.loads((Path(__file__).resolve().parents[4] / "contracts/modes.json").read_text())
# Exact browser origin: scheme, host and optional port. No wildcard, path or trailing slash.
EXACT_ORIGIN = re.compile(r"^https?://[A-Za-z0-9.-]+(:\d{1,5})?$")
# This temporary exception is restricted to the existing owner-protected staging preview.
STAGING_AUTH_ORIGIN = (
    "https://dzirent-git-codex-connected-staging-stage3-vivekkallakuri-8617.vercel.app"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DZIRENT_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )
    mode: Literal["demo", "connected"] = "demo"
    environment: Literal["local", "test", "staging", "production"] = "local"
    identity_mode: Literal["mock", "native"] = "mock"
    database_url: SecretStr = SecretStr("")
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_connect_timeout_s: int = Field(default=5, ge=1, le=60)
    db_statement_timeout_ms: int = Field(default=5000, ge=100, le=60000)
    cors_origins: list[str] = ["http://127.0.0.1:3000"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    auth_web_origin: str = "http://127.0.0.1:3000"
    auth_csrf_key: SecretStr = SecretStr("")
    auth_session_hours: int = Field(default=24, ge=1, le=168)
    auth_verification_minutes: int = Field(default=1440, ge=5, le=1440)
    auth_reset_minutes: int = Field(default=30, ge=5, le=60)
    auth_email_backend: Literal["disabled", "smtp"] = "disabled"
    auth_email_sender: str = ""
    auth_smtp_host: str = ""
    auth_smtp_port: int = Field(default=465, ge=1, le=65535)
    auth_smtp_tls: Literal["ssl", "starttls"] = "ssl"
    auth_smtp_user: str = ""
    auth_smtp_password: SecretStr = SecretStr("")
    auth_outbox_active_key_id: str = ""
    auth_outbox_keys: SecretStr = SecretStr("")
    auth_email_worker_enabled: bool = True
    auth_outbox_capacity: int = Field(default=1000, ge=1, le=10000)
    auth_outbox_poll_seconds: float = Field(default=2, ge=0.1, le=60)
    auth_staging_signup_without_email: bool = False
    auth_staging_proxy_key: SecretStr = SecretStr("")

    @property
    def mock_identity_allowed(self) -> bool:
        allowed = MODES["api_mock_identity_allowed_only"]
        return self.mode == allowed["mode"] and self.environment in allowed["environment"]

    @property
    def deployed(self) -> bool:
        return self.environment in {"staging", "production"}

    @model_validator(mode="after")
    def enforce_modes(self) -> Self:
        proxy_key = self.auth_staging_proxy_key.get_secret_value()
        if self.auth_staging_signup_without_email or proxy_key:
            if (
                self.environment != "staging"
                or self.mode != "connected"
                or self.identity_mode != "native"
                or self.auth_web_origin != STAGING_AUTH_ORIGIN
                or not re.fullmatch(r"[A-Za-z0-9_-]{43,128}", proxy_key)
            ):
                raise ValueError(
                    "Temporary staging auth requires native connected staging, the protected "
                    "preview origin and a private server-to-server proxy key"
                )
        if self.auth_staging_signup_without_email and (
            self.auth_email_backend != "disabled" or self.auth_email_worker_enabled
        ):
            raise ValueError(
                "Disable temporary staging signup before configuring email delivery; "
                "SMTP and the worker must remain disabled while it is enabled"
            )
        if self.identity_mode == "mock" and not self.mock_identity_allowed:
            raise ValueError("Mock identity is restricted to explicit local/test demo mode")
        if self.mode == "connected" and (
            self.identity_mode != "native" or not self.database_url.get_secret_value()
        ):
            raise ValueError("Connected mode requires native identity and a database URL")
        if self.identity_mode == "native" and self.mode != "connected":
            raise ValueError("Native identity is supported only in connected mode")
        if any("*" in origin or not EXACT_ORIGIN.match(origin) for origin in self.cors_origins):
            raise ValueError("CORS origins must be exact")
        if self.deployed and any(not origin.startswith("https://") for origin in self.cors_origins):
            raise ValueError("Deployed environments require https CORS origins")
        if not EXACT_ORIGIN.fullmatch(self.auth_web_origin):
            raise ValueError("Auth web origin must be one exact origin")
        origin = urlsplit(self.auth_web_origin)
        try:
            port = origin.port
        except ValueError:
            raise ValueError("Invalid auth web origin port") from None
        if (
            not origin.hostname
            or origin.hostname != origin.hostname.lower()
            or origin.netloc != origin.hostname + (f":{port}" if port else "")
            or port in {0, 80 if origin.scheme == "http" else 443}
            or any(
                not label or label.startswith("-") or label.endswith("-") or len(label) > 63
                for label in origin.hostname.split(".")
            )
        ):
            raise ValueError("Auth web origin must use a canonical host and port")
        if origin.scheme == "http" and origin.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("HTTP auth is restricted to loopback local/test development")
        if self.mode == "connected":
            if len(self.auth_csrf_key.get_secret_value().encode()) < 32:
                raise ValueError(
                    "Native auth requires a private random CSRF key of at least 32 bytes"
                )
            if self.deployed and not self.auth_web_origin.startswith("https://"):
                raise ValueError("Deployed auth requires an HTTPS web origin")
            if not self.deployed and not self.auth_web_origin.startswith("https://"):
                if urlsplit(self.auth_web_origin).hostname not in {"localhost", "127.0.0.1"}:
                    raise ValueError("HTTP auth is restricted to loopback local/test development")
        if self.auth_email_backend == "smtp":
            from .auth.crypto import normalize_email

            if not self.auth_smtp_host or not self.auth_email_sender:
                raise ValueError("SMTP requires an explicit host and sender")
            if (
                not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", self.auth_smtp_host)
                or any(
                    not label or label.startswith("-") or label.endswith("-") or len(label) > 63
                    for label in self.auth_smtp_host.split(".")
                )
                or normalize_email(self.auth_email_sender) != self.auth_email_sender
                or bool(self.auth_smtp_user) != bool(self.auth_smtp_password.get_secret_value())
                or any(c in self.auth_smtp_user for c in "\r\n")
            ):
                raise ValueError("Invalid SMTP configuration")
        return self
