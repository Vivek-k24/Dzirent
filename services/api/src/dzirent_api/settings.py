import json
from pathlib import Path
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MODES = json.loads((Path(__file__).resolve().parents[4] / "contracts/modes.json").read_text())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DZIRENT_", env_file=".env", extra="ignore", hide_input_in_errors=True
    )
    mode: Literal["demo", "connected"] = "demo"
    environment: Literal["local", "test", "staging", "production"] = "local"
    identity_mode: Literal["mock", "clerk"] = "mock"
    database_url: str = ""
    clerk_issuer: str = ""
    clerk_authorized_parties: list[str] = []
    cors_origins: list[str] = ["http://127.0.0.1:3000"]

    @model_validator(mode="after")
    def enforce_modes(self) -> Self:
        allowed = MODES["api_mock_identity_allowed_only"]
        if self.identity_mode == "mock" and (
            self.mode != allowed["mode"] or self.environment not in allowed["environment"]
        ):
            raise ValueError("Mock identity is restricted to explicit local/test demo mode")
        if self.mode == "connected" and (
            self.identity_mode != "clerk"
            or not self.database_url
            or not self.clerk_issuer
            or not self.clerk_authorized_parties
        ):
            raise ValueError(
                "Connected mode requires Clerk issuer/authorized parties and database URL"
            )
        if any("*" in origin for origin in self.cors_origins):
            raise ValueError("CORS origins must be exact")
        return self
