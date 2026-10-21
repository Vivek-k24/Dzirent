"""Bounded existing-RDS inspection. Defaults to control-plane/DNS reads only.

Private configuration and evidence stay under ignored .local. Database probes
require explicit connection-cost approval and execute only bundled read-only SQL.
AWS credentials use the existing CLI profile; IAM DB tokens remain in memory.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
from urllib.request import HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / ".local"
SQL = ROOT / "inspect.sql"
READS = {
    ("sts", "get-caller-identity"),
    ("rds", "describe-db-clusters"),
    ("rds", "describe-db-instances"),
}


class InspectionError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def local_path(value):
    path = (ROOT / value).resolve()
    if path == LOCAL.resolve() or not path.is_relative_to(LOCAL.resolve()):
        raise argparse.ArgumentTypeError(
            "Use a child path under ignored infra/aws/.local."
        )
    return path


def save(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def error_category(stderr):
    match = re.search(r"An error occurred \(([A-Za-z0-9_.-]+)\)", stderr)
    if match:
        return match.group(1)
    text = stderr.lower()
    for fragments, category in (
        (
            ("certificate verify failed", "root certificate", "does not match host"),
            "TlsVerificationFailed",
        ),
        (("timeout expired", "timed out"), "ConnectionTimeout"),
        (("connection refused", "no route to host"), "NetworkConnectionFailed"),
        (
            (
                "pam authentication failed",
                "password authentication failed",
                "iam authentication",
            ),
            "IamDatabaseAuthenticationFailed",
        ),
        (("permission denied", "not permitted"), "DatabasePermissionDenied"),
        (
            ("unable to locate credentials", "sso session"),
            "ExistingCredentialUnavailable",
        ),
    ):
        if any(fragment in text for fragment in fragments):
            return category
    return "CommandFailed"


def config(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not re.fullmatch(r"\d{12}", data.get("expected_account", "")):
        raise InspectionError("InvalidPrivateAccountConfiguration")
    if not re.fullmatch(r"[a-z]{2}-[a-z]+-\d", data.get("region", "")):
        raise InspectionError("InvalidPrivateRegionConfiguration")
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,62}", data.get("cluster_identifier", "")):
        raise InspectionError("InvalidPrivateClusterConfiguration")
    for role in ("writer", "reader", "instance"):
        host = data.get(role, "")
        if (
            not re.fullmatch(r"[a-z0-9.-]+\.rds\.amazonaws\.com", host)
            or f".{data['region']}." not in host
        ):
            raise InspectionError("InvalidPrivateEndpointConfiguration")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", data.get("database", "")):
        raise InspectionError("InvalidPrivateDatabaseConfiguration")
    return data


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise InspectionError("CertificateDownloadRedirectRejected")


class Inspector:
    def __init__(self, args):
        self.args, self.cfg = args, config(args.config)
        self.deadline = time.monotonic() + args.timeout - 3
        self.env = os.environ.copy()
        self.env.update(
            AWS_PAGER="",
            AWS_CLI_AUTO_PROMPT="off",
            AWS_EC2_METADATA_DISABLED="true",
            AWS_MAX_ATTEMPTS="1",
        )
        self.raw, self.calls = {}, 0
        self.report = {
            "started_at": now(),
            "status": "running",
            "database_writes": 0,
            "tool_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "sql_sha256": hashlib.sha256(SQL.read_bytes()).hexdigest(),
            "sections": {},
            "connection_requested": args.connect,
            "bounds": {
                "wall_seconds": args.timeout,
                "cli_calls_max": 12,
                "sql_sessions_max": 2,
                "sql_statement_ms": 5000,
            },
        }

    def persist(self):
        self.report["cli_calls"] = self.calls
        save(self.args.output_dir / "raw.private.json", self.raw)
        save(self.args.output_dir / "findings.json", self.report)

    def command(self, argv, env=None, seconds=25):
        remaining = self.deadline - time.monotonic()
        if remaining < 1:
            raise InspectionError("TimeBudgetExhausted")
        try:
            result = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                env=env or self.env,
                timeout=min(seconds, remaining),
                stdin=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired as error:
            raise InspectionError("BoundedCommandTimeout") from error
        if result.returncode:
            # Error messages may contain infrastructure IDs or credentials; never serialize them.
            raise InspectionError(error_category(result.stderr))
        return result.stdout

    def aws(self, service, operation, arguments, token=False):
        if (service, operation) not in READS and not (
            token and service == "rds" and operation == "generate-db-auth-token"
        ):
            raise InspectionError("ReadOnlyOperationGuard")
        if self.calls >= 12:
            raise InspectionError("RequestBudgetExhausted")
        self.calls += 1
        args = [
            shutil.which("aws") or "aws",
            service,
            operation,
            *arguments,
            "--region",
            self.cfg["region"],
            "--no-cli-pager",
            "--cli-connect-timeout",
            "5",
            "--cli-read-timeout",
            "10",
        ]
        if self.cfg.get("profile"):
            args += ["--profile", self.cfg["profile"]]
        if not token:
            args += [
                "--endpoint-url",
                f"https://{service}.{self.cfg['region']}.amazonaws.com",
                "--output",
                "json",
                "--no-paginate",
            ]
        value = self.command(args)
        return value.strip() if token else json.loads(value)

    def section(self, name, action):
        self.report["sections"][name] = {"status": "running", "observed_at": now()}
        self.persist()
        try:
            result = action()
            self.report["sections"][name].update(status="verified", data=result)
        except Exception as error:
            code = (
                str(error)
                if isinstance(error, InspectionError)
                else type(error).__name__
            )
            self.report["sections"][name].update(status="failed", error=code)
        self.persist()

    def identity(self):
        body = self.aws("sts", "get-caller-identity", [])
        if body.get("Account") != self.cfg["expected_account"]:
            raise InspectionError("ExpectedAccountMismatch")
        self.raw["identity"] = body
        return {"authenticated": True, "expected_account_match": True}

    def metadata(self):
        body = self.aws(
            "rds",
            "describe-db-clusters",
            ["--db-cluster-identifier", self.cfg["cluster_identifier"]],
        )
        rows = body.get("DBClusters", [])
        if len(rows) != 1:
            raise InspectionError("UnexpectedClusterCount")
        cluster = rows[0]
        arn = cluster.get("DBClusterArn", "").split(":")
        if (
            len(arn) < 6
            or arn[3] != self.cfg["region"]
            or arn[4] != self.cfg["expected_account"]
            or cluster.get("Endpoint") != self.cfg["writer"]
            or cluster.get("ReaderEndpoint") != self.cfg["reader"]
        ):
            raise InspectionError("ClusterAccountRegionEndpointMismatch")
        self.raw["cluster"] = cluster
        self.instances = []
        members = cluster.get("DBClusterMembers", [])
        if not 1 <= len(members) <= 4:
            raise InspectionError("ClusterMemberBoundExceeded")
        for member in members:
            data = self.aws(
                "rds",
                "describe-db-instances",
                ["--db-instance-identifier", member["DBInstanceIdentifier"]],
            )
            found = data.get("DBInstances", [])
            if len(found) != 1:
                raise InspectionError("UnexpectedInstanceCount")
            self.instances.append(found[0])
        self.raw["instances"] = self.instances
        if not any(
            row.get("Endpoint", {}).get("Address") == self.cfg["instance"]
            for row in self.instances
        ):
            raise InspectionError("ExpectedInstanceEndpointMismatch")
        encryption = cluster.get("StorageEncryptionType") or (
            "sse-kms" if cluster.get("StorageEncrypted") else "unknown"
        )
        return {
            "target_matches": True,
            "engine": cluster.get("Engine"),
            "engine_version": cluster.get("EngineVersion"),
            "state": cluster.get("Status"),
            "storage_encryption_type": encryption,
            "legacy_storage_encrypted": cluster.get("StorageEncrypted"),
            "vpc_networking_enabled": cluster.get("VPCNetworkingEnabled"),
            "internet_gateway_enabled": cluster.get("InternetAccessGatewayEnabled"),
            "iam_database_authentication": cluster.get(
                "IAMDatabaseAuthenticationEnabled"
            ),
            "scaling": cluster.get("ServerlessV2ScalingConfiguration"),
            "backup_days": cluster.get("BackupRetentionPeriod"),
            "deletion_protection": cluster.get("DeletionProtection"),
            "member_count": len(members),
            "writer_count": sum(bool(row.get("IsClusterWriter")) for row in members),
            "instances": [
                {
                    key: row.get(key)
                    for key in (
                        "DBInstanceClass",
                        "DBInstanceStatus",
                        "PubliclyAccessible",
                        "StorageEncryptionType",
                    )
                }
                for row in self.instances
            ],
            "production_ownership_and_write_authority": "unconfirmed",
        }

    def dns(self, role):
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(
                self.cfg[role], 5432, type=socket.SOCK_STREAM
            )
        }
        return {
            "resolved": True,
            "address_count": len(addresses),
            "all_addresses_public": all(
                ipaddress.ip_address(item).is_global for item in addresses
            ),
        }

    def trust_bundle(self):
        path = self.args.output_dir / "amazon-root-ca1.pem"
        with build_opener(NoRedirect()).open(
            "https://www.amazontrust.com/repository/AmazonRootCA1.pem", timeout=10
        ) as response:
            pem = response.read(16_385)
        if len(pem) > 16_384:
            raise InspectionError("CertificateResponseSizeLimit")
        ssl.PEM_cert_to_DER_cert(pem.decode("ascii"))
        path.write_bytes(pem)
        return path

    def probe(self, role, trust):
        cluster = self.raw["cluster"]
        token = self.aws(
            "rds",
            "generate-db-auth-token",
            [
                "--hostname",
                self.cfg[role],
                "--port",
                "5432",
                "--username",
                cluster["MasterUsername"],
            ],
            token=True,
        )
        child = self.env.copy()
        # No DSN/token in argv, logs or disk. libpq receives a memory-only child environment.
        for key in list(child):
            if key.startswith("PG"):
                child.pop(key)
        child.update(
            PGHOST=self.cfg[role],
            PGPORT="5432",
            PGDATABASE=self.cfg["database"],
            PGUSER=cluster["MasterUsername"],
            PGPASSWORD=token,
            PGSSLMODE="verify-full",
            PGSSLROOTCERT=str(trust),
            PGSSLMINPROTOCOLVERSION="TLSv1.2",
            PGCONNECT_TIMEOUT="40",
            PGAPPNAME="dzirent-readonly-preflight",
            PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=10000",
        )
        try:
            value = self.command(
                [
                    shutil.which("psql") or "psql",
                    "-X",
                    "-w",
                    "-qAt",
                    "--set",
                    "ON_ERROR_STOP=1",
                    "--file",
                    str(SQL),
                ],
                env=child,
                seconds=50,
            )
        finally:
            child.pop("PGPASSWORD", None)
            token = None
        body = json.loads(value)
        self.raw["sql-" + role] = body
        if body.get("transaction_read_only") != "on" or not body.get("tls", {}).get(
            "ssl"
        ):
            raise InspectionError("ReadOnlyOrTlsVerificationFailed")
        return {
            "authenticated": True,
            "database_matches": body.get("current_database") == self.cfg["database"],
            "server_version_num": body.get("server_version_num"),
            "in_recovery": body.get("in_recovery"),
            "read_only": True,
            "tls": body.get("tls"),
            "role_flags": body.get("role_flags"),
            "database_connect": body.get("database_connect"),
            "database_create_schema": body.get("database_create_schema"),
            "staging_database_exists": body.get("staging_database_exists"),
            "staging_roles_present": body.get("staging_roles_present"),
            "user_relation_count": body.get("user_relation_count"),
            "force_ssl": body.get("force_ssl"),
        }

    def run(self):
        try:
            self.section("identity", self.identity)
            if self.report["sections"]["identity"]["status"] != "verified":
                return 2
            self.section("metadata", self.metadata)
            if self.report["sections"]["metadata"]["status"] != "verified":
                return 2
            for role in ("writer", "reader", "instance"):
                self.section("dns-" + role, lambda role=role: self.dns(role))
            if not self.args.connect:
                self.report["connection_status"] = "not_attempted_inventory_only"
                return 2
            cluster = self.raw["cluster"]
            if not self.args.allow_resume_cost:
                raise InspectionError("ConnectionCostApprovalRequired")
            if (
                cluster.get("Engine") != "aurora-postgresql"
                or cluster.get("Status") != "available"
                or not cluster.get("InternetAccessGatewayEnabled")
                or not cluster.get("IAMDatabaseAuthenticationEnabled")
            ):
                raise InspectionError("SupportedExpressIamConnectionNotVerified")
            trust = self.trust_bundle()
            for role in ("writer", "reader"):
                self.section("sql-" + role, lambda role=role: self.probe(role, trust))
            self.report["connection_status"] = (
                "verified"
                if all(
                    self.report["sections"]["sql-" + role]["status"] == "verified"
                    for role in ("writer", "reader")
                )
                else "partial_or_failed"
            )
            return 0 if self.report["connection_status"] == "verified" else 2
        except InspectionError as error:
            self.report["stopped_reason"] = str(error)
            return 2
        finally:
            self.report.update(
                status="read_only_evidence_only",
                completed_at=now(),
                staging_operational=False,
            )
            self.persist()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=local_path, required=True)
    parser.add_argument("--output-dir", type=local_path, required=True)
    parser.add_argument("--connect", action="store_true")
    parser.add_argument(
        "--allow-resume-cost",
        action="store_true",
        help="Operator has explicit permission for connection-triggered compute; never grants DB-write approval.",
    )
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not 30 <= args.timeout <= 300:
        parser.error("timeout must be 30-300 seconds")
    if args._worker:
        try:
            return Inspector(args).run()
        except Exception as error:
            save(
                args.output_dir / "failure.json",
                {"status": "failed", "error_type": type(error).__name__},
            )
            return 2
    if args.output_dir.exists():
        parser.error(
            "choose a new evidence directory; existing runs are never overwritten"
        )
    args.output_dir.mkdir(parents=True)
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    process = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:], "--_worker"],
        creationflags=flags,
    )
    try:
        result = process.wait(timeout=args.timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        process.kill()
        process.wait(timeout=5)
        save(
            args.output_dir / "timeout.json",
            {
                "status": "blocked",
                "reason": "wall_budget_or_interruption",
                "staging_operational": False,
            },
        )
        result = 2
    print(
        "Inspection finished; review ignored findings. No staging deployment or DB write is performed."
    )
    return result


if __name__ == "__main__":
    raise SystemExit(main())
