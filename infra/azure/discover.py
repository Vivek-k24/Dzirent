"""Bounded local Azure discovery. ARM is GET-only; tokens never leave memory.

Uses the public ResourceManagementClient.send_request API for documented ARM
GETs, avoiding application SDK dependencies and any provisioning operations.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import logging
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from importlib.metadata import version
from typing import Any, Callable
from urllib.parse import quote, urlencode, urlsplit
from uuid import UUID

from azure.core.credentials import AccessToken
from azure.core.pipeline.transport import RequestsTransport
from azure.core.rest import HttpRequest
from azure.identity import AzureCliCredential, VisualStudioCodeCredential
from azure.mgmt.resource.resources import ResourceManagementClient

TARGET = "c4de17fc-7a0d-4376-8758-ba2b4f79b7c6"
ARM = "https://management.azure.com"
SCOPE = f"{ARM}/.default"
ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / ".local"
REGIONS = ("southcentralus", "eastus2")
PROVIDERS = ("Microsoft.DBforPostgreSQL", "Microsoft.Storage", "Microsoft.Network")
GROUPS = (
    "inventory",
    "providers",
    "regions",
    "postgres-capabilities",
    "postgres-quota",
    "storage-skus",
    "permissions",
)
VERSIONS = {
    "resources": "2021-04-01",
    "subscription": "2022-12-01",
    "postgres": "2025-08-01",
    "storage": "2025-06-01",
    "permissions": "2022-04-01",
}
ACTIONS = (
    "Microsoft.Resources/subscriptions/resourceGroups/write",
    "Microsoft.DBforPostgreSQL/flexibleServers/write",
    "Microsoft.Storage/storageAccounts/write",
    "Microsoft.Authorization/roleAssignments/write",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.lower().encode()).hexdigest()[:12]


def clean_text(value: Any) -> str:
    """Diagnostic text only; never used for arbitrary response serialization."""
    text = str(value)
    text = re.sub(
        r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[token redacted]", text
    )
    text = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email redacted]", text)
    text = re.sub(
        r"\b[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b",
        "[id redacted]",
        text,
    )
    return text.replace("\n", " ")[:300]


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def local_path(value: str) -> Path:
    path = Path(value)
    path = (ROOT / path).resolve() if not path.is_absolute() else path.resolve()
    if not path.is_relative_to(LOCAL.resolve()) or path == LOCAL.resolve():
        raise argparse.ArgumentTypeError(
            "Output/resume must be a run directory inside infra/azure/.local/."
        )
    return path


class DiscoveryError(Exception):
    def __init__(self, code: str, status: int | None = None):
        super().__init__(code)
        self.code, self.status = code, status


class ReadOnlyTransport(RequestsTransport):
    """Final transport gate applies to initial, retry, redirect and paged requests."""

    def __init__(self, subscription: str, regions: list[str], deadline: float):
        super().__init__(connection_timeout=5, read_timeout=12)
        self.deadline, self.requests = deadline, 0
        prefix = f"/subscriptions/{subscription}"
        region = "(?:" + "|".join(re.escape(item) for item in regions) + ")"
        self.allowed = re.compile(
            re.escape(prefix) + r"(?:"
            r"|/resourcegroups|/locations"
            r"|/providers/(?:Microsoft\.DBforPostgreSQL|Microsoft\.Storage|Microsoft\.Network)"
            r"|/providers/Microsoft\.DBforPostgreSQL/flexibleServers"
            r"|/providers/Microsoft\.Storage/(?:storageAccounts|skus)"
            r"|/providers/Microsoft\.DBforPostgreSQL/locations/"
            + region
            + r"/(?:capabilities|resourceType/flexibleServers/usages)"
            r"|(?:/resourcegroups/[^/]+)?/providers/Microsoft\.Authorization/permissions"
            r")/?$",
            re.IGNORECASE,
        )

    def send(self, request: Any, **kwargs: Any) -> Any:
        url = urlsplit(request.url)
        if (
            request.method.upper() != "GET"
            or url.scheme != "https"
            or url.netloc != "management.azure.com"
            or not self.allowed.fullmatch(url.path)
        ):
            raise DiscoveryError("read_only_endpoint_guard")
        remaining = self.deadline - time.monotonic()
        if remaining < 1 or self.requests >= 80:
            raise DiscoveryError("request_or_time_budget_exhausted")
        self.requests += 1
        kwargs["connection_timeout"] = min(5, remaining)
        kwargs["read_timeout"] = min(12, remaining)
        return super().send(request, **kwargs)

    def sleep(self, duration: float) -> None:
        if duration > 2 or time.monotonic() + duration >= self.deadline:
            raise DiscoveryError("retry_wait_exceeds_budget")
        super().sleep(duration)


class MemoryCredential:
    """Reuse one acquired ARM token; no automatic login/refresh/tenant switching."""

    def __init__(self, token: AccessToken):
        self.token = token

    def get_token(self, *scopes: str, **kwargs: Any) -> AccessToken:
        if (
            scopes != (SCOPE,)
            or kwargs.get("claims")
            or self.token.expires_on <= time.time() + 15
        ):
            raise DiscoveryError("token_refresh_or_claims_required")
        return self.token


def token_once(factory: Callable[[], Any], seconds: int) -> tuple[AccessToken, Any]:
    result: queue.Queue[Any] = queue.Queue(maxsize=1)

    def acquire() -> None:
        credential = None
        try:
            credential = factory()
            result.put((credential.get_token(SCOPE), credential))
        except Exception as error:
            if credential:
                credential.close()
            result.put(error)

    threading.Thread(target=acquire, daemon=True).start()
    try:
        value = result.get(timeout=seconds)
    except queue.Empty as error:
        raise DiscoveryError("credential_timeout") from error
    if isinstance(value, Exception):
        raise value
    return value


def authenticate(
    args: argparse.Namespace, report: dict[str, Any]
) -> tuple[AccessToken, Any] | None:
    attempts = report["authentication"]["attempts"]
    if args.credential != "cli":
        try:
            token, credential = token_once(
                lambda: VisualStudioCodeCredential(
                    connection_timeout=5, read_timeout=10
                ),
                20,
            )
            report["authentication"].update(
                method="VisualStudioCodeCredential", status="verified"
            )
            attempts.append(
                {"method": "VisualStudioCodeCredential", "status": "verified"}
            )
            return token, credential
        except Exception as error:
            attempts.append(
                {
                    "method": "VisualStudioCodeCredential",
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "detail": clean_text(error),
                }
            )
    # account show is cache inspection, never az login/account set/get-access-token output.
    az = shutil.which("az")
    try:
        if not az:
            raise DiscoveryError("azure_cli_not_installed")
        account = subprocess.run(
            [
                az,
                "account",
                "show",
                "--subscription",
                args.subscription,
                "--output",
                "json",
                "--only-show-errors",
            ],
            capture_output=True,
            text=True,
            timeout=12,
            check=False,
        )
        if account.returncode:
            raise DiscoveryError("azure_cli_no_usable_cached_subscription")
        cached = json.loads(account.stdout)
        if (
            cached.get("id", "").lower() != args.subscription
            or cached.get("state", "").lower() != "enabled"
        ):
            raise DiscoveryError("azure_cli_cached_subscription_mismatch_or_disabled")
        attempts.append(
            {
                "method": "AzureCLI cached account inspection",
                "status": "verified",
                "subscription_matches": True,
            }
        )
        if args.credential == "vscode":
            report["authentication"].update(status="blocked", cli_available=True)
            return None
        token, credential = token_once(
            lambda: AzureCliCredential(
                subscription=args.subscription,
                tenant_id=cached["tenantId"],
                process_timeout=12,
            ),
            15,
        )
        report["authentication"].update(method="AzureCliCredential", status="verified")
        attempts.append({"method": "AzureCliCredential", "status": "verified"})
        return token, credential
    except Exception as error:
        attempts.append(
            {
                "method": "AzureCLI existing authentication",
                "status": "failed",
                "error_type": type(error).__name__,
                "detail": clean_text(error),
            }
        )
        report["authentication"].update(status="blocked")
        return None


class Discovery:
    def __init__(
        self,
        args: argparse.Namespace,
        report: dict[str, Any],
        raw: dict[str, Any],
        token: AccessToken,
    ):
        self.args, self.report, self.raw = args, report, raw
        self.prefix = f"/subscriptions/{args.subscription}"
        self.transport = ReadOnlyTransport(
            args.subscription, args.regions, time.monotonic() + args.timeout - 2
        )
        self.client = ResourceManagementClient(
            MemoryCredential(token),
            args.subscription,
            transport=self.transport,
            retry_total=1,
            retry_connect=1,
            retry_read=1,
            retry_status=1,
            retry_backoff_factor=0.25,
            retry_backoff_max=1,
            logging_enable=False,
        )

    def persist(self) -> None:
        self.report["arm_request_attempts"] = self.transport.requests
        write_json(self.args.output_dir / "raw.json", self.raw)
        write_json(self.args.output_dir / "findings.json", self.report)

    def get(self, path: str, api: str) -> dict[str, Any]:
        url = (
            path
            if path.startswith("https://")
            else ARM + path + "?" + urlencode({"api-version": api})
        )
        response = self.client.send_request(
            HttpRequest("GET", url), logging_enable=False
        )
        try:
            try:
                body = response.json()
            except ValueError as error:
                self.raw["responses"].append(
                    {
                        "path": urlsplit(url).path,
                        "status": response.status_code,
                        "body": "Non-JSON response omitted.",
                    }
                )
                raise DiscoveryError(
                    "non_json_response", response.status_code
                ) from error
            self.raw["responses"].append(
                {
                    "path": urlsplit(url).path,
                    "status": response.status_code,
                    "body": body,
                }
            )
            if response.status_code != 200:
                code = (
                    body.get("error", {}).get("code", "http_error")
                    if isinstance(body, dict)
                    else "http_error"
                )
                raise DiscoveryError(clean_text(code), response.status_code)
            if not isinstance(body, dict):
                raise DiscoveryError("unexpected_response_shape", response.status_code)
            return body
        finally:
            response.close()

    def listing(self, path: str, api: str, limit: int = 500) -> dict[str, Any]:
        values: list[Any] = []
        for _ in range(8):
            body = self.get(path, api)
            if not isinstance(body.get("value"), list):
                raise DiscoveryError("unexpected_list_shape")
            values.extend(body["value"])
            next_link = body.get("nextLink")
            if len(values) > limit or not next_link:
                return {
                    "items": values[:limit],
                    "complete": len(values) <= limit and not next_link,
                }
            path = next_link
        return {"items": values[:limit], "complete": False}

    def section(self, key: str, action: Callable[[], dict[str, Any]]) -> None:
        record = {
            "status": "running",
            "observed_at": now(),
            "tool_sha256": self.report["tool_sha256"],
        }
        self.report["sections"][key] = record
        self.persist()
        try:
            data = action()
            record.update(
                status="verified"
                if data.get("complete", True) and data.get("evidence_complete", True)
                else "partial",
                data=data,
            )
        except Exception as error:
            status = getattr(error, "status", None) or getattr(
                error, "status_code", None
            )
            record.update(
                status="failed",
                error={
                    "type": type(error).__name__,
                    "http_status": status,
                    "code": clean_text(getattr(error, "code", type(error).__name__)),
                },
            )
        self.persist()
        print(f"{key}: {record['status']}", flush=True)

    def subscription(self, token: AccessToken) -> dict[str, Any]:
        body = self.get(self.prefix, VERSIONS["subscription"])
        tenant = str(UUID(body.get("tenantId", "")))
        if (
            body.get("subscriptionId", "").lower() != self.args.subscription
            or body.get("state", "").lower() != "enabled"
        ):
            raise DiscoveryError("target_subscription_mismatch_or_not_enabled")
        # ARM validated the token. Decoding only compares its tenant, not signature/auth authority.
        payload = token.token.split(".")[1]
        claims = json.loads(
            base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        )
        if str(claims.get("tid", "")).lower() != tenant.lower():
            raise DiscoveryError("token_and_subscription_tenant_mismatch")
        policies = body.get("subscriptionPolicies", {})
        return {
            "subscription_id": self.args.subscription,
            "exact_match": True,
            "state": body["state"],
            "tenant_fingerprint": fingerprint(tenant),
            "token_tenant_matches": True,
            "offer_quota_id": clean_text(policies.get("quotaId", "unknown")),
            "spending_limit": policies.get("spendingLimit", "unknown"),
            "benefit_eligibility": "not_verified",
        }

    @staticmethod
    def related(item: dict[str, Any]) -> bool:
        text = " ".join(
            [
                str(item.get("name", "")),
                str(item.get("id", "")),
                *[str(value) for value in (item.get("tags") or {}).values()],
            ]
        )
        return bool(re.search(r"dzi[-_ ]?rent", text, re.IGNORECASE))

    def inventory(self, kind: str) -> dict[str, Any]:
        path, api = {
            "resource_groups": (self.prefix + "/resourcegroups", VERSIONS["resources"]),
            "postgresql": (
                self.prefix + "/providers/Microsoft.DBforPostgreSQL/flexibleServers",
                VERSIONS["postgres"],
            ),
            "storage": (
                self.prefix + "/providers/Microsoft.Storage/storageAccounts",
                VERSIONS["storage"],
            ),
        }[kind]
        result = self.listing(path, api)
        groups = self.raw.get("related_resource_groups", [])
        matches = [
            item
            for item in result["items"]
            if self.related(item)
            or any(
                f"/resourcegroups/{name}/" in (item.get("id", "") + "/").lower()
                for name in groups
            )
        ]
        if kind == "resource_groups":
            self.raw["related_resource_groups"] = [
                item["name"].lower() for item in matches
            ]
        self.raw["inventories"][kind] = result
        return {
            "complete": result["complete"],
            "scanned_count": len(result["items"]),
            "related_count": len(matches),
            "matches": [
                {
                    "resource_ref": fingerprint(item["id"]),
                    "location": item.get("location"),
                    "type": item.get("type"),
                    "sku": item.get("sku", {}).get("name"),
                    "postgres_version": item.get("properties", {}).get("version"),
                }
                for item in matches
            ],
            "match_rule": "dzirent/dzi-rent/dzi_rent in name/id/tag values, or membership in a matching resource group; unlabeled ownership remains unknown",
        }

    def provider(self, namespace: str) -> dict[str, Any]:
        body = self.get(self.prefix + "/providers/" + namespace, VERSIONS["resources"])
        resource_type = (
            "flexibleServers"
            if namespace == "Microsoft.DBforPostgreSQL"
            else "storageAccounts"
            if namespace == "Microsoft.Storage"
            else "virtualNetworks"
        )
        advertised = next(
            (
                entry
                for entry in body.get("resourceTypes", [])
                if entry.get("resourceType", "").lower() == resource_type.lower()
            ),
            {},
        )
        return {
            "namespace": body.get("namespace"),
            "registration_state": body.get("registrationState", "unknown"),
            "resource_type": resource_type,
            "advertised_locations": advertised.get("locations", []),
            "advertised_api_versions": advertised.get("apiVersions", []),
            "registration_changed": False,
        }

    def locations(self) -> dict[str, Any]:
        result = self.listing(self.prefix + "/locations", VERSIONS["subscription"])
        return {
            "complete": result["complete"],
            "advertised_region_count": len(result["items"]),
            "requested": [
                {
                    "name": region,
                    "listed": any(
                        item.get("name") == region for item in result["items"]
                    ),
                }
                for region in self.args.regions
            ],
            "capacity_or_offer_eligibility_proven": False,
        }

    def capabilities(self, region: str) -> dict[str, Any]:
        result = self.listing(
            f"{self.prefix}/providers/Microsoft.DBforPostgreSQL/locations/{region}/capabilities",
            VERSIONS["postgres"],
        )
        entries = []
        for item in result["items"]:
            versions = [
                {
                    "name": entry.get("name"),
                    "status": entry.get("status", "unspecified"),
                }
                for entry in item.get("supportedServerVersions", [])
            ]
            tiers = []
            for tier in item.get("supportedServerEditions", []):
                skus = [
                    {
                        "name": sku.get("name"),
                        "vcores": sku.get("vCores"),
                        "status": sku.get("status", "unspecified"),
                        "zones": sku.get("supportedZones", []),
                    }
                    for sku in tier.get("supportedServerSkus", [])
                ]
                tiers.append(
                    {
                        "tier": tier.get("name"),
                        "status": tier.get("status", "unspecified"),
                        "skus": skus,
                    }
                )
            entries.append(
                {
                    "status": item.get("status", "unspecified"),
                    "restricted": item.get("restricted", "unspecified"),
                    "features": [
                        {"name": feature.get("name"), "status": feature.get("status")}
                        for feature in item.get("supportedFeatures", [])
                    ],
                    "versions": versions,
                    "postgres_17_advertised": any(
                        entry["name"] == "17" for entry in versions
                    ),
                    "tiers": tiers,
                }
            )
        return {
            "complete": result["complete"],
            "region": region,
            "entries": entries,
            "evidence": "subscription-specific capability advertisement only; not a reservation, per-version/SKU pair guarantee, spare capacity or Students entitlement",
        }

    def quota(self, region: str) -> dict[str, Any]:
        result = self.listing(
            f"{self.prefix}/providers/Microsoft.DBforPostgreSQL/locations/{region}/resourceType/flexibleServers/usages",
            VERSIONS["postgres"],
        )
        numeric = bool(result["items"]) and all(
            type(item.get("limit")) is int and type(item.get("currentValue")) is int
            for item in result["items"]
        )
        return {
            "complete": result["complete"],
            "evidence_complete": numeric,
            "quota_status": "numeric_limits_reported"
            if numeric
            else "unknown_no_numeric_limits_returned",
            "region": region,
            "usages": [
                {
                    "name": item.get("name", {}).get("value"),
                    "current": item.get("currentValue"),
                    "limit": item.get("limit"),
                    "unit": item.get("unit"),
                }
                for item in result["items"]
            ],
            "spare_capacity_proven": False,
        }

    def storage_skus(self) -> dict[str, Any]:
        result = self.listing(
            self.prefix + "/providers/Microsoft.Storage/skus",
            VERSIONS["storage"],
            limit=2000,
        )
        matches = [
            item
            for item in result["items"]
            if item.get("name") == "Standard_LRS"
            and any(region in item.get("locations", []) for region in self.args.regions)
        ]
        return {
            "complete": result["complete"],
            "candidate": "Standard_LRS",
            "entries": [
                {
                    "name": item.get("name"),
                    "kind": item.get("kind"),
                    "tier": item.get("tier"),
                    "locations": [
                        region
                        for region in item.get("locations", [])
                        if region in self.args.regions
                    ],
                    "restrictions": [
                        {
                            "type": restriction.get("type"),
                            "reason_code": restriction.get("reasonCode"),
                            "values": restriction.get("values", []),
                        }
                        for restriction in item.get("restrictions", [])
                    ],
                }
                for item in matches
            ],
            "benefit_or_capacity_proven": False,
        }

    def permissions(self, group: str | None) -> dict[str, Any]:
        scope = (
            self.prefix
            if not group
            else self.prefix + "/resourcegroups/" + quote(group, safe="")
        )
        result = self.listing(
            scope + "/providers/Microsoft.Authorization/permissions",
            VERSIONS["permissions"],
        )
        from fnmatch import fnmatchcase

        evidence = []
        for action in ACTIONS:
            matching = [
                entry
                for entry in result["items"]
                if any(
                    fnmatchcase(action.lower(), pattern.lower())
                    for pattern in entry.get("actions", [])
                )
                and not any(
                    fnmatchcase(action.lower(), pattern.lower())
                    for pattern in entry.get("notActions", [])
                )
            ]
            evidence.append(
                {
                    "action": action,
                    "grant_evidence": "present"
                    if matching
                    else "not_present_in_returned_permissions"
                    if result["complete"]
                    else "unknown",
                }
            )
        return {
            "complete": result["complete"],
            "scope": "subscription"
            if not group
            else "resource-group-" + fingerprint(group),
            "permission_blocks": len(result["items"]),
            "actions": evidence,
            "creation_or_role_assignment_authorized": "not_proven: policy/deny assignments/conditions/PIM/scope and actual operation were not comprehensively evaluated",
        }


def section_keys(args: argparse.Namespace) -> list[str]:
    keys = ["subscription"]
    if "inventory" in args.sections:
        keys += [
            "inventory.resource_groups",
            "inventory.postgresql",
            "inventory.storage",
        ]
    if "providers" in args.sections:
        keys += ["provider." + namespace for namespace in PROVIDERS]
    if "regions" in args.sections:
        keys += ["regions"]
    for name in ("postgres-capabilities", "postgres-quota"):
        if name in args.sections:
            keys += [name + "." + region for region in args.regions]
    if "storage-skus" in args.sections:
        keys += ["storage-skus"]
    if "permissions" in args.sections:
        keys += ["permissions.subscription"]
    return keys


def initial_report(args: argparse.Namespace) -> dict[str, Any]:
    all_args = argparse.Namespace(**vars(args))
    all_args.sections = list(GROUPS)
    return {
        "schema_version": 1,
        "started_at": now(),
        "subscription_id": args.subscription,
        "regions": args.regions,
        "requested_sections": args.sections,
        "tool_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sdk_versions": {
            name: version(name)
            for name in (
                "azure-core",
                "azure-identity",
                "azure-identity-broker",
                "azure-mgmt-resource",
            )
        },
        "bounds": {
            "wall_seconds": args.timeout,
            "arm_requests_max": 80,
            "pages_per_list_max": 8,
            "records_per_list_max": 500,
            "storage_sku_records_per_list_max": 2000,
            "retries_max": 1,
        },
        "status": "running",
        "authentication": {"status": "not_performed", "method": None, "attempts": []},
        "sections": {
            key: {
                "status": "not_performed",
                "reason": "not selected"
                if key not in section_keys(args)
                else "subscription gate or selected section not reached",
            }
            for key in section_keys(all_args)
        },
        "unknowns": [
            "Students service-specific allowance, remaining credit/hours/storage and billing eligibility",
            "instantaneous regional capacity and version/SKU pair provisioning",
            "complete policy/deny/conditional RBAC/PIM analysis",
            "prices, name availability, networking/CORS/secrets and database connectivity",
        ],
        "provisioning": {
            "ready": False,
            "authorization": "not_requested",
            "plan": [
                "Reuse a verified suitable Dzirent resource group/server before proposing duplicates; name/tag matching is heuristic.",
                "If hosted persistence is required, consider one PostgreSQL Flexible Server on major 17 only after region/SKU/quota/benefit/cost/network approval.",
                "Defer Blob storage while licensed sample media remain bundled on Vercel; if connected uploads are required, first assess existing account reuse, then one StorageV2 Standard_LRS account.",
                "Keep application hosting on existing Vercel; no API hosting/auth/payment/shipping implementation in this assignment.",
            ],
        },
    }


def worker(args: argparse.Namespace) -> int:
    report = initial_report(args)
    raw: dict[str, Any] = {
        "responses": [],
        "inventories": {},
        "authentication": "No access tokens, credential caches or headers are stored here.",
    }
    if args.resume:
        previous = json.loads(
            (args.resume / "findings.json").read_text(encoding="utf-8")
        )
        if (
            previous.get("subscription_id") != args.subscription
            or previous.get("regions") != args.regions
        ):
            raise DiscoveryError("resume_target_mismatch")
        for key, record in previous["sections"].items():
            if key not in section_keys(args):
                report["sections"][key] = {
                    **record,
                    "reused_from": str(args.resume.relative_to(LOCAL)),
                }
    write_json(args.output_dir / "findings.json", report)
    auth = authenticate(args, report)
    if not auth:
        report.update(status="blocked", completed_at=now())
        write_json(args.output_dir / "findings.json", report)
        return 2
    token, credential = auth
    discovery = Discovery(args, report, raw, token)
    try:
        discovery.section("subscription", lambda: discovery.subscription(token))
        if report["sections"]["subscription"]["status"] != "verified":
            report["status"] = "blocked"
            return 2
        if "inventory" in args.sections:
            for kind in ("resource_groups", "postgresql", "storage"):
                discovery.section(
                    "inventory." + kind, lambda kind=kind: discovery.inventory(kind)
                )
        if "providers" in args.sections:
            for namespace in PROVIDERS:
                discovery.section(
                    "provider." + namespace,
                    lambda namespace=namespace: discovery.provider(namespace),
                )
        if "regions" in args.sections:
            discovery.section("regions", discovery.locations)
        for name, action in (
            ("postgres-capabilities", discovery.capabilities),
            ("postgres-quota", discovery.quota),
        ):
            if name in args.sections:
                for region in args.regions:
                    discovery.section(
                        name + "." + region,
                        lambda region=region, action=action: action(region),
                    )
        if "storage-skus" in args.sections:
            discovery.section("storage-skus", discovery.storage_skus)
        if "permissions" in args.sections:
            discovery.section(
                "permissions.subscription", lambda: discovery.permissions(None)
            )
            groups = discovery.raw.get("related_resource_groups", [])
            if args.resume and not groups:
                old_raw = (
                    json.loads((args.resume / "raw.json").read_text(encoding="utf-8"))
                    if (args.resume / "raw.json").exists()
                    else {}
                )
                groups = old_raw.get("related_resource_groups", [])
            for group in groups[:3]:
                discovery.section(
                    "permissions.resource-group-" + fingerprint(group),
                    lambda group=group: discovery.permissions(group),
                )
        report["status"] = (
            "verified"
            if all(
                record["status"] == "verified" for record in report["sections"].values()
            )
            else "partial"
        )
        return 0 if report["status"] == "verified" else 2
    finally:
        report["completed_at"] = now()
        discovery.persist()
        discovery.client.close()
        credential.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--subscription",
        default=TARGET,
        help="Exact subscription UUID to verify before any other ARM GET.",
    )
    parser.add_argument(
        "--regions",
        nargs="+",
        default=list(REGIONS),
        help="One to four region codes; capability/quota checks are limited to these regions.",
    )
    parser.add_argument(
        "--sections",
        nargs="+",
        choices=("all", *GROUPS),
        default=["all"],
        help="Rerun only affected groups; subscription verification always runs.",
    )
    parser.add_argument(
        "--credential",
        choices=("auto", "vscode", "cli"),
        default="auto",
        help="auto: VS Code once, then inspect existing CLI auth; never starts a login flow.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Hard wall-clock bound, 30–300 seconds (default 180).",
    )
    parser.add_argument(
        "--output-dir",
        type=local_path,
        default=LOCAL / "latest",
        help="New ignored run directory under infra/azure/.local/.",
    )
    parser.add_argument(
        "--resume",
        type=local_path,
        help="Reuse previous sections not selected for rerun; preserves original observation/tool hashes.",
    )
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        args.subscription = str(UUID(args.subscription))
    except ValueError:
        parser.error("subscription must be a UUID")
    if (
        not 30 <= args.timeout <= 300
        or not 1 <= len(args.regions) <= 4
        or any(not re.fullmatch(r"[a-z0-9]+", region) for region in args.regions)
    ):
        parser.error(
            "timeout must be 30–300; supply one to four lowercase region codes"
        )
    args.regions = list(dict.fromkeys(args.regions))
    args.sections = list(GROUPS) if "all" in args.sections else args.sections
    if args.resume == args.output_dir:
        parser.error("resume and output directories must differ")
    # SDK/MSAL diagnostic logging can contain identifiers; only our allowlisted summary is printed.
    logging.disable(logging.CRITICAL)
    if args._worker:
        try:
            return worker(args)
        except Exception as error:
            path = args.output_dir / "findings.json"
            report = (
                json.loads(path.read_text()) if path.exists() else initial_report(args)
            )
            report.update(
                status="failed",
                completed_at=now(),
                worker_error={
                    "type": type(error).__name__,
                    "code": clean_text(getattr(error, "code", type(error).__name__)),
                },
            )
            write_json(path, report)
            return 2
    if (args.output_dir / "findings.json").exists():
        parser.error("output already contains evidence; choose a new run directory")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.output_dir / "findings.json", initial_report(args))
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
        report = json.loads((args.output_dir / "findings.json").read_text())
        for record in report["sections"].values():
            if record["status"] == "running":
                record.update(
                    status="failed", error={"code": "wall_clock_budget_exhausted"}
                )
        report.update(
            status="partial"
            if report["sections"]["subscription"]["status"] == "verified"
            else "blocked",
            completed_at=now(),
            stopped_reason="wall_clock_budget_or_interruption",
        )
        write_json(args.output_dir / "findings.json", report)
        result = 2
    report = json.loads((args.output_dir / "findings.json").read_text())
    print(
        json.dumps(
            {
                "status": report["status"],
                "authentication": report["authentication"]["method"],
                "sections": {
                    key: record["status"] for key, record in report["sections"].items()
                },
                "sanitized_findings": str(args.output_dir / "findings.json"),
                "raw_local_only": str(args.output_dir / "raw.json"),
                "provisioning_ready": False,
            },
            indent=2,
        )
    )
    return result


if __name__ == "__main__":
    raise SystemExit(main())
