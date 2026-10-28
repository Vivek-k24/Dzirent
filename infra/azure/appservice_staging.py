"""Create only the reviewed free Linux staging host; never changes SQL networking.

Uses the existing VS Code login. No secret inputs, App Settings writes, publication
credentials, subscription upgrades, role grants or production targets are accepted.
Default operation is inspection. Execute only within the owner's staging authorization.
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import re
import subprocess
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import requests
from azure.identity import VisualStudioCodeCredential

ARM = "https://management.azure.com"
API = "2025-03-01"
ROOT = Path(__file__).resolve().parents[2]
logging.disable(logging.CRITICAL)


class Stop(Exception):
    """Only fixed, credential-free reason codes are emitted."""


def require(condition: object, reason: str) -> None:
    if not condition:
        raise Stop(reason)


def financial_gate(path: Path) -> None:
    evidence = json.loads(path.read_text(encoding="utf-8-sig"))
    require(
        datetime.now(UTC) - datetime.fromisoformat(evidence["completed_at"])
        < timedelta(hours=2),
        "financial_evidence_stale",
    )
    sections = evidence["sections"]
    subscription = sections["subscription"]["data"]
    billing = sections["billing"]["data"]
    require(
        subscription["state"] == "Enabled"
        and subscription["spending_limit"] == "On"
        and "students" in subscription["offer_quota_id"].lower(),
        "students_limit_gate",
    )
    require(
        billing["billingProfileSpendingLimit"] == "On"
        and billing["subscriptionBillingType"] == "Free"
        and billing["subscriptionBillingStatus"] == "Active",
        "billing_limit_gate",
    )
    credit = sections["credit-balance"]["data"]
    balance = credit["balanceSummary"]["currentBalance"]
    require(
        balance["currency"] == "USD"
        and credit["isEstimatedBalance"] is False
        and credit["pendingEligibleCharges"]["currency"] == "USD"
        and balance["value"] - credit["pendingEligibleCharges"]["value"] >= 10,
        "current_credit_gate",
    )
    lots = sections["credit-lots"]["data"]
    require(lots["complete"] and lots["lots"], "credit_lots_incomplete")
    require(
        all(
            item["isEstimatedBalance"] is False
            and datetime.fromisoformat(item["expirationDate"])
            > datetime.now(UTC) + timedelta(days=7)
            for item in lots["lots"]
        ),
        "credit_expiry_gate",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subscription", required=True)
    parser.add_argument("--resource-group", default="rg-dzirent-staging-scus")
    parser.add_argument("--site-name", default="dzirent-api-staging-4265")
    parser.add_argument("--plan-name", default="asp-dzirent-staging-f1")
    parser.add_argument("--financial-evidence", type=Path, required=True)
    parser.add_argument("--migration-evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    report: dict = {
        "started_at": datetime.now(UTC).isoformat(),
        "writes": [],
        "sql_firewall_changed": False,
        "secret_uploads": False,
        "production_changed": False,
    }
    credential = None
    phase = "local_gates"
    try:
        require(not args.output.exists(), "existing_evidence_preserved")
        require(
            re.fullmatch(r"[0-9a-f-]{36}", args.subscription), "subscription_format"
        )
        require(args.resource_group == "rg-dzirent-staging-scus", "staging_group_only")
        require(
            args.site_name == "dzirent-api-staging-4265"
            and args.plan_name == "asp-dzirent-staging-f1",
            "reviewed_staging_names_only",
        )
        financial_gate(args.financial_evidence)
        migrated = json.loads(args.migration_evidence.read_text())
        require(
            migrated.get("status") == "passed"
            and migrated.get("schema_revision") == "0005_auth_email_outbox"
            and migrated.get("native_runtime_role_login"),
            "validated_migration_gate",
        )
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        require(re.fullmatch(r"[0-9a-f]{40}", sha), "source_sha_gate")
        report["source_sha"] = sha
        prefix = f"/subscriptions/{args.subscription}"
        group = f"{prefix}/resourceGroups/{args.resource_group}"
        provider = f"{prefix}/providers/Microsoft.Web"
        deployment = f"{group}/providers/Microsoft.Resources/deployments/dzirent-stage3-issue77-f1"
        write_routes = {("POST", provider + "/register"), ("PUT", deployment)}
        credential = VisualStudioCodeCredential(connection_timeout=5, read_timeout=10)
        token = credential.get_token(ARM + "/.default")
        claims_part = token.token.split(".")[1]
        tenant = json.loads(
            base64.urlsafe_b64decode(claims_part + "=" * (-len(claims_part) % 4))
        )["tid"]
        session = requests.Session()
        session.headers.update(Authorization="Bearer " + token.token)

        def request(method: str, path: str, api: str, body=None):
            require(
                path.startswith(prefix + "/") or path == prefix,
                "exact_subscription_scope",
            )
            if method != "GET":
                require(
                    args.execute and (method, path) in write_routes,
                    "write_route_not_authorized",
                )
                report["writes"].append(
                    {
                        "method": method,
                        "resource_kind": "provider_registration"
                        if path.endswith("/register")
                        else "staging_host_template",
                    }
                )
            response = session.request(
                method,
                ARM + path,
                params={"api-version": api},
                json=body,
                timeout=(5, 30),
                allow_redirects=False,
            )
            if response.status_code not in {200, 201, 202}:
                code = response.json().get("error", {}).get("code", "http_error")
                report["arm_error"] = {
                    "status": response.status_code,
                    "code": code
                    if re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", str(code))
                    else "redacted",
                }
                raise Stop("arm_request_failed")
            return response.json()

        phase = "subscription_confirmation"
        sub = request("GET", prefix, "2022-12-01")
        require(
            sub.get("subscriptionId", "").lower() == args.subscription
            and sub.get("tenantId", "").lower() == tenant.lower()
            and sub.get("state") == "Enabled"
            and sub.get("subscriptionPolicies", {}).get("spendingLimit") == "On",
            "live_subscription_guard",
        )
        report["students_credit_and_limits_verified"] = True
        phase = "free_linux_meter"
        retail = requests.get(
            "https://prices.azure.com/api/retail/prices",
            params={
                "$filter": "armRegionName eq 'northcentralus' and serviceName eq 'Azure App Service' and priceType eq 'Consumption'"
            },
            timeout=(5, 25),
        )
        retail.raise_for_status()
        prices = retail.json()
        require(not prices.get("NextPageLink"), "regional_price_listing_incomplete")
        matches = [
            p
            for p in prices["Items"]
            if p.get("skuName") == "F1" and "linux" in p.get("productName", "").lower()
        ]
        require(
            matches
            and all(
                p["retailPrice"] == 0
                and p["currencyCode"] == "USD"
                and p["unitOfMeasure"] == "1 Hour"
                for p in matches
            ),
            "free_linux_meter_unverified",
        )
        report["host_meter"] = {
            "region": "northcentralus",
            "sku": "F1",
            "usd_per_hour": 0,
            "paid_fallback_authorized_by_tool": False,
        }
        phase = "preserve_existing_resources"
        for resource in ("sites", "serverfarms"):
            inventory = request("GET", provider + "/" + resource, API)
            require(
                not inventory.get("nextLink") and inventory.get("value") == [],
                "existing_hosts_require_separate_review",
            )
        state = request("GET", provider, "2021-04-01")["registrationState"]
        report["initial_provider_state"] = state
        if not args.execute:
            report["status"] = "free_host_preflight_passed_no_writes"
        else:
            phase = "register_web_provider"
            if state != "Registered":
                request("POST", provider + "/register", "2021-04-01")
                for _ in range(12):
                    state = request("GET", provider, "2021-04-01")["registrationState"]
                    if state == "Registered":
                        break
                    time.sleep(2)
                require(state == "Registered", "provider_registration_pending")
            phase = "allocate_reviewed_f1_host"
            template = json.loads(
                (Path(__file__).parent / "appservice-staging.template.json").read_text()
            )
            payload = {
                "properties": {
                    "mode": "Incremental",
                    "template": template,
                    "parameters": {
                        key: {"value": value}
                        for key, value in {
                            "siteName": args.site_name,
                            "planName": args.plan_name,
                            "location": "northcentralus",
                            "sourceSha": sha,
                        }.items()
                    },
                }
            }
            deployed = request("PUT", deployment, "2025-04-01", payload)
            report.update(
                status="host_template_submitted",
                deployment_name="dzirent-stage3-issue77-f1",
                initial_deployment_state=deployed.get("properties", {}).get(
                    "provisioningState"
                ),
            )
    except Exception as exc:  # noqa: BLE001 -- never expose SDK/token/financial exception values
        report.update(status="blocked", phase=phase, error_type=type(exc).__name__)
        if isinstance(exc, Stop):
            report["reason"] = str(exc)
    finally:
        if credential:
            credential.close()
        report["completed_at"] = datetime.now(UTC).isoformat()
        if not args.output.exists():
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
    return 2 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
