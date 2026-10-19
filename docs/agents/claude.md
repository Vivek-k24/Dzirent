# Claude Code status

Task / GitHub issue: API-1 / [#3](https://github.com/Vivek-k24/Dzirent/issues/3), claimed by Claude Code.
Branch: `claude/api-phase1`. Workspace: `H:\DziRent\worktrees\claude-api` (isolated clone; main checkout untouched).
Base SHA: `37957823213cd2b25e980edad5058becdf9a7fbb` (`foundation-v0.1.0`), fast-forwarded to merged main
`2ff5caefe2ea2bc9d0bbd00be1e2b7bdc9cf55b4` (identical tree) before committing.
Validated implementation SHA: `980b9014dbbfb1158015fe86ca66bdfb584c2598`; the PR head adds only this log.
Owned paths: services/api/**, services/worker/**, infra/runtime/**, contracts/**, fixtures/catalog/**, this log.
Milestone: Phase 1B. Status: ready for review (local PostgreSQL verified; live Clerk/hosted services unverified).

## Implemented behavior

- Schema: SQLAlchemy 2 + psycopg 3 models for the brief section 7 Phase 1 tables plus a small
  `metro_postal_codes` demo ZIP map. One Alembic head, `0001_phase1_schema`. No password, payment or
  later-phase tables. UUID keys, timestamptz audit fields, FKs, check/unique constraints, required indexes.
- Seed: `python -m dzirent_api.seed`, deterministic upserts of 8 roots, 40 subcategories, 40 garments and
  one seed lender (`mock:sample-lender`). Restores seed rows, keeps user rows, refuses production, needs
  `--disposable-staging` for staging.
- Public: `GET /catalog/products` (q, collection, category, subcategory, brand, color, band, size,
  start/end, metro, zip, sort, page, page_size; deduplicated `total`, `collection_total`,
  `available_total`), `/catalog/products/{slug}`, `/catalog/categories`, `/catalog/facets`,
  `/locations/metros`, `/health/live`, `/health/ready` (200 only with DB reachable and at the migration head).
- Protected: `POST /me/bootstrap`, `GET/PATCH/DELETE /me`, `GET/PATCH /me/preferences`,
  `POST /me/lender-profile`, `GET/POST /lender/products`, `GET/PATCH/DELETE /lender/products/{id}`.
  Ownership derives from the verified subject; cross-owner access is a non-enumerating 404; missing
  enrollment 403; stale `expected_version` 409 with a row lock so concurrent edits admit exactly one.
- Identity: official `clerk-backend-api` 7.0.0, Authorization header only, session tokens only, issuer,
  expiry, signature and authorized party checked; JWKS outage is 503. Mock identity only in demo + local/test.
- Platform: stable error envelope (normalized 422s, no input echo), request IDs, redacted JSON logs, safe
  500s, exact CORS, statement/connect timeouts, Docker image, secret-free `.env.example`.
- Not mounted: upload intent/complete (contract-declared for the connected media milestone; return 404).

## Contract

`contracts/openapi.json` is now generated from the runtime routers and is byte-identical to
`0.1.0-candidate.1`; generated TypeScript is unchanged. Behavioral clarifications (additive error codes,
subcategory narrowing, limits, image rules) are in `contracts/README.md` under "API-1 implementation notes".
Only fixture change: the `getReadiness` example now shows the 200 success response instead of Phase 0's 503.
Issue #4 (optional `occasion`/`fabric` filters) is a contract change and is deliberately not in this PR.

## Checks (Windows 11, Python 3.12.15 via uv 0.13.1, PostgreSQL 17.11 in Docker Compose)

- `pytest -q` with `DZIRENT_TEST_DATABASE_URL=...dzirent_api_test` and `DZIRENT_REQUIRE_DB_TESTS=1`:
  **254 passed**, 1 warning (Starlette TestClient httpx deprecation), 136 s. Real PostgreSQL throughout.
- `pytest -q` without a database (CI shape): 26 passed, 228 skipped. Skips are not passes.
- `ruff check`, `ruff format --check` (API, fixture generator, validator): pass. `mypy` strict: pass.
- `python -m dzirent_api.export_contract --check`: OpenAPI matches. `scripts/validate_foundation.py`: PASS.
- `pip-audit --skip-editable`: no known vulnerabilities.
- `alembic upgrade head` on empty DB, seed twice, Uvicorn on 8000 over HTTP; `docker build` and container
  run (uid 10001, healthy, ready) and `docker compose -f compose.yaml -f infra/runtime/compose.api.yaml up`.
- Clerk tests sign tokens with locally generated RSA keys through the real SDK path (networkless
  `jwt_key`). No live Clerk instance was used; JWKS outage was simulated by patching the SDK fetch.
- Not run locally: `pnpm contracts:check` TypeScript half (host Node is 18; openapi.json is unchanged, so
  no type drift is possible) and `pnpm check` as a whole. GitHub CI on the PR runs them.

## Known gaps / dependencies

- No live Clerk development instance, issuer, authorized parties or keys were provided. Connected mode
  refuses to start without them. Real provider verification is unrun.
- No hosted Neon/Render/S3. No deployment, DNS or cloud resource was created.
- Not implemented: rate limiting (429) at a trusted boundary, idempotency keys for duplicate create
  submissions (UI-side guard expected), image uploads/S3, Sentry. Backup/restore not configured or rehearsed.
- The UI → API → PostgreSQL → reload acceptance gate needs Codex's connected adapter plus a Clerk instance.

## Requested changes from other owners

- Codex: integrate `infra/runtime/compose.api.yaml` into root `compose.yaml` (or keep as override); consider
  root scripts `db:migrate`, `db:seed`, `test:api`; mirror the contract README implementation notes in MSW
  (subcategory narrowing, additive error codes); confirm the issue #4 URL names before I publish that change.
- Antigravity: `tests/contracts/api-smoke.spec.ts` pins Phase 0 behavior (readiness `foundation_not_connected`,
  catalog 404). Against this API, readiness without a database is 503 `dependency_unavailable` and with one is
  200; the catalog is mounted (503 without a database). Please add a PostgreSQL service to CI and set
  `DZIRENT_TEST_DATABASE_URL` (a `*_test` database) with `DZIRENT_REQUIRE_DB_TESTS=1` so the 228 DB tests run.

## Next action

Review of this PR. Then the issue #4 contract extension as a separate, coordinated PR, and connected
verification once a Clerk development instance is configured.
