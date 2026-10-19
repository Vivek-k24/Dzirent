# REL-1 integrated release verification

The user authorized completing the outstanding fixes, integration and presentation deployment.
ADR 0003 records the scoped API/QA ownership handoff. Source branches are preserved.

## Executed locally

Pinned Node 22.23.3, pnpm 10.29.3 and Python 3.12.15; frozen JS and Python installs.

- `pnpm check`: passed lint, TypeScript, 14 web tests, 40-image/font integrity, Ruff/format,
  mypy (19 API source files), OpenAPI/client drift and deterministic fixture regeneration.
- Python subset without PostgreSQL: 26 passed, 232 skipped. These skips are not database acceptance.
- `pnpm build`: passed all presentation routes.
- Workflow YAML and `git diff --check`: passed.

The initial web-test run timed out under this execution host's outbound proxy. Repeating with only
the subprocess proxy variables removed passed all 14 tests; no web source/test assertions changed.
Local browser downloads were truncated by the host, and installing a local PostgreSQL server was
blocked by container UID capabilities. Browser and real PostgreSQL release gates therefore run in
GitHub Actions on the committed candidate. Neither unavailable local check is represented as passed.

## Integrated changes

- Only two exact historical synthetic-fixture fingerprints are ignored by Gitleaks.
- Measurement magnitude/finiteness is checked before Decimal quantization; Unicode ZIP digits fail
  validation before PostgreSQL writes. Four regression cases cover the two reviewed failure modes.
- Browser CI builds the demo before its production-server tests.
- PostgreSQL 17.11 CI is mandatory (`DZIRENT_REQUIRE_DB_TESTS=1`). Independent API smoke uses a
  separately migrated/seeded test database and verifies the mounted Phase 1B catalog/readiness.

## Release gates

CI results, integrated merge SHA, deployment URL and deployed smoke checks are pending. The web
release remains explicit demo mode. Live Clerk/hosted API/PostgreSQL UI integration is outstanding.
