#!/usr/bin/env bash
# Independent container and configuration scanner for dzirent
# Author: Antigravity (QA Lane)
set -euo pipefail

TARGET_IMAGE="${1:-dzirent-api:latest}"
REPORT_FILE="${2:-test-results/trivy-container-report.json}"

mkdir -p "$(dirname "$REPORT_FILE")"

echo "Scanning container image: $TARGET_IMAGE"
if command -v trivy >/dev/null 2>&1; then
  trivy image \
    --severity HIGH,CRITICAL \
    --exit-code 1 \
    --format json \
    --output "$REPORT_FILE" \
    "$TARGET_IMAGE"
else
  echo "Trivy not installed locally. Container scans run in GitHub Actions security workflow."
fi

