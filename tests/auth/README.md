# AUTH-CONNECT local acceptance

Issue #62 only. No provider CLI, hosted API, deployment, staging migration or real mail.
Use the repository's pinned Node 22.23.3, pnpm 10.29.3, Python 3.12.15 and uv 0.13.1.
Start with an exclusively owned, disposable **local PostgreSQL 17** service. The test runner
destroys/recreates its target database; never point a localhost tunnel at another database.
The tests require an explicit loopback host, port, login/password and safe `*_test` name;
any staging name, address/query/service override or inherited libpq target override fails.

Load these values from private process settings in each relevant terminal. Never paste
passwords/URLs into commands, shell history, screenshots, test reports or GitHub:

| Setting | Required local value |
| --- | --- |
| `DZIRENT_TEST_DATABASE_URL` | Protected psycopg URL for your dedicated local PG17 login and safe `*_test` database |
| `DZIRENT_REQUIRE_DB_TESTS` | `1` (missing DB is a failure, never a skip) |
| `DZIRENT_ENVIRONMENT` | `test` |
| `DZIRENT_AUTH_WEB_ORIGIN` | `http://127.0.0.1:3500` |
| `DZIRENT_AUTH_CSRF_KEY` | New private cryptographically random value, at least 32 bytes |
| `DZIRENT_AUTH62_CONTROL` | A separate private random value, at least 32 bytes; same value in API and browser runner only |

Use `DZIRENT_MODE=demo`, `DZIRENT_IDENTITY_MODE=mock` for source checks/API pytest;
the native tests and browser harness explicitly construct their connected apps. Clear inherited
`PGSERVICE`, `PGSERVICEFILE`, `PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGOPTIONS`, `PGTARGETSESSIONATTRS` **only in the test process**. Keep `NEXT_TELEMETRY_DISABLED=1`.

From the assigned checkout, run the pure safety cases before any destructive DB tests:

```powershell
uv run --directory services/api --frozen --python 3.12.15 pytest -q tests/test_auth_db_safety.py
uv run --directory services/api --frozen --python 3.12.15 pytest -q --tb=short
pnpm check
pnpm build
pnpm --filter @dzirent/web exec vitest run
node --test scripts/auth-deployment-guard.test.mjs
pnpm exec playwright test --config tests/workflows/playwright.config.ts
```

The browser harness requires CREATE DATABASE/ROLE authority **in that disposable local
service only**, and refuses pre-existing `dzirent_auth62_browser_test`, `dzirent_migrator` or
`dzirent_app`. It runs migrations/seed as the local migrator, grants runtime domain permissions
only in its new DB, and serves FastAPI with the restricted runtime login. Mail is an in-memory
test double; TLS SMTP and transaction behavior have separate regression coverage. Do not run
destructive API pytest while the browser harness owns those SQL roles.

Start API in one terminal with the private settings loaded:

```powershell
uv run --directory services/api --frozen --python 3.12.15 python ../../tests/auth/local_api.py
```

Start Next.js in another terminal:

```powershell
$env:NEXT_PUBLIC_DZIRENT_MODE = 'connected'
$env:DZIRENT_WEB_ORIGIN = 'http://127.0.0.1:3500'
$env:DZIRENT_API_UPSTREAM_URL = 'http://127.0.0.1:8500/api/v1'
pnpm --filter @dzirent/web dev --port 3500
```

Run Chromium in the third terminal with the same private control key:

```powershell
pnpm exec playwright test --config tests/auth/playwright.config.ts
```

Only loopback browser requests are allowed. Trace, screenshots and video are disabled;
private tokens/passwords are generated in memory and never embedded in navigation/error URLs.
The test-only control endpoint requires the private header and rejects browser Origins. It is
absent from FastAPI production source and the BFF allowlist. Do not publish its in-memory mailbox.

Stop the harness gracefully so its `finally` cleanup runs (do not depend on Windows hard Ctrl+C):

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8500/_auth62/control `
  -Headers @{ 'X-Auth62-Control' = $env:DZIRENT_AUTH62_CONTROL } `
  -ContentType application/json -Body '{"mode":"stop"}' | Out-Null
```

Stop the dedicated Next process. Check that the harness DB/roles were removed. A hard process
kill may bypass cleanup: inspect the exact local service and ownership before removing anything;
the harness refuses to overwrite leftovers. Delete only your own disposable container/volume
after collecting sanitized evidence. Remove private process settings and ignored local files.
