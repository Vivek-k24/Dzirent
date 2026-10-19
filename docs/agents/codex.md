# Codex Phase 1A status

## COLL-2 / issue #15: rental collection candidate — 2026-10-19

Workspace: `H:\DziRent\worktrees\codex-web`; branch: `codex/rental-collections`.
Exact fixed base: `ffd4b96e4a24a741f0597faf514533f0c20bd33b` from coordination PR #17.
The issue's launch amendment authorizes this unmerged baseline; it supersedes the launch document's
assumed-merged wording. #17 is OPEN with all seven reported checks successful at the latest read.
Do not merge either PR from this lane. Previous branches, user work and presentation tags are preserved.

Implemented: two normal route links with active indicators, warm neutral tokens/surfaces, rental catalog
introduction, eight-root/five-leaf category tree, default-open/collapsible desktop sidebar and accessible
mobile drawer. Real parent checkboxes preserve repeated-category filtering; leaf buttons select one
subcategory. Filters/chips/draft apply-discard, URL history/reload, search and actual grid/list remain.
The UI requests newest explicitly, while shared parsing and API sort meanings/defaults remain unchanged.
All sort choices serialize explicitly so selecting Featured survives the UI's different initial default.
Removed hero/offer/editorial/mega-menu/pill layout and prominent retail/location clutter from owned paths.

The shared shell always renders `DEMO ONLY. NOT A REAL BUSINESS.` in either mode. `Only in Texas` appears
at the catalog introduction. Delivery ZIP is an optional saved preference, never an inventory filter;
legacy metro/ZIP query parameters are ignored by the UI adapter. No ZIP map, city selection or estimate
is fabricated. Listing CRUD retains its hidden legacy `metro_id` for wire compatibility. Full verified
address migration and delivery service integration remain pending; no contract or API edits were made.

PDP diagnosis: the existing public seed `/products/demo-women-dresses-01` returned 200, while its encoded
equivalent `/products/%64emo-women-dresses-01` returned 404. The routing guard compared a raw encoded
pathname with decoded seed slugs. Decode once before the existing guard; photo/title links share a
canonical encoded href. No catalog/auth backend was added. All 40 published photo/title links and direct
reloads now pass, including unavailable outfits; genuine missing outfits still return HTTP 404.

Actual local validation (Windows, Node 22.23.3, pnpm 10.29.3, Python 3.12.15, uv 0.13.1):
- `pnpm install --frozen-lockfile`: passed; dependencies and lockfiles unchanged.
- `pnpm check`: passed once (lint/types, 40 licensed media/two fonts, Ruff/mypy, contracts and fixtures).
  No unit tests or broad API matrix ran. The shared-parser correction received focused ESLint checks.
- `pnpm audit --audit-level high`: passed, no known vulnerabilities.
- Explicit-demo `pnpm build`: passed. Final review then found Featured could be omitted from the URL;
  after correcting that serialization, affected ESLint and production build passed again.
- `pnpm exec playwright test --config tests/workflows/playwright.config.ts`: six passed in 1.5 minutes,
  zero retries, Chromium 1440/390 only. Two new scenarios plus existing smoke; all 40 published outfits
  tested per width, with image loading, correct title/photo targets, reloads, encoded link and true 404.
- After the sort correction, only the affected collection-tree/filter scenario reran at both widths:
  `pnpm exec playwright test --config tests/workflows/playwright.config.ts tests/workflows/collections.spec.ts --grep 'collection tree, rental filters'`:
  two passed in 8.8 seconds, including Featured and price/newest ordering. Unchanged PDP evidence reused.
- No captured uncaught browser exceptions, failed media/assets or page overflow in those scenarios.

Startup: `pnpm install --frozen-lockfile`, then `pnpm dev:web` (explicit local demo, port 3000).
Production reproduction: set `NEXT_PUBLIC_DZIRENT_MODE=demo`, run `pnpm build`, then
`pnpm --filter @dzirent/web start --port 3300`. No API credentials are needed for mock work.
Owned diff only: assigned shell/catalog/filter/PDP/location/listing/client/token paths, two-scenario
workflow file and this log. No root/CI/dependency, Claude contract/fixture/MSW/Studio or other-log edits.

Delivery: implementation SHA, PR/CI state and exact-SHA unique demo preview evidence follow in the
handoff record. Vercel account/team and existing `dzirent` project verified; dry packaging excludes
credentials/caches and includes the licensed sample assets. No production/DNS/protection/guard changes.
Pending cross-lane route: `/studios` intentionally awaits Claude's PR, with no duplicate route stub.
Independent Antigravity verification is deferred until the user launches it after both lanes are ready.

## REL-1 release completed — 2026-10-19

PR #13 merged frontend #5, backend #11 and QA #12 with their histories intact at
`baf04b67ccaede358b3e4aab526c0b6889bb09bb`. Candidate `8c6ae70946d52cbcab9280bb11f7348c36f57071`
passed 156 browser/accessibility checks, 258 PostgreSQL API tests, foundation/contract/security gates,
and local static/unit/build checks. Public demo: https://dzirent.vercel.app/.
Production deployment `dpl_EinNXwHamr1YpjVnvMqQmm737RXe` was staged, tested and promoted; public
smoke passed catalog/search/reloads/bag/sample auth/lender mock CRUD/reset with no application errors.
Preview protection and Git deploy guards remain. No DNS or connected-provider hosting was added.
Full evidence and limitations: `docs/qa/release-integration.md`. Documentation follow-up branch
`codex/release-record` starts at the exact merged/deployed SHA above; no code or dependency changes.

## Section 13.2 integration continuation

Continuing WEB-1 / #2 under explicit user authorization to integrate reviewed frontend/QA and deploy
the verified demo to the existing dzirent Vercel project. Workspace and branch remain
`H:\DziRent\worktrees\codex-web` / `codex/web-phase1`; clean starting SHA
`47f8aa1f3c2aa7be41384eb34ca8af9df787a377`. Read the full brief, root/web AGENTS, current
architecture/contracts/modes/fixtures, all local logs plus the remote QA log and API issue, PR/CI state.
Foundation #1 is merged at `2ff5cae77ec165637ae02fade6d4619826760f28`. Ordinary merge produced
`44e408602e54573b4d208aaed5f556c4a51ae406`; PR #5 now targets main. Tree comparison with
`demo-v0.1.0-rc.1` passed (exit 0); protected-owner diff is empty. The prior tag remains unchanged.

Independent Antigravity QA is explicitly delegated in its own clean checkout under QA-2 / #10. Its
tests/report/CI/runbooks stay QA-owned; defects go to Codex. All six GitHub checks passed at the
reconciled frontend SHA. Local `pnpm check` is in progress, not yet claimed passed. Current edits
record the reviewed release/rollback plan and ignore local Vercel link files; no dependency upgrade,
application behavior, canonical contract/fixture or API change is included.

Verified Vercel CLI 59.23.2 account/team/project and GitHub association read-only. Existing project
uses repository root, Other framework, Node24 and obsolete `bootstrap/brief` production branch; planned
corrections are in apps/web/DEPLOYMENT.md. No guard relaxation is needed for deliberate CLI deployment.
No release URL or applied provider settings are claimed yet. No DNS/new services/payment action.
Next: review/test exact frontend-plus-QA candidate, merge frontend then QA, check integrated main,
stage and independently verify the authorized demo, promote/test audience access, tag and document release.

Release preparation finding: the CLI dry run would package 6,476 files / 331,871,220 bytes, including
ignored `.tools` caches and test artifacts. It uploaded nothing. Added root `.vercelignore` as the smallest
packaging fix; validate exclusions and required assets with another dry run before deployment. Application
code/dependencies are unchanged. Existing Vercel root/framework/Node/workspace/build settings have now been
corrected; the explicit project link is ignored. The CLI-created local env file was removed without reading
its value and its redundant .gitignore additions were removed. No deployment has been performed.

QA coordination: another external Antigravity session was already active in its assigned checkout. The
delegated helper stopped all edits/own processes and invalidated its interrupted browser run. User confirmed
the existing Antigravity session is the sole QA writer; #10 records the handoff. Its completed 15 contract
checks/source review do not substitute for the sole writer's final full browser report. Preserve all QA work.

## Archived original candidate handoff

Task / GitHub issue: [WEB-1 / #2](https://github.com/Vivek-k24/Dzirent/issues/2), claimed by Codex.
Branch: `codex/web-phase1`. Workspace: `H:\DziRent\worktrees\codex-web` only.
Base SHA: `37957823213cd2b25e980edad5058becdf9a7fbb` (`foundation-v0.1.0`).
Validated/pushed implementation artifact: `e238261fec9789940e71e4a6ba28ede256bc212b`.
Presentation tag: `demo-v0.1.0-rc.1` (immutable; final metadata head resolves through the tag).
Review PR: [#5](https://github.com/Vivek-k24/Dzirent/pull/5), stacked on foundation PR #1.
Owned paths: apps/web/**, packages/client/**, packages/design-tokens/**, integration root manifests/lockfile,
this log and docs/PROJECT_STATUS.md. No API, canonical contract/fixture, QA or other-agent log edits.
Milestone/status: Phase 1A local release candidate validated; public-preview gate incomplete.

The user explicitly activated this role on 2026-10-18. The assigned directory was empty; initialized an
isolated checkout directly on the assigned branch from the tagged baseline, without switching branches
or editing the main checkout. Foundation PR #1 was still OPEN; acceptance/merge remains an integration
dependency. Current explicit user activation authorizes preparation of this reviewable web candidate.

Read before edits: full brief, root/web AGENTS, architecture/ownership/version notes, contract notes/modes,
wire models, canonical taxonomy/manifest/example metadata, project status and all three agent logs.
Contract: `0.1.0-candidate.1`, consumed unchanged; no generated types hand-edited.
Implemented: typed transport, canonical URL/date/money helpers, cart eligibility, contract-shaped MSW
catalog and owner CRUD/reset/failure simulation, forty locally bundled licensed photographs and two OFL fonts.
UI pages, catalog/navigation, dialogs, PDP/bag/preview and lender forms are implemented.
Checks on Windows / Node 22.23.3 / pnpm 10.29.3 / Python 3.12.15 / uv 0.13.1: frozen install,
`pnpm check` (14 web tests, 8 Python tests, Ruff/mypy, generated-contract and fixture checks),
`pnpm audit --audit-level high`, production build and media integrity checks passed.
Production-server Chromium 156 end-to-end demo workflows passed, including form/overlay focus checks.
Firefox 157 and WebKit 27.2 passed production catalog/accessibility checks at 390/768/1100/1440 with zero console errors.
Loading/image/404 checks passed; same-browser demo-to-connected restart passed with no mock fallback.
Earlier failures found/fixed: MSW 3 Node-blocked browser export, text contrast/visible labels,
WebKit hydration timing, streamed 404 status, overlay focus and a cold dev route assertion timeout.
Removed redundant demo-control home navigation. Production replay and PR publication are complete.
GitHub checks at the implementation artifact passed: foundation, dependencies, secrets, source-scan and CodeQL.
No public preview exists. [Actual validation/evidence](../../apps/web/VALIDATION.md).
Contract request: Occasion/Fabric metadata has no filter parameters; menus show informative text and do not
invent query semantics. [Request #4](https://github.com/Vivek-k24/Dzirent/issues/4) is queued for Claude.
Latest coordination read: API-1 [#3](https://github.com/Vivek-k24/Dzirent/issues/3) is separately active under
explicit user instructions. QA branch `75d7184f3d03189e0d6187b4cbf7a97d0fdddc58` was inspected read-only;
its baseline-gated acceptance tests need final-UI selector/navigation/auth alignment before independent acceptance.
No approved API/QA PR is available or integrated. Other-agent files and logs are unchanged.
Next: review foundation #1 and web #5, then independent QA against this candidate and an explicitly authorized
Vercel preview. Keep the presentation tag stable during later approved Phase 1B adapter integration.
No deployment authorization; keep no-deploy guards. No role-agent delegation requested or started.

## Archived bootstrap handoff

Task / issue: BOOT-0, integrator-controlled Phase 0 bootstrap claim; no role implementation issue yet.
Branch: `bootstrap/foundation`. Phase 1 reservation: `codex/web-phase1` in `H:\DziRent\worktrees\codex-web`.
Base SHA: `bb77fb86b53b2086caf5a65f99614170a2d2c371` (preserved user main commit).
Current pushed SHA: resolve the reviewed foundation PR head / immutable `foundation-v0.1.0` tag after push.
Immutable implementation artifact: `8108879639ccb17b50e076a9e0f8d14f5c081cef`; PR #1 targets main.
Owned paths: all initial bootstrap artifacts temporarily; post-merge ownership is in architecture/ownership.md.
Milestone/status: Phase 0, ready for review after validation; role Phase 1A has not started.

Implemented behavior: workspace tooling, status page, API health (ready=503), schema-only candidate
contract, deterministic taxonomy/40-item fixtures, type generation, mode guards, ownership/docs and first CI.
Files changed: review foundation PR diff; no application CRUD or external provider/deployment behavior.
An attached integration's failed automatic Vercel check was observed; repository guards disable automatic Git deployments.
Contract: `0.1.0-candidate.1`; candidate clarifications in ADR 0001 require baseline review.
Checks: exact commands/results/environment and known earlier failures are in `docs/qa/bootstrap-validation.md`.
Failures/blockers: Phase 1 acceptance is unimplemented/unrun; photography is placeholder; providers unconfigured/unverified.
Requested owner changes: Claude adopts canonical contracts/fixtures on merge; Antigravity takes independent verification/CI.
Next action: stop for foundation review. After merge resolve exact common tag SHA, create isolated worktree,
claim WEB-1, run `pnpm dev:web` on 3000, implement Phase 1A only. Never infer connected success from mocks.
