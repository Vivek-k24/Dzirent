# Claude Code status

## STUDIO-2 — lender Studio management and public exploration (current)

Task / issue: [#16](https://github.com/Vivek-k24/Dzirent/issues/16). PR: [#19](https://github.com/Vivek-k24/Dzirent/pull/19) → main (do not merge before #17).
Branch: `claude/studio-workflow` in `H:\DziRent\worktrees\claude-api` (clean checkout; previous branch merged as #11).
Base SHA: `ffd4b96e4a24a741f0597faf514533f0c20bd33b` (PR #17 head, verified after fetch, per the issue amendment).
Feature SHA: `ead93c72ecb52b876190edd59cd2ea9f9eba8f7c` (checks and preview below); the PR head adds only this log.
Milestone / status: rental refresh batch, **ready for review and for Antigravity once both lane candidates exist.**

Implemented:
- API: `studios` table via migration `0002_studios` (single head); owner `GET/PUT /me/studio` (verified principal,
  stable server-assigned handle, `expected_version` → 409); public `GET /studios`, `/studios/{handle}`,
  `/studios/{handle}/products` (distinct published counts; private/inactive/missing → 404; drafts/archived never
  public; zero-product Studios have a profile but are not listed). Seed adds Studio `sample-lender` for the existing
  seed lender; 40 product IDs, ownership and licensed photos unchanged.
- Contract `0.1.0-candidate.2`, additive (no removed/changed path, operation or schema). OpenAPI, client types and
  26 examples regenerated through repository commands. Exact diff: `contracts/changes/0002-studios.md`.
- Web: `/lender/studio` (linked from the lender dashboard), `/studios`, `/studios/[handle]`; carousel pages through
  every published outfit (photo/title/size only, pause/manual controls, hover/focus pause, reduced-motion stop,
  reserved 3:4). Scoped CSS module, no new package. MSW handlers mirror the API for the public demo.

Checks (Windows 11; Node 22.23.3, pnpm 10.29.3, Python 3.12.15/uv 0.13.1, Playwright 1.64.1 Chromium, PostgreSQL 17.11):
- Real PostgreSQL (own disposable `*_test` DBs): CI selection `pytest -q tests/test_listings.py::test_create_persists_and_server_assigns_identity
  tests/test_listings.py::test_cross_owner_access_is_non_enumerating_404 tests/workflows` with `DZIRENT_REQUIRE_DB_TESTS=1`:
  **6 passed** (4 Studio cases). Selected migration/contract cases (single head, metadata parity, downgrade/upgrade,
  contract reproduction): **4 passed**. Uvicorn on 8200: upgrade 0001→0002 on seeded data, seed ×2, edit, stale 409.
- MSW browser demo (not DB evidence): `pnpm exec playwright test --config tests/workflows/playwright.config.ts`
  → **6 passed in 15.3 s, 0 retries** (storefront smoke + 2 Studio scenarios × desktop 1440 / mobile 390).
- `pnpm check` pass; `pnpm build` pass; Gitleaks v8.28.0 on changed directories: no leaks. No unit tests run/added.

Preview: https://dzirent-klq31u6o9-vivekkallakuri-8617.vercel.app/studios — `dpl_F9iVYUwGbpzrFKQft6BwHLGkmRST`,
target preview, READY, uploaded from a clean worktree at `ead93c7` (Vercel records no commit SHA for CLI uploads).
Dry-run file list inspected (261 files; no `.tools`/`.env`/`.vercel`). `vercel curl` (authenticated) returned 200 for
`/studios`, `/studios/sample-lender`, `/lender/studio`, a seed PDP and `/`. Unauthenticated access is 401 under the
project's existing preview protection (unchanged), so the preview itself was not browser-tested. No production
alias/protection/DNS/Git-guard change; `dzirent.vercel.app` still serves the previous release. The preview uses the
old shell; the header "Explore Studios" link arrives with Codex's PR (#15).

Boundaries / handoffs:
- No hosted database or identity; connected mode stays fail-closed. Demo persistence is per browser session (MSW).
- Cross-lane (user-approved): one token in integrator-owned `scripts/validate_foundation.py` so `put` operations
  are counted. Integrator may accept or replace it.
- Antigravity (later, combined QA): legacy manual `tests/contracts/api-smoke.spec.ts` pins `0.1.0-candidate.1`
  and Phase 0 readiness; realign it to `0.1.0-candidate.2`. No QA work was started here.
- Codex: no Codex-owned files edited; Studio pages don't import `product-card.tsx` or rely on PDP markup.

Next action: review of #19 after #17 merges; integrate with Codex's candidate; then Antigravity combined QA.

## Archive: API-1 Phase 1B backend (merged as #11)

Issue [#3](https://github.com/Vivek-k24/Dzirent/issues/3); PR [#11](https://github.com/Vivek-k24/Dzirent/pull/11), merged 2026-10-19 (`4c16517`).
FastAPI/SQLAlchemy/Alembic Phase 1 schema (`0001_phase1_schema`), restricted idempotent seed, public catalog,
own-profile/preferences/lender enrollment and owner listing CRUD with row-locked versioning, Clerk SDK verification,
error envelope, redacted logs, readiness, Docker runtime. Validation then: 254 PostgreSQL tests passed; static,
contract, fixture and dependency checks passed. Remaining from that milestone: no live Clerk instance or hosted
database/services; no 429 rate limiting, create idempotency keys, uploads or Sentry; issue #4 occasion/fabric
filters pending confirmation.
