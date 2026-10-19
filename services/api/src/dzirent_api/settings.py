import json
import re
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MODES = json.loads((Path(__file__).resolve().parents[4] / "contracts/modes.json").read_text())
# Exact browser origin: scheme, host and optional port. No wildcard, path or trailing slash.
EXACT_ORIGIN = re.compile(r"^https?://[A-Za-z0-9.-]+(:\d{1,5})?$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DZIRENT_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )
    mode: Literal["demo", "connected"] = "demo"
    environment: Literal["local", "test", "staging", "production"] = "local"
    identity_mode: Literal["mock", "clerk"] = "mock"
    database_url: SecretStr = SecretStr("")
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_connect_timeout_s: int = Field(default=5, ge=1, le=60)
    db_statement_timeout_ms: int = Field(default=5000, ge=100, le=60000)
    clerk_issuer: str = ""
    clerk_authorized_parties: list[str] = []
    # One of these is required for Clerk: the PEM public key verifies networklessly (preferred);
    # the secret key lets the official SDK fetch the instance JWKS.
    clerk_jwt_key: SecretStr = SecretStr("")
    clerk_secret_key: SecretStr = SecretStr("")
    clerk_audience: str = ""
    cors_origins: list[str] = ["http://127.0.0.1:3000"]
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    @property
    def mock_identity_allowed(self) -> bool:
        allowed = MODES["api_mock_identity_allowed_only"]
        return self.mode == allowed["mode"] and self.environment in allowed["environment"]

    @property
    def deployed(self) -> bool:
        return self.environment in {"staging", "production"}

    @model_validator(mode="after")
    def enforce_modes(self) -> Self:
        if self.identity_mode == "mock" and not self.mock_identity_allowed:
            raise ValueError("Mock identity is restricted to explicit local/test demo mode")
        if self.mode == "connected" and (
            self.identity_mode != "clerk" or not self.database_url.get_secret_value()
        ):
            raise ValueError(
                "Connected mode requires Clerk issuer/authorized parties and database URL"
            )
        if self.identity_mode == "clerk":
            if not self.clerk_issuer or not self.clerk_authorized_parties:
                raise ValueError(
                    "Connected mode requires Clerk issuer/authorized parties and database URL"
                )
            if not self.clerk_issuer.startswith("https://"):
                raise ValueError("Clerk issuer must be an https URL")
            if not (
                self.clerk_jwt_key.get_secret_value() or self.clerk_secret_key.get_secret_value()
            ):
                raise ValueError("Clerk verification requires a JWT public key or secret key")
            if not all(EXACT_ORIGIN.match(party) for party in self.clerk_authorized_parties):
                raise ValueError("Clerk authorized parties must be exact origins")
        if any("*" in origin or not EXACT_ORIGIN.match(origin) for origin in self.cors_origins):
            raise ValueError("CORS origins must be exact")
        if self.deployed and any(not origin.startswith("https://") for origin in self.cors_origins):
            raise ValueError("Deployed environments require https CORS origins")
        return self
