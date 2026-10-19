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

Candidate `4c1651752e289a580e688cd5d9adc66286a25183` passed foundation, security,
independent contract smoke, and all **258 PostgreSQL API tests** in GitHub Actions. Its full
browser matrix passed 150 checks and found six instances of the same mobile/tablet loading-nav
keyboard accessibility failure. The scrolling region now accepts keyboard focus; assertions
remain unchanged. The protected hosting build identified Node 22.23.2 versus the exact 22.23.3
engine constraint; the compatible Node 22 patch range is now documented in ADR 0003.

## Verified release

- Reviewed candidate: `8c6ae70946d52cbcab9280bb11f7348c36f57071`.
- Integrated main/deployed SHA: `baf04b67ccaede358b3e4aab526c0b6889bb09bb` (PR #13).
- Both commits have tree `2de479c05a32089d5787ad828f471852d0a4447d`.
- Frontend PR #5, API PR #11 and QA PR #12 are merged by preserved ancestry.

### CI at the exact candidate

| Gate | Result | Evidence |
| --- | --- | --- |
| Browser acceptance/accessibility | 156 passed, zero failed, 7.7 min | [Job 117886887326](https://github.com/Vivek-k24/Dzirent/runs/117886887326) |
| PostgreSQL API integration | 258 passed, one dependency deprecation warning, 31.93 s | [Job 117886886563](https://github.com/Vivek-k24/Dzirent/runs/117886886563) |
| Foundation | Passed | [Job 117886886362](https://github.com/Vivek-k24/Dzirent/runs/117886886362) |
| Independent contract smoke | Passed | [Job 117886887456](https://github.com/Vivek-k24/Dzirent/runs/117886887456) |
| Secrets/dependencies/source scan/CodeQL | Passed | PR #13 checks at candidate SHA |

Browser command: `pnpm exec playwright test --config tests/e2e/playwright.config.ts`, following
`pnpm build` in demo mode. Matrix: Chromium, Firefox and WebKit at 390/768/1100/1440 px.
Database command: frozen `uv run` pytest against disposable PostgreSQL 17.11 with
`DZIRENT_REQUIRE_DB_TESTS=1`; database tests did not skip. Local `pnpm check` was repeated after
fixes and the production build also passed under Vercel-compatible Node 22.23.2.

### Hosting and public smoke — 2026-10-19 UTC

Project: `dzirent` / `prj_hG63XH3glAqy9VcyMvLNnY4CLsnI`, existing team
`team_Ur6AwuUGgeBixSwdnTTrTECE`. Root `apps/web`, workspace source access enabled, Next.js,
Node 22.x, frozen pnpm install, explicit `NEXT_PUBLIC_DZIRENT_MODE=demo` build.

Protected preview `dpl_8hZDdLc8kFvwpYW11wWcVdWtdu9q` built the reviewed candidate and passed
catalog/PDP/bag smoke. The API cannot directly promote a preview without a production build;
its attempted promotion returned 422 and made no release. A separate **production-target** build
was staged from merged SHA `baf04b6` with automatic domain assignment disabled, then tested and
promoted successfully without another build:

- Production deployment: `dpl_EinNXwHamr1YpjVnvMqQmm737RXe` (READY).
- Unique deployment URL: `https://dzirent-13itnyoad-vivekkallakuri-8617.vercel.app` (protected).
- Public presentation URL: **https://dzirent.vercel.app/**.
- Alias lookup confirmed that exact production deployment ID after promotion.
- Project Standard Protection remains enabled for preview/unique deployment URLs. Production
  presentation aliases are public. Both committed Git auto-deployment guards remain false.
- No DNS, new cloud service, hosted backend/database or identity-provider setup was performed.

A fresh public-origin browser tab loaded the catalog without a Vercel share query or sign-in.
An unauthenticated HTTP request returned 200 and the expected application title. Browser smoke
verified 40 products, query search with one matching saree, shared-filter reload, PDP deep-link
reload, size selection, add-to-bag/badge, cart, read-only checkout preview, sample renter return
navigation, sample lender dashboard with 40 rows, disposable mock create/edit/availability/archive,
and reset restoring 40 products and an empty bag. No application console errors were observed;
unrelated Chrome-extension metadata errors were excluded by their extension source URL.

Vercel runtime error/fatal scan over the last 30 minutes returned no matching logs. Drains inspection
returned 404, so external log forwarding/monitoring is **unverified**, not claimed configured.
The full 156-check matrix ran in CI against the same code tree; the deployed smoke was the browser
subset listed above, not a second full deployed matrix or physical iPhone/Android test.

![Verified public demo](assets/presentation-release-2026-10-19.jpg)

### Remaining boundaries

This release is demo mode. Live Clerk, hosted API/PostgreSQL and connected browser-to-database
persistence remain outstanding. Prices, ratings and availability are sample data; no booking,
payment, tax engine or payout is live. The new release is pinned by immutable commit/deployment IDs;
no new `demo-v0.1.0` tag was published because the authenticated GitHub integration does not expose
tag creation. Existing candidate tags were preserved. For rollback, this verified production deployment
is the reference; the earlier brief-only production build is not a tested application rollback.
