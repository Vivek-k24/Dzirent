"""Explicit one-shot, read-only host diagnosis; never prints driver messages or secrets."""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from dzirent_api.db import create_db_engine
from dzirent_api.settings import Settings
from sqlalchemy import text

logging.disable(logging.CRITICAL)


def main() -> None:
    report: dict = {
        "observed_at": datetime.now(UTC).isoformat(),
        "read_only": True,
        "python_version": sys.version.split()[0],
        "database_connected": False,
    }
    engine = None
    try:
        settings = Settings(_env_file=None)
        report["mode"] = settings.mode
        report["identity_mode"] = settings.identity_mode
        report["email_backend"] = settings.auth_email_backend
        report["ca_exists"] = Path("/home/dzirent/azure-postgres-roots.pem").is_file()
        # Explicit diagnosis only, not a runtime service dependency. Sends no Dzirent data.
        try:
            with urllib.request.urlopen(
                "https://api.ipify.org?format=json", timeout=5
            ) as response:
                address = json.loads(response.read(1024))["ip"]
            if ipaddress.ip_address(address).is_global:
                report["observed_public_egress_ip"] = address
        except Exception as exc:  # noqa: BLE001 -- no transport/provider details in logs
            report["egress_observation_error"] = type(exc).__name__
        engine = create_db_engine(settings)
        if engine is None:
            raise RuntimeError("database_not_configured")
        with engine.connect() as connection:
            connection.execute(text("SET TRANSACTION READ ONLY"))
            row = connection.execute(
                text(
                    "SELECT current_database(), current_user, current_setting('server_version'), current_setting('transaction_read_only')"
                )
            ).one()
            tls = connection.execute(
                text(
                    "SELECT ssl, version, bits FROM pg_stat_ssl WHERE pid=pg_backend_pid()"
                )
            ).one()
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
            report.update(
                database_connected=True,
                correct_database=row[0] == "dzirent_staging",
                runtime_role=row[1] == "dzirent_app",
                postgres_version=row[2],
                transaction_read_only=row[3] == "on",
                tls=bool(tls[0]),
                tls_version=tls[1],
                tls_bits=tls[2],
                schema_revision=revision,
            )
    except Exception as exc:  # noqa: BLE001 -- only coarse classification leaves the process
        original = getattr(exc, "orig", exc)
        message = str(original).lower()  # In-memory classification only; never logged.
        report.update(
            error_type=type(original).__name__,
            sqlstate=getattr(original, "sqlstate", None),
            error_flags={
                name: token in message
                for name, token in {
                    "timeout": "timeout",
                    "dns": "could not translate host name",
                    "certificate": "certificate verify failed",
                    "ca_file": "root certificate file",
                    "password": "password authentication failed",
                    "network_policy": "pg_hba",
                    "permission": "permission denied",
                }.items()
            },
        )
    finally:
        if engine is not None:
            engine.dispose()
        # No raw environment, connection URL, key, token or driver text is persisted.
        output = Path("/home/LogFiles/dzirent-connectivity-check.json")
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            json.dump(report, stream, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        print(
            json.dumps(
                {
                    "event": "staging_connectivity_diagnostic",
                    "database_connected": report["database_connected"],
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
