from datetime import datetime
from typing import Literal

from pydantic import Field, SecretStr, field_validator

from ..models import CurrentUser, WireModel
from .crypto import normalize_email


class EmailInput(WireModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value: str) -> str:
        return normalize_email(value)


class RegistrationInput(EmailInput):
    display_name: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=12, max_length=128)


class LoginInput(EmailInput):
    password: SecretStr = Field(min_length=1, max_length=128)


class PasswordInput(WireModel):
    current_password: SecretStr = Field(min_length=1, max_length=128)


class PasswordChange(PasswordInput):
    new_password: SecretStr = Field(min_length=12, max_length=128)


class TokenInput(WireModel):
    token: SecretStr = Field(min_length=43, max_length=43)


class PasswordReset(TokenInput):
    new_password: SecretStr = Field(min_length=12, max_length=128)


class AuthNotice(WireModel):
    message: str = "If this account is eligible, instructions will be sent to its email address."


class CsrfChallenge(WireModel):
    csrf_token: str
    expires_in: int = 1800


class AuthSessionRead(WireModel):
    user: CurrentUser
    email_verified: bool
    synthetic: bool
    capabilities: list[Literal["operations:access"]]
    expires_at: datetime


class AdminAccess(WireModel):
    capability: Literal["operations:access"] = "operations:access"
    role: Literal["platform_admin"] = "platform_admin"
