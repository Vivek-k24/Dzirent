# API runtime lane

Owner: Claude Code. Nothing here creates cloud resources, deployments or DNS records.

## Image

`services/api/Dockerfile` (build context: repository root; allowlist in
`services/api/Dockerfile.dockerignore`). Multi-stage uv 0.13.1 build on `python:3.12.15-slim-trixie`,
frozen `uv.lock`, no dev dependencies, non-root uid 10001, health check on `/api/v1/health/live`.
Uvicorn's access log is disabled because the API middleware writes one redacted JSON line per request
(method, path without query string, status, duration, request ID).

Runtime variables: see `services/api/.env.example`. `PORT` (default 8000) and `FORWARDED_ALLOW_IPS`
(default `127.0.0.1`; set to the platform proxy range when deployed).

## Proposed Compose integration (for Codex)

`compose.api.yaml` adds `api-migrate` (one-shot `alembic upgrade head`) and `api` (demo/local, mock
identity, loopback port `${DZIRENT_API_PORT:-8000}`). Root `compose.yaml` is Codex-owned, so this is an
override until integrated:

```powershell
docker compose -f compose.yaml -f infra/runtime/compose.api.yaml up -d --build api
```

Suggested root scripts (Codex decides): `db:migrate`, `db:seed`, and `test:api` that sets
`DZIRENT_TEST_DATABASE_URL` to a `*_test` database. QA should keep its own Compose project/port.

## Release notes for a later, authorized connected deployment

- Run `alembic upgrade head` once per release as a serialized step (e.g. a pre-deploy command), not in
  every replica. `alembic/env.py` also takes a PostgreSQL advisory lock.
- Readiness (`/api/v1/health/ready`) returns 200 only when the database is reachable and at the expected
  migration head; otherwise 503 `dependency_unavailable` or `schema_not_current`.
- Use a direct (non-pooled) URL for migrations where the provider requires it; the runtime pool is small
  (`DZIRENT_DB_POOL_SIZE`) with connect and statement timeouts.
- Never run `python -m dzirent_api.seed` against production; it refuses `environment=production` and needs
  `--disposable-staging` for a disposable staging database.
- Exact HTTPS CORS origins and Clerk authorized parties are required when `environment` is staging or
  production. Interactive docs/OpenAPI routes are disabled there.
- Backup/restore: verify the chosen provider's actual features and rehearse a restore before relying on it.
  Not configured or tested here.
