"""One approved-size Azure Students staging PostgreSQL allocation attempt.

Reuses the existing VS Code credential and discovery helpers. Default is a local
plan only. No billing, subscription, IAM, network-rule or existing-resource edits.
All private state and credentials remain below ignored infra/azure/.local.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlencode, urlsplit

from azure.core.pipeline.transport import RequestsTransport
from azure.core.rest import HttpRequest
from azure.mgmt.resource.resources import ResourceManagementClient

import discover as az

REGION = "southcentralus"
GROUP = "rg-dzirent-staging-scus"
PG_API = "2025-08-01"
PREFIX = f"/subscriptions/{az.TARGET}"
PROVIDER = PREFIX + "/providers/Microsoft.DBforPostgreSQL"
ATTEMPT = az.LOCAL / "issue-25-postgres-attempt.private.json"
TOOL_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
CAPABILITIES = PROVIDER + f"/locations/{REGION}/capabilities"


def utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def require(condition, code):
    if not condition:
        raise az.DiscoveryError(code)


def verify_evidence(preflight, discovery):
    """Verify current amounts privately, never return or print financial values."""
    evidence = json.loads((preflight / "findings.json").read_text())
    inventory = json.loads((discovery / "findings.json").read_text())
    current = datetime.now(timezone.utc)
    for body in (evidence, inventory):
        require(
            timedelta(0) <= current - utc(body["completed_at"]) < timedelta(minutes=30),
            "fresh_evidence_required",
        )
        sub = body["sections"]["subscription"]["data"]
        require(
            sub["subscription_id"] == az.TARGET
            and sub["state"] == "Enabled"
            and sub["token_tenant_matches"]
            and sub["offer_quota_id"] == "AzureForStudents_2018-01-01"
            and sub["spending_limit"].lower() == "on",
            "students_subscription_gate_failed",
        )
    sections = evidence["sections"]
    bill = sections["billing"]["data"]
    balance = sections["credit-balance"]["data"]
    cash = balance["balanceSummary"]["currentBalance"]
    pending = balance["pendingEligibleCharges"]
    require(
        bill["subscriptionBillingStatus"].lower() == "active"
        and bill["subscriptionBillingType"].lower() == "free"
        and bill["billingProfileSpendingLimit"].lower() == "on"
        and balance["isEstimatedBalance"] is False
        and cash["currency"] == pending["currency"] == "USD"
        and float(cash["value"]) - float(pending["value"]) >= 20,
        "current_credit_or_spending_limit_gate_failed",
    )
    review_end = current + timedelta(days=7)
    require(
        any(
            item["status"].lower() == "active"
            and utc(item["startDate"]) <= current
            and utc(item["endDate"]) > review_end
            for item in bill["billingProfileSpendingLimitDetails"]
        )
        and any(
            utc(item["startDate"]) <= current
            and utc(item["expirationDate"]) > review_end
            for item in sections["credit-lots"]["data"]["lots"]
        ),
        "credit_expiry_gate_failed",
    )
    for key in ("inventory.resource_groups", "inventory.postgresql"):
        row = inventory["sections"][key]
        require(row["status"] == "verified", "complete_inventory_required")
    require(
        inventory["sections"]["inventory.resource_groups"]["data"]["related_count"]
        == 0,
        "existing_dzirent_group_requires_reviewed_reuse",
    )
    require(
        inventory["sections"]["inventory.postgresql"]["data"]["scanned_count"] == 0,
        "existing_postgres_requires_reviewed_reuse",
    )
    require(
        sections["denyAssignments"]["status"] == "verified"
        and sections["denyAssignments"]["data"]["scanned_count"] == 0,
        "deny_assignment_review_required",
    )
    grants = {
        row["action"]: row["grant_pattern_present"]
        for row in sections["hosting-permissions"]["data"]["actions"]
    }
    require(
        all(
            grants.get(action) is True
            for action in (
                az.ACTIONS[0],
                az.ACTIONS[1],
                "Microsoft.DBforPostgreSQL/register/action",
            )
        ),
        "creation_grant_evidence_missing",
    )
    return inventory["sections"]["subscription"]["data"]["tenant_fingerprint"]


class ScopedTransport(RequestsTransport):
    def __init__(self, group_path, server_path, deadline):
        super().__init__(connection_timeout=5, read_timeout=20)
        self.deadline, self.calls = deadline, 0
        self.allowed = {
            "GET": {
                group_path.lower(),
                server_path.lower(),
                PROVIDER.lower(),
                CAPABILITIES.lower(),
            },
            "PUT": {group_path.lower(), server_path.lower()},
            "POST": {(PROVIDER + "/register").lower()},
        }

    def send(self, request, **kwargs):
        url = urlsplit(request.url)
        require(
            url.scheme == "https"
            and url.netloc == "management.azure.com"
            and url.path.lower() in self.allowed.get(request.method.upper(), set()),
            "scoped_provisioning_endpoint_guard",
        )
        remaining = self.deadline - time.monotonic()
        require(remaining > 1 and self.calls < 80, "request_or_time_budget_exhausted")
        self.calls += 1
        kwargs.update(
            connection_timeout=min(5, remaining), read_timeout=min(20, remaining)
        )
        return super().send(request, **kwargs)


class Provisioner:
    def __init__(self, args, state, token):
        self.args, self.state = args, state
        self.group = PREFIX + "/resourceGroups/" + GROUP
        self.server = (
            self.group
            + "/providers/Microsoft.DBforPostgreSQL/flexibleServers/"
            + state["server_name"]
        )
        self.transport = ScopedTransport(
            self.group, self.server, time.monotonic() + 300
        )
        self.client = ResourceManagementClient(
            az.MemoryCredential(token),
            az.TARGET,
            transport=self.transport,
            retry_total=0,
            retry_connect=0,
            retry_read=0,
            retry_status=0,
            logging_enable=False,
        )

    def persist(self):
        self.state["updated_at"] = az.now()
        az.write_json(self.args.output_dir / "state.private.json", self.state)

    def request(self, method, path, api, body=None):
        url = az.ARM + path + "?" + urlencode({"api-version": api})
        request = (
            HttpRequest(method, url)
            if body is None
            else HttpRequest(method, url, json=body)
        )
        response = self.client.send_request(request, logging_enable=False)
        try:
            payload = response.json() if response.content else {}
            status = response.status_code
            record = {
                "method": method,
                "resource_ref": az.fingerprint(path),
                "status": status,
                "at": az.now(),
                "tool_sha256": TOOL_SHA256,
            }
            if status >= 400:
                record["error_code"] = payload.get("error", {}).get(
                    "code", "unknown_error"
                )
                az.write_json(self.args.output_dir / "last-error.private.json", payload)
            self.state["requests"].append(record)
            self.persist()
            return status, payload
        finally:
            response.close()

    def accepted(self, result):
        status, payload = result
        if status not in (200, 201, 202):
            raise az.DiscoveryError(
                payload.get("error", {}).get("code", "unexpected_status"), status
            )
        return payload

    def apply(self):
        require(
            not self.state["postgres_put_attempted"],
            "postgres_attempt_already_recorded_use_status_only",
        )
        require(
            not ATTEMPT.exists(),
            "issue_allocation_attempt_already_recorded_owner_review_required",
        )
        provider = self.accepted(self.request("GET", PROVIDER, "2021-04-01"))
        if provider["registrationState"] != "Registered":
            if not self.state.get("registration_requested"):
                self.state["registration_requested"] = True
                self.persist()
                self.accepted(
                    self.request("POST", PROVIDER + "/register", "2021-04-01", {})
                )
            for _ in range(18):
                provider = self.accepted(self.request("GET", PROVIDER, "2021-04-01"))
                if provider["registrationState"] == "Registered":
                    break
                time.sleep(5)
            require(
                provider["registrationState"] == "Registered",
                "provider_registration_pending",
            )
        require(
            self.check_region() == 0,
            "post_registration_region_or_configuration_unavailable",
        )
        status, group = self.request("GET", self.group, "2021-04-01")
        if status == 404:
            require(
                not self.state.get("group_put_attempted"),
                "group_create_response_uncertain_stop",
            )
            self.state["group_put_attempted"] = True
            self.persist()
            group = self.accepted(
                self.request(
                    "PUT",
                    self.group,
                    "2021-04-01",
                    {"location": REGION, "tags": self.state["tags"]},
                )
            )
            self.state["group_created"] = True
            self.persist()
        else:
            self.accepted((status, group))
            require(
                self.state.get("group_created")
                and group.get("tags", {}).get("bootstrap-id") == self.state["nonce"],
                "existing_group_not_owned_by_this_run",
            )
        status, _ = self.request("GET", self.server, PG_API)
        require(status == 404, "server_already_exists_or_existence_unknown")
        private = json.loads(
            (self.args.output_dir / "credentials.private.json").read_text()
        )
        body = {
            "location": REGION,
            "tags": self.state["tags"],
            "sku": {"name": "Standard_B1ms", "tier": "Burstable"},
            "properties": {
                "createMode": "Create",
                "version": "17",
                "administratorLogin": private["administrator_login"],
                "administratorLoginPassword": private["administrator_password"],
                "authConfig": {
                    "activeDirectoryAuth": "Disabled",
                    "passwordAuth": "Enabled",
                },
                "storage": {
                    "storageSizeGB": 32,
                    "autoGrow": "Disabled",
                    "type": "Premium_LRS",
                    "tier": "P4",
                },
                "backup": {"backupRetentionDays": 7, "geoRedundantBackup": "Disabled"},
                "highAvailability": {"mode": "Disabled"},
                "network": {"publicNetworkAccess": "Enabled"},
                "dataEncryption": {"type": "SystemManaged"},
            },
        }
        self.state["postgres_put_attempted"] = True
        self.state["postgres_attempted_at"] = az.now()
        with ATTEMPT.open("x", encoding="utf-8") as marker:
            json.dump(
                {
                    "attempted_at": az.now(),
                    "state_file": str(self.args.output_dir / "state.private.json"),
                    "sku": "Standard_B1ms",
                    "region": REGION,
                    "version": "17",
                    "storage_gb": 32,
                },
                marker,
            )
        self.persist()  # Before sending: no automatic retry after an ambiguous response.
        self.accepted(self.request("PUT", self.server, PG_API, body))
        self.state["postgres_create_accepted"] = True
        self.persist()
        return self.status()

    def check_region(self):
        body = self.accepted(self.request("GET", CAPABILITIES, PG_API))
        az.write_json(self.args.output_dir / "region-capabilities.private.json", body)
        entries = body.get("value", [])
        restricted = any(
            feature.get("name") == "OfferRestricted"
            and feature.get("status") == "Enabled"
            for item in entries
            for feature in item.get("supportedFeatures", [])
        )
        explicitly_unrestricted = bool(entries) and all(
            any(
                feature.get("name") == "OfferRestricted"
                and feature.get("status") == "Disabled"
                for feature in item.get("supportedFeatures", [])
            )
            for item in entries
        )
        advertised = any(
            any(
                version.get("name") == "17"
                for version in item.get("supportedServerVersions", [])
            )
            and any(
                tier.get("name") == "Burstable"
                and any(
                    sku.get("name") == "Standard_B1ms"
                    for sku in tier.get("supportedServerSkus", [])
                )
                for tier in item.get("supportedServerEditions", [])
            )
            for item in entries
        )
        allowed = (
            explicitly_unrestricted
            and not body.get("nextLink")
            and not restricted
            and advertised
        )
        self.state["region_gate"] = {
            "observed_at": az.now(),
            "region": REGION,
            "offer_restricted": restricted,
            "pg17_b1ms_advertised": advertised,
            "explicitly_unrestricted": explicitly_unrestricted,
            "allowed": allowed,
            "tool_sha256": TOOL_SHA256,
        }
        self.persist()
        return 0 if allowed else 2

    def status(self):
        for _ in range(42):
            status, server = self.request("GET", self.server, PG_API)
            if status == 404:
                self.state["postgres_state"] = "not_found"
                self.persist()
                return 2
            self.accepted((status, server))
            az.write_json(self.args.output_dir / "server.private.json", server)
            props = server.get("properties", {})
            self.state["postgres_state"] = props.get("state", "unknown")
            self.persist()
            if props.get("state") == "Ready":
                require(
                    server["sku"]["name"] == "Standard_B1ms"
                    and props["version"] == "17"
                    and props["storage"]["storageSizeGB"] == 32,
                    "created_configuration_mismatch",
                )
                return 0
            require(
                props.get("state") not in ("Disabled", "Dropping", "Inaccessible"),
                "server_not_usable",
            )
            time.sleep(5)
        return 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=az.local_path, required=True)
    parser.add_argument("--preflight", type=az.local_path, required=True)
    parser.add_argument("--discovery", type=az.local_path, required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--status-only", action="store_true")
    mode.add_argument("--region-check-only", action="store_true")
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    state_file = args.output_dir / "state.private.json"
    if not state_file.exists():
        require(
            not args.status_only
            and not args.region_check_only
            and not args.output_dir.exists(),
            "new_plan_directory_required",
        )
        args.output_dir.mkdir(parents=True)
        nonce = secrets.token_hex(4)
        state = {
            "created_at": az.now(),
            "nonce": nonce,
            "server_name": f"pg-dzirent-stg-scus-{nonce}",
            "region": REGION,
            "tags": {
                "project": "dzirent",
                "environment": "staging",
                "managed-by": "codex-issue-25",
                "bootstrap-id": nonce,
                "review-after": (datetime.now(timezone.utc) + timedelta(days=7))
                .date()
                .isoformat(),
            },
            "postgres_put_attempted": False,
            "group_created": False,
            "requests": [],
            "staging_operational": False,
            "tool_sha256": TOOL_SHA256,
        }
        az.write_json(state_file, state)
        az.write_json(
            args.output_dir / "credentials.private.json",
            {
                "administrator_login": "dzirent_admin",
                "administrator_password": secrets.token_urlsafe(36) + "Aa9!",
            },
        )
    else:
        state = json.loads(state_file.read_text())
    require(
        bool(re.fullmatch(r"[a-f0-9]{8}", state["nonce"]))
        and state["server_name"] == f"pg-dzirent-stg-scus-{state['nonce']}"
        and state["region"] == REGION
        and state["tags"]["bootstrap-id"] == state["nonce"],
        "private_plan_target_mismatch",
    )
    if not args.apply and not args.status_only and not args.region_check_only:
        print(
            json.dumps(
                {
                    "status": "local_plan_only",
                    "region": REGION,
                    "version": "17",
                    "sku": "Standard_B1ms",
                    "storage_gb": 32,
                    "cloud_mutations_this_invocation": 0,
                }
            )
        )
        return 0
    expected_tenant = (
        verify_evidence(args.preflight, args.discovery) if args.apply else None
    )
    auth_args = argparse.Namespace(
        subscription=az.TARGET,
        credential="vscode",
        regions=[REGION],
        timeout=120,
        output_dir=args.output_dir / "identity",
    )
    report = {
        "tool_sha256": TOOL_SHA256,
        "authentication": {"status": "not_performed", "method": None, "attempts": []},
        "sections": {},
    }
    authenticated = az.authenticate(auth_args, report)
    require(bool(authenticated), "existing_vscode_authentication_unavailable")
    token, credential = authenticated
    d = az.Discovery(auth_args, report, {"responses": []}, token)
    provisioner = None
    try:
        sub = d.subscription(token)
        require(
            sub["spending_limit"].lower() == "on"
            and (not expected_tenant or sub["tenant_fingerprint"] == expected_tenant),
            "live_subscription_financial_or_tenant_gate_failed",
        )
        report["sections"]["subscription"] = {
            "status": "verified",
            "observed_at": az.now(),
            "data": sub,
        }
        provisioner = Provisioner(args, state, token)
        if args.region_check_only:
            result = provisioner.check_region()
            print(
                json.dumps(
                    {
                        "status": "region_check_only",
                        **state["region_gate"],
                        "staging_operational": False,
                        "cloud_mutations_this_invocation": 0,
                    }
                )
            )
            return result
        result = provisioner.apply() if args.apply else provisioner.status()
        print(
            json.dumps(
                {
                    "status": state.get("postgres_state", "attempted"),
                    "server_ready": result == 0,
                    "staging_operational": False,
                    "postgres_put_attempted": state["postgres_put_attempted"],
                    "group_created": state["group_created"],
                }
            )
        )
        return result
    finally:
        d.persist()
        d.client.close()
        credential.close()
        if provisioner:
            provisioner.client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(
            json.dumps(
                {
                    "status": "stopped",
                    "error_type": type(error).__name__,
                    "error_code": az.clean_text(
                        getattr(error, "code", "local_or_network_failure")
                    ),
                    "http_status": getattr(error, "status", None),
                    "automatic_retry": False,
                }
            )
        )
        raise SystemExit(2)
