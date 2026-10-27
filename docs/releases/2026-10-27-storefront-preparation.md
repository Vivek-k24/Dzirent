# Storefront preparation and inactive email handoff — 2026-10-27

Owner-authorized safe work while infrastructure/email gates remain unresolved.
Claim [#72](https://github.com/Vivek-k24/Dzirent/issues/72), parent [#70](https://github.com/Vivek-k24/Dzirent/issues/70).
This is a local/demo implementation candidate for review, not a production release or completed connected application.

## Baselines and integration boundary

- Isolated worktree: `H:\DziRent\worktrees\codex-storefront-release`.
- Branch: `codex/storefront-release-20261027`.
- Exact parent: `1d48763ed8c4a43b8fb690233d74c92264af617b`, draft [#71](https://github.com/Vivek-k24/Dzirent/pull/71).
- Fetched main remains `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`.
- Initial implementation: `2d0d160f9a78b0efaeff16600f4a8a72a966c1a5`.
- Corrected application: `c98732116678f138f69d49aca2fd851412c2bc35`.
- Final assertion fix: `da3500e19c2cad9690c1fd5b5556f91a565f1851`; publication head/CI are recorded on the draft PR.

Review against the #71 branch so the diff contains only this slice and inherits both disabled Vercel guards.
No branch/history/worktree of the owner or another agent was changed. No agent was started.
Native-auth #61 and six-Studio #65 remain separate drafts; #66 is still subject to its post-auth dependency.
No schema, API signature, generated OpenAPI/client type, dependency pin or lockfile changed.
Frozen contract remains `0.1.0-candidate.2` on this preparatory baseline; fixture content becomes `0.1.1`.

## Implemented behavior

- Removed the top prototype bar, public Demo controls/modal, reset button and error-injection actions.
  Runtime context no longer exposes those actions. Removed stale styles and the credits-page reference
  to the deleted control. Kept the footer and checkout's truthful sample/no-transactions disclosures.
- Corrected the sticky category rail after banner removal. A cleaned-up `ResizeObserver` measures the
  real shell height; the rail and anchor-scroll offset use that value across layouts.
- All **40** canonical four-day base rentals are integer USD cents, **1800–4000**, with **12 distinct
  prices** and **zero above 4000**. All lie within existing Band A. A/B/C/D definitions remain unchanged;
  valid future lender prices are not capped. A focused form test still accepts 25000 in Band D.
- Generator audit confirms product IDs/slugs, image assignments, availability, dates, titles/brands,
  retail values and every other per-product field are preserved. Only rental amount/band and the fixture
  content version change. Taxonomy, OpenAPI, generated types and both lockfiles are byte-identical.
- Saved demo bags refresh known canonical price/band/currency before demo readiness. Dates, keys, saved
  looks, ZIP and noncanonical lender-created entries remain intact. Connected mode refuses this sample
  refresh and never substitutes fixtures for an API failure.
- Studio wardrobe cards now display the shared four-day rental amount. Their existing 24-item pagination
  is preserved; the browser check follows Load more and audits all returned prices against the fixture.

Image authenticity/curation was **not** completed here. Existing photos, IDs and provenance records are
preserved; passing manifest/checksum validation does not certify garment/title/color truthfulness or
satisfy the master's replacement/curation requirement. Secure real upload/storage implementation also
remains pending, as does native-auth/Studio integration and independent combined-candidate review.

## Exact changed paths relative to #71

- `.github/workflows/foundation.yml`
- `apps/web/src/app/credits/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/providers.tsx`
- `apps/web/src/components/shell.tsx`
- `apps/web/src/components/studios/studio-profile.tsx`
- `apps/web/src/lib/store.test.ts`
- `apps/web/src/lib/store.ts`
- `apps/web/src/mocks/bootstrap.tsx`
- `fixtures/catalog/README.md`
- `fixtures/catalog/examples.json`
- `fixtures/catalog/generate.py`
- `fixtures/catalog/manifest.json`
- `scripts/validate_foundation.py`
- `tests/contracts/taxonomy-fixtures.spec.ts`
- `tests/workflows/collections.spec.ts`
- `tests/workflows/release-storefront.spec.ts`
- `docs/PROJECT_STATUS.md`
- `docs/agents/codex.md`
- `docs/architecture/ownership.md`
- `docs/releases/2026-10-27-storefront-preparation.md`

## Outbound email remains disabled

Owner confirms no authorized outbound sender/account or populated SMTP configuration is verified.
`no-reply@dzirent.com` is a **proposal only**, not an existing or authorized mailbox/alias.
Google MX routing is not evidence of SMTP authority; no assumption is made about an admin address.

The proposed external SMTP path was checked before creation; it was absent. Created only an inactive,
credential-free template under the existing directory restricted to the current Windows user and SYSTEM.
Creation used an exclusive `CreateNew`; subsequent corrections applied only while its complete contents
still matched the newly created blank template under an exclusive lock. Existing user changes/secrets
would have been preserved. Neither private file contents nor credentials enter Git or a deployment.

`DZIRENT_AUTH_EMAIL_BACKEND=disabled` and `DZIRENT_AUTH_EMAIL_WORKER_ENABLED=false`.
Sender, authenticated SMTP credentials and outbox key fields are blank. Port/TLS use typed inactive
defaults; they are not provider verification. A blank web-origin override initially failed native settings
validation; it was removed from the unchanged template. The exact HTTPS origin belongs in protected
API settings. Final settings-only validation with #61's native configuration passed while confirming
backend/worker disabled and no sender, credentials or outbox keys. No SMTP socket/login/mail was attempted.

Keep delivery disabled until sender ownership/alias rights, authenticated provider access, TLS and
independent encryption keys are ready. Public registration remains disabled/fail-closed; no verification
bypass or public-onboarding activation is included. SQL settings were also still blank at the read-only
check at **20:46:33 UTC**, so **no hosted SQL connection** or migration/CRUD/account operation occurred.
The guarded helper returned exit 2 (`blocked_private_values_pending`), with `sql_attempted=false`;
this is a dependency finding, not a passing SQL check.

## Actual validation

Pinned Windows toolchain: Node 22.23.3, pnpm 10.29.3, uv 0.13.1, Python 3.12.15.
All checks use this isolated candidate; no hosted database fixture or real email transport.

| Command / check | Actual evidence |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | Passed; 355 cached packages, zero downloads, lock unchanged. |
| `uv sync --directory services/api --frozen --python 3.12.15 --offline` | Passed; pinned API environment, no lock/dependency edit. |
| Baseline `python fixtures/catalog/generate.py --check` | Passed before edits; preserves a known deterministic starting point. |
| `pnpm check` | Passed: guard, ESLint, TypeScript, media/checksums, Ruff, mypy, generated contract drift, schemas and deterministic fixtures. |
| Focused Ruff/format and `python scripts/validate_foundation.py` after reducing formatter-only churn | Passed from the API's configured directory. A root-directory explicit-config lint attempt classified an unchanged import differently; the real project command passed without changing the import. |
| `pnpm test:web` initial run | 14 existing tests passed; one fork worker failed to start before the four new tests ran. Exit 1, not a passing full run. |
| `pnpm --filter @dzirent/web exec vitest run src/lib/store.test.ts --maxWorkers=1 --pool=threads` | Four new tests passed: persisted update/preservation, unchanged-bag stability, connected isolation, higher lender price. Prior 14 unchanged test results reused. CI adds only these four focused tests. |
| `DZIRENT_SKIP_WEBSERVER=1 pnpm exec playwright test tests/contracts/taxonomy-fixtures.spec.ts --config tests/contracts/playwright.config.ts` | Five passed; file/schema checks only, no API server/database connection. |
| `NEXT_PUBLIC_DZIRENT_MODE=demo pnpm build` at initial/corrected sources | Both passed. Corrected build includes TypeScript and all routes. |
| Focused ESLint and `git diff --check` after browser correction | Passed. |
| Canonical preservation/price audit | All 40 audited, 40 unique IDs, 12 prices, 1800–4000, zero above cap; nonpricing fields and frozen artifacts preserved. |
| Inactive SMTP settings validation | Initial empty-origin error corrected; final backend/worker disabled checks passed, no transport invoked. |

Initial browser command at the initial implementation, using its built demo:
`CI=1 NEXT_PUBLIC_DZIRENT_MODE=demo pnpm exec playwright test --config tests/workflows/playwright.config.ts`.
**8 passed / 4 failed**. Demonstrated issues: old desktop rail offset; new Studio test omitted pagination
(two viewport failures); one desktop PDP reload exceeded the 12-second assertion timeout while showing
its loading state. The mobile all-40 reload test passed. Initial artifacts were preserved in ignored
`.tools/storefront-evidence/initial-browser/`; the offset and pagination were corrected without weakening
assertions or increasing retries/timeouts. Do not claim an underlying cause or fix for the single PDP timeout.

Further bounded browser evidence, retained without claiming a resolved root cause:

- First corrected full run at `c987321`: **9 passed / 3 failed**. The rail passed. Two new Studio
  assertions had a test-only USD parser bug: `$30 · 4-day rental` became 30400 by stripping every
  nondigit. The parser now extracts only the first dollar amount. One desktop PDP reload again
  remained at its loading screen beyond 12 seconds. Mobile's all-40 case passed again.
- Original desktop all-40 case alone: failed once at the same loading assertion, then a later
  isolated run passed (its `.last-run.json` reports passed). Two ignored diagnostic probes, including
  the same photo/reload/home/title sequence at 1440x900, each passed all 40. Instrumented success is
  not proof that the intermittent issue is fixed. No speculative dependency/startup change was made.
- Final corrected full run: **12 passed / 0 failed / 0 skipped**, retries **0**, **160.438 seconds**,
  started **2026-10-27T20:44:44.942Z**. Command:
  `CI=1 NEXT_PUBLIC_DZIRENT_MODE=demo PLAYWRIGHT_JSON_OUTPUT_FILE=<ignored-local-report> pnpm exec playwright test --config tests/workflows/playwright.config.ts --reporter=line,json`.
  The application/build is `c987321`; the corrected assertions are committed in `da3500e`.
  Temporary failure-only read-only diagnostics were inactive on this successful run and removed
  before publication; no runtime/assertion/time budget was changed by their removal.

The final run covers measured rail placement, all 40 PDP/photo/title links and refreshes in each
viewport, URL filters/history, sample renter/lender Studio workflows, persisted bag-price upgrade and
checkout refresh, complete paginated Studio prices, no public controls, no overflow, keyboard skip
navigation and header WCAG A/AA checks. The JSON report is ignored local evidence at
`.tools/storefront-evidence/corrected-browser.json`; it reports zero unexpected, skipped and flaky
results in that run. **Earlier repeatable/intermittent desktop loading failures remain an unresolved
risk** for independent combined-candidate review; do not present the final green run as a causal fix.
No retry/timeout inflation or assertion suppression was used.

This is local demo evidence, not independent approval, connected auth persistence or a public release
test. CI must be read against the draft's exact publication head. Checks on the parent #71 source do
not validate this child; cancellation/skipped/unrun commands are never counted as passed.

Not run: live SMTP/mailbox tests; Azure SQL authorization/schema/CRUD/migrations; staging account/admin
provisioning; real storage/upload flow; native-auth full suite on this pre-auth baseline; combined #61/#65
regression; public release/rollback exercise. No Vercel, DNS, Azure or production configuration changed.

## Review startup, merge and rollback handoff

In this checkout, use the pinned tools, then `pnpm install --frozen-lockfile` and `pnpm deploy:check`.
Set `NEXT_PUBLIC_DZIRENT_MODE=demo`, run `pnpm build`, then
`pnpm --filter @dzirent/web start --port 3330` for review at `http://127.0.0.1:3330`.
The browser suite manages its own port 3300; it was not allowed to reuse another candidate's server.
Private SQL/SMTP settings are not needed by the local demo and must not be copied into web variables.

Keep this draft stacked on #71 until the owner's review/integration gates allow otherwise. Merge the
reviewed guard prerequisite before any partial main merge can auto-deploy; preserve the master's
auth → refreshed main → Studios/facets → combined storefront/upload → release order.
During reconciliation, retain #61's native session/verification/logout/provider logic. Apply only the
public-control removal and demo bag-price refresh around it; never replace auth files wholesale with
this older baseline. Retain #65's six-Studio partition/metadata and fixture-aware tests, the new rental
amounts/content version, then regenerate fixtures using the merged contract version. Resolve #66 only
after its auth dependency. Run affected checks and combined exact-source verification before approval.

No release/tag/merge occurred, so no application rollback is needed. Preserve the production deployment
recorded in the [infrastructure checkpoint](2026-10-27-production-readiness.md). Reviewable changes can
be held without touching production; if later released, deliberately roll back to the recorded compatible
deployment if needed. There is no schema change in this slice; do not downgrade auth data to roll back UI.
