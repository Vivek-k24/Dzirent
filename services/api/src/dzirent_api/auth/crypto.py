"""General PartGraph primitives, adapted without its schemas, roles or async database wiring."""

import hashlib
import re
import secrets
from functools import lru_cache

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

# Explicit OWASP minimum Argon2id profile; tune only after the gated concurrency measurements.
_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, type=Type.ID)
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
EMAIL_PATTERN = re.compile(r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$")


def normalize_email(value: str) -> str:
    if not value.strip().isascii():
        raise ValueError("Use a valid ASCII email address.")
    email = value.strip().casefold()
    if not email.isascii() or len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Use a valid ASCII email address (maximum 254 characters).")
    local, domain = email.rsplit("@", 1)
    if len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local:
        raise ValueError("Use a valid email address.")
    if any(
        not label or len(label) > 63 or label.startswith("-") or label.endswith("-")
        for label in domain.split(".")
    ):
        raise ValueError("Use a valid email address.")
    return email


def hash_password(password: str) -> str:
    # Let Argon2 generate an independent random salt for every hash, including synthetic users.
    return _hasher.hash(password)


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    # Lazy so declaration/contract imports never execute password work. Both login paths call it.
    return hash_password(secrets.token_urlsafe(32))


def verify_password(encoded: str | None, password: str) -> bool:
    dummy = _dummy_hash()
    try:
        valid = _hasher.verify(encoded or dummy, password)
    except (VerificationError, InvalidHashError):
        return False
    return bool(valid and encoded is not None)


def needs_rehash(encoded: str) -> bool:
    return _hasher.check_needs_rehash(encoded)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
