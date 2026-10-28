"""Short-lived AES-256-GCM envelopes; keys live only in protected configuration."""

import base64
import json
import re
import secrets
from datetime import UTC, datetime
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import SecretStr

from ..errors import unavailable
from ..settings import Settings


def keyring(settings: Settings) -> dict[str, bytes]:
    try:
        source = settings.auth_outbox_keys.get_secret_value()
        values = json.loads(source)
        if not isinstance(values, dict) or not 1 <= len(values) <= 3:
            raise ValueError
        result = {}
        for name, value in values.items():
            if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", name):
                raise ValueError
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", value):
                raise ValueError
            raw = base64.urlsafe_b64decode(value + "=")
            if base64.urlsafe_b64encode(raw).decode().rstrip("=") != value:
                raise ValueError
            if value == settings.auth_csrf_key.get_secret_value():
                raise ValueError
            result[name] = raw
        if settings.auth_outbox_active_key_id not in result:
            raise ValueError
        return result
    except (ValueError, TypeError):
        raise unavailable("Email delivery encryption is not configured.") from None


def aad(
    *, job_id: UUID, token_id: UUID, user_id: UUID, purpose: str, expires_at: datetime, key_id: str
) -> bytes:
    return json.dumps(
        [
            "dzirent-mail-v1",
            str(job_id),
            str(token_id),
            str(user_id),
            purpose,
            expires_at.astimezone(UTC).isoformat(timespec="microseconds"),
            key_id,
        ],
        separators=(",", ":"),
    ).encode()


def seal(settings: Settings, payload: dict[str, str], associated: bytes) -> bytes:
    key = keyring(settings)[settings.auth_outbox_active_key_id]
    nonce = secrets.token_bytes(12)
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode()
    if len(raw) > 1800:
        raise ValueError("Invalid delivery payload")
    return b"\x01" + nonce + AESGCM(key).encrypt(nonce, raw, associated)


def unseal(
    settings: Settings, key_id: str, envelope: bytes, associated: bytes
) -> dict[str, SecretStr]:
    if not 30 <= len(envelope) <= 2048 or envelope[0] != 1:
        raise ValueError("Invalid delivery payload")
    raw = AESGCM(keyring(settings)[key_id]).decrypt(envelope[1:13], envelope[13:], associated)
    payload = json.loads(raw)
    if (
        not isinstance(payload, dict)
        or set(payload) != {"token", "recipient", "origin"}
        or any(not isinstance(value, str) for value in payload.values())
    ):
        raise ValueError("Invalid delivery payload")
    return {name: SecretStr(value) for name, value in payload.items()}
