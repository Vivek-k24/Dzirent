# dzirent API (Phase 1B)

FastAPI + SQLAlchemy 2 + psycopg 3 + Alembic over PostgreSQL. Owner: Claude Code.
Contract: `contracts/openapi.json` (`0.1.0-candidate.2`), generated from the runtime routers; see
[contracts/README.md](../../contracts/README.md) for semantics and the API-1 implementation notes.

## Modules

| Module | Responsibility |
| --- | --- |
| `catalog.py` | Public search/filter/sort/pagination, deduplicated counts, category tree, facets, metros |
| `profiles.py` | `/me` bootstrap/read/update/deactivate, preferences, lender enrollment |
| `listings.py` | Owner-scoped listing create/read/update/archive/availability with `expected_version` |
| `studios.py` | Studio owner settings (`/me/studio`) and public directory/profile/products (`/studios`) |
| `identity.py` | First-party session boundary (implementation pending); restricted local/test mock identity |
| `orm.py`, `alembic/` | Phase 1 schema; one Alembic head (`0002_studios`) |
| `seed.py` | Idempotent deterministic demo seed from `fixtures/catalog` (local/test only) |
| `errors.py`, `observability.py` | Error envelope, request IDs, redacted JSON logs, safe 500s |
| `contract.py` | OpenAPI source: runtime routers plus contract-only upload declarations |

Upload intents (`.../images/upload-intent`, `.../images/complete`) stay declared in the contract for the
connected media milestone but are **not mounted** at runtime (404). No S3 access exists yet.

## Local development

Prerequisites: uv 0.13.1, Python 3.12.15 (uv-managed), Docker. From the repository root:

```powershell
pnpm api:sync                     # or: uv sync --directory services/api --frozen --python 3.12.15
pnpm db:up                        # PostgreSQL 17.11 on 127.0.0.1:5432 / dzirent_dev
Copy-Item services/api/.env.example services/api/.env
cd services/api
uv run --frozen alembic upgrade head
uv run --frozen python -m dzirent_api.seed      # repeatable; restores seed rows, keeps user rows
uv run --frozen uvicorn dzirent_api.main:app --port 8000
```

Demo identity (only with `DZIRENT_MODE=demo` and `DZIRENT_ENVIRONMENT=local|test`):
`Authorization: Bearer mock:<subject>` where subject matches `^[a-z0-9][a-z0-9-]{0,62}$`.
The seed lender that owns all 40 garments is `mock:sample-lender`. Connected mode selects native identity and requires a database URL. Until Issue #26 is implemented,
protected connected requests return 503, never mock success.

## Tests

Integration tests need a disposable PostgreSQL database whose name ends in `_test`; it is dropped,
recreated, migrated, and reseeded before each test. Never point this at shared data.

```powershell
$env:DZIRENT_TEST_DATABASE_URL = "postgresql+psycopg://dzirent:local-disposable-only@127.0.0.1:5432/dzirent_api_test"
$env:DZIRENT_REQUIRE_DB_TESTS = "1"   # fail instead of skip when the database is missing (use in CI)
uv run --frozen pytest -q
uv run --frozen ruff check . ; uv run --frozen ruff format --check . ; uv run --frozen mypy
uv run --frozen python -m dzirent_api.export_contract --check
```

Without `DZIRENT_TEST_DATABASE_URL`, database tests are **skipped** (reported as skipped, not passed).

## Container

```powershell
docker build -f services/api/Dockerfile -t dzirent-api:local .
docker compose -f compose.yaml -f infra/runtime/compose.api.yaml up -d --build api
```

See [infra/runtime/README.md](../../infra/runtime/README.md) for runtime and release notes.
