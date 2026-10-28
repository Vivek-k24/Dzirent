#!/bin/sh
# Oryx runs Python source from its extracted APP_PATH, which can change each deploy.
# Keep the repository-relative layout needed by Settings and the health schema check.
set -eu
cd "${APP_PATH:-.}"
test -f contracts/modes.json
test -d services/api/src/dzirent_api
sha256sum -c infra/runtime/azure-postgres-roots.sha256
mkdir -p /home/dzirent
cp infra/runtime/azure-postgres-roots.pem /home/dzirent/azure-postgres-roots.pem
export PYTHONPATH="$PWD/services/api/src${PYTHONPATH:+:$PYTHONPATH}"
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1
# Trust no incoming forwarded headers by default. Authentication uses the explicit
# approved web origin, not caller-controlled host/proxy headers.
exec python -m uvicorn dzirent_api.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}" --no-access-log
