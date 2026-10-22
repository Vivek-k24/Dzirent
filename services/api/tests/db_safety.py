"""Fail before connecting when a destructive test target is not explicitly disposable/local."""

import ipaddress
import os
import re
import socket

from sqlalchemy.engine import URL, make_url

from dzirent_api.db import normalize_url

SAFE_DATABASE = re.compile(r"^[a-z][a-z0-9_]{0,57}_test$")
LIBPQ_OVERRIDES = (
    "PGSERVICE",
    "PGSERVICEFILE",
    "PGHOST",
    "PGHOSTADDR",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGOPTIONS",
    "PGTARGETSESSIONATTRS",
)


def safe_test_url(value: str | URL) -> URL:
    try:
        parsed = make_url(normalize_url(value)) if isinstance(value, str) else value
    except Exception:
        raise ValueError("Invalid disposable test URL") from None
    if parsed.drivername != "postgresql+psycopg":
        raise ValueError("Tests require the PostgreSQL psycopg driver")
    if parsed.host not in {"127.0.0.1", "localhost"}:
        raise ValueError("Tests refuse non-loopback or multiple-host targets")
    database = parsed.database or ""
    if (
        not SAFE_DATABASE.fullmatch(database)
        or "staging" in database
        or {"prod", "production"} & set(database.split("_"))
    ):
        raise ValueError(
            "Tests require a safe disposable *_test identifier, never staging/production"
        )
    if (
        not parsed.username
        or not parsed.password
        or not parsed.port
        or not 1 <= parsed.port <= 65535
    ):
        raise ValueError("Tests require an explicit local port/login/password")
    if set(parsed.query) - {"sslmode"}:
        raise ValueError("Tests refuse service/address/database/query overrides")
    if parsed.query.get("sslmode", "disable") not in {
        "disable",
        "prefer",
        "require",
        "verify-ca",
        "verify-full",
    }:
        raise ValueError("Invalid TLS option")
    if any(os.environ.get(name) for name in LIBPQ_OVERRIDES):
        raise ValueError("Clear inherited libpq target/options overrides in the test process")
    if parsed.host == "localhost":
        addresses = socket.getaddrinfo("localhost", parsed.port, type=socket.SOCK_STREAM)
        if not addresses or any(
            not ipaddress.ip_address(item[4][0]).is_loopback for item in addresses
        ):
            raise ValueError("localhost must resolve exclusively to loopback addresses")
    return parsed
