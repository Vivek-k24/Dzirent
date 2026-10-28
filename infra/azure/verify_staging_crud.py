"""Bounded staging-only SQL CRUD plus HTTPS reads; creates no user/account/privilege.

Two phases leave one uniquely owned nonidentity reference probe across a deliberate
API restart, then remove only that row. Never runs fixtures, truncation or migrations.
Uses the app role's EXISTING privileges; refuses if those do not permit the probe.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import psycopg
import requests
from dotenv import dotenv_values
from psycopg import sql
from sqlalchemy.engine import make_url

logging.disable(logging.CRITICAL)
API = "https://dzirent-api-staging-4265.azurewebsites.net/api/v1"
DATABASE = "dzirent_staging"
HOST = "dzirent-pg17-ncus-4265.postgres.database.azure.com"


class Stop(Exception):
    pass


def require(ok: object, reason: str) -> None:
    if not ok:
        raise Stop(reason)


def connection_parameters(path: Path) -> dict:
    url = make_url(
        dotenv_values(path, interpolate=False).get("DZIRENT_DATABASE_URL", "")
    )
    ca = Path(os.environ["APPDATA"]) / "postgresql/azure-postgres-roots.pem"
    require(
        url.drivername in {"postgresql", "postgresql+psycopg"}
        and url.host == HOST
        and url.database == DATABASE
        and url.username == "dzirent_app"
        and url.port in {None, 5432}
        and url.query.get("sslmode") == "verify-full"
        and Path(url.query.get("sslrootcert", "")).resolve() == ca.resolve()
        and set(url.query) <= {"sslmode", "sslrootcert", "connect_timeout"},
        "exact_app_staging_tls_guard",
    )
    return {
        "host": HOST,
        "port": 5432,
        "dbname": DATABASE,
        "user": "dzirent_app",
        "password": url.password,
        "sslmode": "verify-full",
        "sslrootcert": str(ca),
        "connect_timeout": 5,
        "options": "-c statement_timeout=5000 -c lock_timeout=2000",
        "application_name": "dzirent-stage3-owned-reference-probe",
    }


def counts(connection) -> dict[str, int]:
    # Runtime intentionally cannot read the admin event trail. Keep that boundary.
    tables = connection.execute(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relkind IN ('r','p') "
        "AND (has_table_privilege(c.oid,'SELECT') OR has_any_column_privilege(c.oid,'SELECT')) "
        "ORDER BY c.relname"
    ).fetchall()
    return {
        name: connection.execute(
            sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(name))
        ).fetchone()[0]
        for (name,) in tables
    }


def api_brand(identifier: str) -> dict | None:
    response = requests.get(
        API + "/catalog/facets", timeout=(5, 12), allow_redirects=False
    )
    require(response.status_code == 200, "hosted_facets_unavailable")
    return next(
        (row for row in response.json()["brands"] if str(row["id"]) == identifier), None
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--azure-input", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument(
        "--phase", choices=["create-update", "verify-delete"], required=True
    )
    parser.add_argument("--execute-owner-authorized-staging-probe", action="store_true")
    args = parser.parse_args()
    report: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "phase": args.phase,
        "accounts_created": False,
        "existing_rows_modified": False,
        "migrator_or_admin_used": False,
    }
    state = None
    try:
        require(
            args.execute_owner_authorized_staging_probe,
            "explicit_staging_probe_required",
        )
        parameters = connection_parameters(args.azure_input)
        ready = requests.get(
            API + "/health/ready", timeout=(5, 12), allow_redirects=False
        )
        require(ready.status_code == 200, "hosted_database_readiness_required")
        with psycopg.connect(**parameters) as connection:
            identity = connection.execute(
                "SELECT current_database(), current_user, current_setting('server_version')"
            ).fetchone()
            require(
                identity[0] == DATABASE
                and identity[1] == "dzirent_app"
                and identity[2].startswith("17."),
                "live_database_identity",
            )
            tls = connection.execute(
                "SELECT ssl,version,bits FROM pg_stat_ssl WHERE pid=pg_backend_pid()"
            ).fetchone()
            require(tls[0] and tls[1] in {"TLSv1.2", "TLSv1.3"}, "live_tls_required")
            require(
                connection.execute(
                    "SELECT version_num FROM alembic_version"
                ).fetchone()[0]
                == "0005_auth_email_outbox",
                "schema_revision_gate",
            )
            permissions = connection.execute(
                "SELECT has_table_privilege(current_user,'brands','INSERT'),has_table_privilege(current_user,'brands','SELECT'),has_table_privilege(current_user,'brands','UPDATE'),has_table_privilege(current_user,'brands','DELETE')"
            ).fetchone()
            require(
                all(permissions), "existing_probe_crud_permissions_required_no_grants"
            )
            report.update(
                runtime_role=True, verify_full=True, tls_version=tls[1], tls_bits=tls[2]
            )
            if args.phase == "create-update":
                require(not args.state.exists(), "existing_probe_state_preserved")
                before = counts(connection)
                require(
                    before["users"] == 0
                    and before["products"] == 0
                    and before["auth_credentials"] == 0,
                    "empty_isolated_staging_required",
                )
                identifier = str(uuid.uuid4())
                state = {
                    "id": identifier,
                    "normalized_name": "stage3-connectivity-" + identifier,
                    "created_label": "Staging connection probe",
                    "updated_label": "Staging connection probe updated",
                    "before_counts": before,
                    "created_at": datetime.now(UTC).isoformat(),
                }
                args.state.parent.mkdir(parents=True, exist_ok=True)
                with args.state.open("x") as stream:
                    json.dump(state, stream, indent=2)
                connection.execute(
                    "INSERT INTO brands(id,normalized_name,display_name) VALUES(%s,%s,%s)",
                    (identifier, state["normalized_name"], state["created_label"]),
                )
                connection.commit()
                report["sql_insert_committed"] = True
                row = api_brand(identifier)
                require(
                    row and row["label"] == state["created_label"],
                    "hosted_read_after_create",
                )
                report["hosted_read_after_create"] = True
                require(
                    connection.execute(
                        "UPDATE brands SET display_name=%s WHERE id=%s AND normalized_name=%s RETURNING id",
                        (state["updated_label"], identifier, state["normalized_name"]),
                    ).fetchone(),
                    "owned_update",
                )
                connection.commit()
                report["sql_update_committed"] = True
                row = api_brand(identifier)
                require(
                    row and row["label"] == state["updated_label"],
                    "hosted_read_after_update",
                )
                report["hosted_read_after_update"] = True
                report["status"] = "created_updated_awaiting_explicit_api_restart"
            else:
                require(args.state.is_file(), "owned_probe_state_required")
                state = json.loads(args.state.read_text())
                identifier = str(uuid.UUID(state["id"]))
                require(
                    state["normalized_name"] == "stage3-connectivity-" + identifier,
                    "owned_probe_identity",
                )
                row = api_brand(identifier)
                require(
                    row and row["label"] == state["updated_label"],
                    "hosted_persisted_read_required",
                )
                report["hosted_read_of_persisted_update"] = True
                require(
                    connection.execute(
                        "DELETE FROM brands WHERE id=%s AND normalized_name=%s RETURNING id",
                        (identifier, state["normalized_name"]),
                    ).fetchone(),
                    "owned_delete_only",
                )
                connection.commit()
                report["sql_delete_committed"] = True
                require(api_brand(identifier) is None, "hosted_delete_visible")
                require(
                    counts(connection) == state["before_counts"],
                    "runtime_readable_table_counts_restored",
                )
                report.update(
                    status="passed",
                    hosted_delete_visible=True,
                    runtime_readable_table_counts_restored=True,
                )
    except Exception as exc:  # noqa: BLE001 -- never expose credential-bearing driver/provider text
        report.update(
            status="blocked",
            error_type=type(exc).__name__,
            sqlstate=getattr(exc, "sqlstate", None),
        )
        if isinstance(exc, Stop):
            report["reason"] = str(exc)
        report["owned_probe_state_retained"] = args.state.exists()
    report["completed_at"] = datetime.now(UTC).isoformat()
    out = args.state.with_name(
        "crud-" + args.phase + "-" + datetime.now(UTC).strftime("%H%M%S") + ".json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 2 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
