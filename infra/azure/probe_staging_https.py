"""Secretless GET-only external staging verification; no account or database writes."""

from __future__ import annotations

import argparse
import json
import ssl
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

BASE = "https://dzirent-api-staging-4265.azurewebsites.net"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    opener = urllib.request.build_opener(
        NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context())
    )
    report: dict = {
        "observed_at": datetime.now(UTC).isoformat(),
        "url": BASE,
        "method": "GET",
        "credentials_supplied": False,
        "checks": [],
    }
    for path, expected, health in [
        ("/api/v1/health/live", 200, "live"),
        ("/api/v1/health/ready", 200, "ready"),
        ("/api/v1/catalog/facets", 200, None),
        ("/api/v1/auth/session", 401, None),
        ("/api/v1/lender/products", 401, None),
        ("/docs", 404, None),
        ("/openapi.json", 404, None),
    ]:
        check: dict = {"path": path, "expected": expected, "passed": False}
        try:
            try:
                response = opener.open(BASE + path, timeout=12)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                body = response.read(65536)
                value = (
                    json.loads(body)
                    if "json" in response.headers.get("Content-Type", "")
                    else {}
                )
                check.update(
                    status=response.status,
                    json_response=isinstance(value, dict),
                    request_id_present=bool(response.headers.get("X-Request-ID")),
                    error_code=value.get("error", {}).get("code"),
                )
                check["passed"] = response.status == expected and check["json_response"]
                if health:
                    check["health"] = value.get("status")
                    check["passed"] = check["passed"] and value.get("status") == health
                if path.endswith("/facets"):
                    check["passed"] = check["passed"] and all(
                        k in value for k in ("brands", "colors", "sizes")
                    )
        except Exception as exc:  # noqa: BLE001 -- return type only, never response/cookie/provider text
            check["error_type"] = type(exc).__name__
        report["checks"].append(check)
    report["passed"] = all(c["passed"] for c in report["checks"])
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
