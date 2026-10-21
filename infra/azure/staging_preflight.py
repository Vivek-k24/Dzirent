"""Read-only issue #25 evidence. Never authorizes or performs provisioning.

Reuse discovery's bounded VS Code credential, exact subscription/tenant gate,
GET-only SDK transport, safe summaries and ignored local raw-response storage.
Public retail requests use a separate unauthenticated client, never the ARM token.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, build_opener

import discover as az


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise az.DiscoveryError("retail_redirect_rejected")


def retail(service: str) -> dict[str, Any]:
    """One bounded public-price page; a next page makes the evidence partial."""
    query = urlencode(
        {
            "$filter": f"serviceName eq '{service}' and armRegionName eq 'southcentralus' and priceType eq 'Consumption'",
            "currencyCode": "USD",
        }
    )
    url = "https://prices.azure.com/api/retail/prices?" + query
    with build_opener(NoRedirect()).open(url, timeout=15) as response:
        payload = response.read(2_000_001)
    if len(payload) > 2_000_000:
        raise az.DiscoveryError("retail_response_size_limit")
    body = json.loads(payload)
    if not isinstance(body.get("Items"), list):
        raise az.DiscoveryError("retail_response_shape")
    fields = (
        "productName",
        "skuName",
        "armSkuName",
        "meterName",
        "retailPrice",
        "unitOfMeasure",
        "tierMinimumUnits",
        "currencyCode",
        "effectiveStartDate",
        "isPrimaryMeterRegion",
        "meterId",
    )
    return {
        "source": url,
        "complete": not body.get("NextPageLink"),
        "count": len(body["Items"]),
        "rates": [{key: row.get(key) for key in fields} for row in body["Items"]],
        "subscription_specific_quote": False,
        "credit_or_free_service_entitlement": "not_verified",
    }


def listing_summary(discovery: az.Discovery, path: str, api: str) -> dict[str, Any]:
    result = discovery.listing(path, api)
    return {
        "complete": result["complete"],
        "scanned_count": len(result["items"]),
        "dzirent_name_tag_matches": sum(
            discovery.related(row) for row in result["items"]
        ),
        "ownership_and_effective_authorization": "not_proven",
    }


def billing(discovery: az.Discovery) -> dict[str, Any]:
    props = discovery.get(
        discovery.prefix + "/providers/Microsoft.Billing/billingProperty/default",
        "2024-04-01",
    ).get("properties", {})
    return {
        key: props.get(key, "not_returned")
        for key in (
            "billingAccountAgreementType",
            "billingAccountType",
            "billingAccountStatus",
            "isAccountAdmin",
            "billingCurrency",
            "billingProfileSpendingLimit",
            "billingProfileSpendingLimitDetails",
            "subscriptionBillingType",
            "subscriptionBillingStatus",
            "subscriptionWorkloadType",
        )
    } | {
        "evidence_complete": False,
        "remaining_credit_and_free_meters": "not_provided_by_this_endpoint",
    }


def benefits(discovery: az.Discovery) -> None:
    discovery.section("billing", lambda: billing(discovery))
    path = discovery.prefix + "/providers/Microsoft.BillingBenefits/freeServices"

    def free_services() -> dict[str, Any]:
        result = discovery.listing(path, "2026-06-01")
        return {
            "complete": result["complete"],
            "count": len(result["items"]),
            "services": [
                {
                    key: row.get("properties", {}).get(key)
                    for key in ("status", "startAt", "endAt", "productDetails")
                }
                for row in result["items"]
            ],
            "evidence_complete": False,
            "actual_remaining_pg_compute_storage_backup_meters": "not_proven_by_benefit_resource_listing",
        }

    discovery.section("free-services", free_services)
    # Follow only the billing profile linked by the verified subscription's ARM response.
    # There is no arbitrary billing-account scope argument or unrelated account enumeration.
    bodies = [
        row["body"]
        for row in discovery.raw["responses"]
        if row["path"].endswith("/billingProperty/default") and row["status"] == 200
    ]
    profile = (
        bodies[-1].get("properties", {}).get("billingProfileId", "") if bodies else ""
    )
    if not re.fullmatch(
        r"/providers/Microsoft\.Billing/billingAccounts/[A-Za-z0-9:._-]+/billingProfiles/[A-Za-z0-9._-]+",
        profile,
        re.IGNORECASE,
    ):
        discovery.section(
            "credit-scope",
            lambda: {
                "evidence_complete": False,
                "reason": "linked_billing_profile_unavailable_or_unexpected",
            },
        )
        return
    extra = (
        re.escape(profile)
        + r"/providers/Microsoft\.Consumption/(?:credits/balanceSummary|lots)/?$"
    )
    discovery.transport.allowed = re.compile(
        "(?:" + discovery.transport.allowed.pattern + "|" + extra + ")", re.IGNORECASE
    )

    def credits() -> dict[str, Any]:
        props = discovery.get(
            profile + "/providers/Microsoft.Consumption/credits/balanceSummary",
            "2024-08-01",
        ).get("properties", {})
        return {
            key: props.get(key)
            for key in (
                "balanceSummary",
                "billingCurrency",
                "creditCurrency",
                "isEstimatedBalance",
                "pendingEligibleCharges",
            )
        } | {
            "evidence_complete": False,
            "subscription_specific_free_meter_entitlement": "not_proven_by_profile_credit_balance",
        }

    def lots() -> dict[str, Any]:
        result = discovery.listing(
            profile + "/providers/Microsoft.Consumption/lots", "2024-08-01"
        )
        return {
            "complete": result["complete"],
            "count": len(result["items"]),
            "lots": [
                {
                    key: row.get("properties", {}).get(key)
                    for key in (
                        "source",
                        "startDate",
                        "expirationDate",
                        "originalAmount",
                        "closedBalance",
                        "isEstimatedBalance",
                    )
                }
                for row in result["items"]
            ],
            "evidence_complete": False,
            "scope": "subscription_linked_billing_profile_not_individual_service_meter",
        }

    discovery.section("credit-balance", credits)
    discovery.section("credit-lots", lots)


def hosting_skus(discovery: az.Discovery) -> dict[str, Any]:
    body = discovery.get(
        discovery.prefix + "/providers/Microsoft.Web/skus", "2024-11-01"
    )
    skus = body.get("skus")
    # Unregistered providers can return an empty collection instead of SkuInfos.
    # HTTP 200 with no SKUs establishes neither eligibility nor capacity.
    if skus is None and body.get("value") == []:
        skus = []
    if not isinstance(skus, list):
        raise az.DiscoveryError("hosting_sku_response_shape")
    return {
        "advertised_sku_count": len(skus),
        "skus": [
            {
                key: row.get(key)
                for key in ("name", "tier", "locations", "capabilities", "capacity")
            }
            for row in skus
            if row.get("name") in ("F1", "B1")
        ],
        "evidence_complete": False,
        "free_linux_custom_container_eligibility_and_capacity": "not_proven_by_sku_advertisement",
    }


def provider(discovery: az.Discovery, namespace: str) -> dict[str, Any]:
    body = discovery.get(discovery.prefix + "/providers/" + namespace, "2021-04-01")
    return {
        "namespace": namespace,
        "registration_state": body.get("registrationState", "unknown"),
        "resource_types": [
            {key: row.get(key) for key in ("resourceType", "locations")}
            for row in body.get("resourceTypes", [])
            if row.get("resourceType", "").lower()
            in ("sites", "serverfarms", "containerapps", "managedenvironments")
        ],
    }


def permissions(discovery: az.Discovery) -> dict[str, Any]:
    from fnmatch import fnmatchcase

    result = discovery.listing(
        discovery.prefix + "/providers/Microsoft.Authorization/permissions",
        "2022-04-01",
    )
    actions = (
        *az.ACTIONS[:2],
        "Microsoft.Web/serverfarms/write",
        "Microsoft.Web/sites/write",
        "Microsoft.App/managedEnvironments/write",
        "Microsoft.App/containerApps/write",
        "Microsoft.DBforPostgreSQL/register/action",
        "Microsoft.Web/register/action",
        "Microsoft.App/register/action",
    )
    evidence = []
    for action in actions:
        present = any(
            any(
                fnmatchcase(action.lower(), pattern.lower())
                for pattern in row.get("actions", [])
            )
            and not any(
                fnmatchcase(action.lower(), pattern.lower())
                for pattern in row.get("notActions", [])
            )
            for row in result["items"]
        )
        evidence.append({"action": action, "grant_pattern_present": present})
    return {
        "complete": result["complete"],
        "actions": evidence,
        "effective_creation_authorization": "not_proven: policy, deny, conditions, PIM and target scope must be evaluated",
    }


def worker(args: argparse.Namespace) -> int:
    report = {
        "started_at": az.now(),
        "status": "running",
        "subscription_id": az.TARGET,
        "tool_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "discovery_tool_sha256": hashlib.sha256(
            Path(az.__file__).read_bytes()
        ).hexdigest(),
        "authentication": {"status": "not_performed", "method": None, "attempts": []},
        "sections": {},
        "requested_sections": "hosting-skus"
        if args.hosting_skus_only
        else "benefits"
        if args.benefits_only
        else "all",
        "provisioning_ready": False,
        "bounds": {
            "hard_wall_seconds": args.timeout,
            "arm_requests_max": 80,
            "retail_requests_max": 3,
        },
    }
    raw: dict[str, Any] = {"responses": []}
    az.write_json(args.output_dir / "findings.json", report)
    authenticated = az.authenticate(args, report)
    if not authenticated:
        report.update(status="blocked", completed_at=az.now())
        az.write_json(args.output_dir / "findings.json", report)
        return 2
    token, credential = authenticated
    discovery = az.Discovery(args, report, raw, token)
    # Extend only this instance's transport with fixed subscription-scoped GETs.
    extra = re.escape(discovery.prefix) + (
        r"/providers/(?:Microsoft\.(?:Web|App)"
        r"|Microsoft\.Web/(?:skus|sites|serverfarms)"
        r"|Microsoft\.App/(?:containerApps|managedEnvironments)"
        r"|Microsoft\.Billing/billingProperty/default"
        r"|Microsoft\.BillingBenefits/freeServices"
        r"|Microsoft\.Consumption/usageDetails"
        r"|Microsoft\.Authorization/(?:policyAssignments|denyAssignments))/?$"
    )
    discovery.transport.allowed = re.compile(
        "(?:" + discovery.transport.allowed.pattern + "|" + extra + ")", re.IGNORECASE
    )
    try:
        discovery.section("subscription", lambda: discovery.subscription(token))
        if report["sections"]["subscription"]["status"] != "verified":
            report["status"] = "blocked"
            return 2
        if args.hosting_skus_only:
            discovery.section("hosting-skus", lambda: hosting_skus(discovery))
            report["status"] = "blocked"
            return 2
        if args.benefits_only:
            benefits(discovery)
            report["status"] = "blocked"
            return 2
        benefits(discovery)
        for name, api in (
            ("policyAssignments", "2023-04-01"),
            ("denyAssignments", "2022-04-01"),
        ):
            path = (
                az.ARM + discovery.prefix + "/providers/Microsoft.Authorization/" + name
            )
            path += "?" + urlencode({"api-version": api, "$filter": "atScope()"})
            discovery.section(
                name, lambda path=path, api=api: listing_summary(discovery, path, api)
            )
        discovery.section("hosting-permissions", lambda: permissions(discovery))
        for namespace in ("Microsoft.Web", "Microsoft.App"):
            discovery.section(
                "provider." + namespace,
                lambda namespace=namespace: provider(discovery, namespace),
            )
        for name, namespace, api in (
            ("sites", "Web", "2024-11-01"),
            ("serverfarms", "Web", "2024-11-01"),
            ("containerApps", "App", "2025-01-01"),
            ("managedEnvironments", "App", "2025-01-01"),
        ):
            path = discovery.prefix + f"/providers/Microsoft.{namespace}/{name}"
            discovery.section(
                "inventory." + name,
                lambda path=path, api=api: listing_summary(discovery, path, api),
            )
        discovery.section("hosting-skus", lambda: hosting_skus(discovery))
        # Usage is not a balance/free-meter entitlement check. Unsupported offers fail individually.
        path = (
            az.ARM + discovery.prefix + "/providers/Microsoft.Consumption/usageDetails?"
        )
        path += urlencode({"api-version": "2024-08-01", "$top": 10})
        discovery.section(
            "recent-usage-sample",
            lambda: listing_summary(discovery, path, "2024-08-01"),
        )
        for service in (
            "Azure Database for PostgreSQL",
            "Azure App Service",
            "Azure Container Apps",
        ):
            if time.monotonic() >= discovery.transport.deadline:
                break
            discovery.section(
                "retail." + service, lambda service=service: retail(service)
            )
        report["status"] = "blocked"
        report["blockers"] = [
            "Subscription-specific remaining credit and actual free-service meter entitlement need explicit review; inspect dated billing evidence for expiry.",
            "Numeric PostgreSQL regional quota and allocatable capacity need independent verification.",
            "Nonzero or uncertain incremental resource costs require explicit user approval before any write.",
        ]
        return 2
    finally:
        report["completed_at"] = az.now()
        discovery.persist()
        discovery.client.close()
        credential.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=az.local_path, required=True)
    parser.add_argument("--timeout", type=int, default=180)
    subset = parser.add_mutually_exclusive_group()
    subset.add_argument(
        "--hosting-skus-only",
        action="store_true",
        help="Rerun only hosting SKUs and the mandatory fresh subscription/tenant gate.",
    )
    subset.add_argument(
        "--benefits-only",
        action="store_true",
        help="Check subscription benefits and its linked billing profile after a fresh identity gate.",
    )
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not 30 <= args.timeout <= 300:
        parser.error("timeout must be 30-300 seconds")
    args.subscription, args.credential, args.regions = (
        az.TARGET,
        "vscode",
        list(az.REGIONS),
    )
    logging.disable(logging.CRITICAL)
    if args._worker:
        return worker(args)
    if args.output_dir.exists():
        parser.error(
            "choose a new ignored run directory; existing evidence is never overwritten"
        )
    args.output_dir.mkdir(parents=True)
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        *sys.argv[1:],
        "--_worker",
    ]
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    process = subprocess.Popen(command, creationflags=flags)
    try:
        result = process.wait(timeout=args.timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        process.kill()
        process.wait(timeout=5)
        path = args.output_dir / "findings.json"
        report = json.loads(path.read_text()) if path.exists() else {}
        report.update(
            status="blocked",
            stopped_reason="hard_wall_limit_or_interruption",
            completed_at=az.now(),
        )
        for record in report.get("sections", {}).values():
            if record["status"] == "running":
                record.update(
                    status="failed", error={"code": "hard_wall_limit_or_interruption"}
                )
        az.write_json(path, report)
        result = 2
    print(
        "Read-only preflight complete. Review ignored findings.json; provisioning_ready remains false."
    )
    return result


if __name__ == "__main__":
    raise SystemExit(main())
