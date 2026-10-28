"""Allowlisted staging App Settings; secrets never enter ARM template history or output.

Run with the existing API and Azure tooling dependencies, never application runtime.
Reads only the two protected local input files supplied by the owner. Administrator
and migration values are not selected, and SMTP is unconditionally disabled.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import ssl
import sys
from datetime import UTC, datetime
from pathlib import Path

import requests
from azure.identity import VisualStudioCodeCredential
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services/api/src"))
from dzirent_api.auth.mail_crypto import keyring
from dzirent_api.settings import Settings

logging.disable(logging.CRITICAL)
SITE = "dzirent-api-staging-4265"
ORIGIN = "https://" + SITE + ".azurewebsites.net"
HOST = "dzirent-pg17-ncus-4265.postgres.database.azure.com"
LINUX_CA = "/home/dzirent/azure-postgres-roots.pem"
PLATFORM = {
    "SCM_DO_BUILD_DURING_DEPLOYMENT": "true",
    "ENABLE_ORYX_BUILD": "true",
    "PYTHONUNBUFFERED": "1",
    "PYTHONDONTWRITEBYTECODE": "1",
    "FORWARDED_ALLOW_IPS": "127.0.0.1",
    "WEBSITE_HTTPLOGGING_RETENTION_DAYS": "1",
}


class Stop(Exception):
    pass


def require(ok: object, reason: str) -> None:
    if not ok:
        raise Stop(reason)


def assemble(owner_path: Path, azure_path: Path) -> dict[str, str]:
    for path in (owner_path, azure_path):
        require(
            path.is_file() and not path.is_relative_to(ROOT),
            "protected_external_input_required",
        )
    # Parse locally without interpolation; select only these four runtime inputs.
    owner = dotenv_values(owner_path, interpolate=False)
    azure = dotenv_values(azure_path, interpolate=False)
    url = make_url(azure.get("DZIRENT_DATABASE_URL", ""))
    ca = Path(os.environ["APPDATA"]) / "postgresql/azure-postgres-roots.pem"
    require(
        url.drivername in {"postgresql", "postgresql+psycopg"}
        and url.host == HOST
        and url.port in {None, 5432}
        and url.database == "dzirent_staging"
        and url.username == "dzirent_app"
        and url.password
        and url.query.get("sslmode") == "verify-full"
        and Path(url.query.get("sslrootcert", "")).resolve() == ca.resolve()
        and set(url.query) <= {"sslmode", "sslrootcert", "connect_timeout"},
        "runtime_url_tls_role_guard",
    )
    ssl.create_default_context(cafile=str(ca))
    query = dict(url.query)
    query["sslrootcert"] = LINUX_CA
    linux_url = url.set(query=query).render_as_string(hide_password=False)
    require(
        len(owner.get("DZIRENT_AUTH_CSRF_KEY", "")) >= 32, "private_csrf_key_required"
    )
    fields = {name: field.default for name, field in Settings.model_fields.items()}
    fields.update(
        mode="connected",
        environment="staging",
        identity_mode="native",
        database_url=linux_url,
        db_pool_size=2,
        cors_origins=[],
        auth_web_origin=ORIGIN,
        auth_csrf_key=owner["DZIRENT_AUTH_CSRF_KEY"],
        auth_email_backend="disabled",
        auth_email_worker_enabled=False,
        auth_outbox_active_key_id=owner.get("DZIRENT_AUTH_OUTBOX_ACTIVE_KEY_ID", ""),
        auth_outbox_keys=owner.get("DZIRENT_AUTH_OUTBOX_KEYS", ""),
    )
    settings = Settings(_env_file=None, **fields)
    require(bool(keyring(settings)), "private_outbox_keyring_required")
    values: dict[str, str] = {}
    for name in Settings.model_fields:
        value = getattr(settings, name)
        if hasattr(value, "get_secret_value"):
            value = value.get_secret_value()
        values["DZIRENT_" + name.upper()] = (
            json.dumps(value, separators=(",", ":"))
            if isinstance(value, (list, bool))
            else str(value)
        )
    # Missing SMTP credentials are absent, not copied from an unverified provider intake.
    values.pop("DZIRENT_AUTH_SMTP_USER")
    values.pop("DZIRENT_AUTH_SMTP_PASSWORD")
    policy = json.loads((Path(__file__).parent / "environment-policy.json").read_text())
    allowed = set(policy["azureRuntimeSecrets"] + policy["azureRuntimeConfiguration"])
    require(set(values) <= allowed, "runtime_allowlist_guard")
    require(
        not set(values)
        & set(policy["localOnly"] + policy["restrictedMigrationCredentials"]),
        "local_migration_exclusion_guard",
    )
    values.update(PLATFORM)
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subscription", required=True)
    parser.add_argument("--owner-input", type=Path, required=True)
    parser.add_argument("--azure-input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    report: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "app_settings_written": False,
        "admin_or_migrator_uploaded": False,
        "smtp_enabled": False,
        "github_secrets_created": False,
        "database_network_changed": False,
    }
    phase = "local_validation"
    try:
        require(not args.output.exists(), "existing_evidence_preserved")
        values = assemble(args.owner_input.resolve(), args.azure_input.resolve())
        report["runtime_names"] = sorted(k for k in values if k.startswith("DZIRENT_"))
        report["platform_names"] = sorted(PLATFORM)
        report["settings_loader_validation"] = True
        if args.execute:
            phase = "verify_host"
            base = f"https://management.azure.com/subscriptions/{args.subscription}/resourceGroups/rg-dzirent-staging-scus/providers/Microsoft.Web/sites/{SITE}"
            with VisualStudioCodeCredential(
                connection_timeout=5, read_timeout=10
            ) as credential:
                token = credential.get_token("https://management.azure.com/.default")
                session = requests.Session()
                session.headers.update(Authorization="Bearer " + token.token)

                def request(method, suffix, body=None):
                    response = session.request(
                        method,
                        base + suffix,
                        params={"api-version": "2025-03-01"},
                        json=body,
                        timeout=(5, 30),
                        allow_redirects=False,
                    )
                    require(
                        response.status_code in {200, 201}, "app_service_request_failed"
                    )
                    return response.json()

                site = request("GET", "")
                require(
                    site.get("name") == SITE
                    and site.get("tags", {}).get("issue") == "77"
                    and site.get("tags", {}).get("environment") == "staging"
                    and site.get("properties", {}).get("httpsOnly") is True
                    and site["properties"]["defaultHostName"]
                    == ORIGIN.removeprefix("https://"),
                    "actual_staging_host_guard",
                )
                existing = request("POST", "/config/appsettings/list")["properties"]
                require(
                    set(existing) <= set(values),
                    "unexpected_existing_settings_preserved",
                )
                phase = "set_allowlisted_runtime"
                request("PUT", "/config/appsettings", {"properties": values})
                report["app_settings_written"] = True
                saved = request("POST", "/config/appsettings/list")["properties"]
                require(saved == values, "saved_settings_mismatch")
                report["saved_names_and_values_verified_privately"] = True
                phase = "redacted_filesystem_logging"
                request(
                    "PUT",
                    "/config/logs",
                    {
                        "properties": {
                            "applicationLogs": {"fileSystem": {"level": "Information"}},
                            "httpLogs": {"fileSystem": {"enabled": False}},
                            "failedRequestsTracing": {"enabled": False},
                            "detailedErrorMessages": {"enabled": False},
                        }
                    },
                )
                report["logging_configured"] = True
        report["status"] = "configured" if args.execute else "validated_no_writes"
    except Exception as exc:  # noqa: BLE001 -- validation/driver errors can contain private values
        report.update(status="blocked", phase=phase, error_type=type(exc).__name__)
        if isinstance(exc, Stop):
            report["reason"] = str(exc)
    report["completed_at"] = datetime.now(UTC).isoformat()
    if not args.output.exists():
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 2 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
