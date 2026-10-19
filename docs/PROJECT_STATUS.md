# Project status

Current update: 2026-10-18 (America/Chicago), Codex integrator.
Milestone: **Phase 1A local presentation candidate validated; review/public-preview gates remain**.

Web PR: [#5](https://github.com/Vivek-k24/Dzirent/pull/5), branch `codex/web-phase1`, stacked on
`bootstrap/foundation`. Validated implementation artifact: **e238261fec9789940e71e4a6ba28ede256bc212b**.
Immutable presentation candidate: `demo-v0.1.0-rc.1`; resolve the final metadata head using
`git rev-parse 'demo-v0.1.0-rc.1^{commit}'`. Foundation base:
**37957823213cd2b25e980edad5058becdf9a7fbb** (`foundation-v0.1.0`), contract **0.1.0-candidate.1** unchanged.
Foundation PR [#1](https://github.com/Vivek-k24/Dzirent/pull/1) is still open; neither PR was merged.
Explicit user activation authorized preparing each role candidate while that review remains outstanding.

Delivered: four-section responsive PLP; eight collections and keyboard/touch menus/drawer; search/location;
URL facets, draft filters, stable sorts and grid/list; all 40 canonical outfits with local licensed illustrative
photos and self-hosted fonts; PDP/size/four-day dates; bag/non-transactional preview; fixed-sample auth and
renter enrollment; lender create/edit/draft/publish/archive/date blocks/availability with failure recovery/reset.
One API adapter, no connected mock fallback. Loading/image/empty/error/not-found and overlay-focus behavior verified.

Actual checks: frozen install, `pnpm check` (14 web / 8 Python tests plus static/contract/fixture checks),
production build, media integrity and dependency audit passed. Built-server Chromium full workflows and
Chromium/Firefox/WebKit 390/768/1100/1440 catalog/axe checks passed. Demo-to-connected browser restart
verified old worker removal, bag isolation and visible API failure. GitHub foundation/security/CodeQL checks
passed at the immutable implementation SHA. [Validation and screenshots](../apps/web/VALIDATION.md).

| Lane | Assigned branch / directory | Next task |
| --- | --- | --- |
| Codex / WEB-1 #2 | `codex/web-phase1` / `H:\DziRent\worktrees\codex-web`, port 3000 | Review #5; integrate only approved PRs serially; authorize/test public preview before declaring public Phase 1A complete |
| Claude / API-1 #3 | `claude/api-phase1` / `H:\DziRent\worktrees\claude-api`, port 8000 | Separately claimed; approved connected API/DB/identity handoff, candidate contract adoption; no API PR integrated |
| Antigravity / QA-1 | `antigravity/qa-phase1` / `H:\DziRent\worktrees\antigravity-qa`, web 3100 / API 8100 | Framework branch available; align/run independent acceptance against the web candidate and submit reviewable QA PR |

`pnpm dev:web` starts the complete local demo with no provider account/API/DB. `pnpm dev:api` starts the
foundation API; `pnpm dev:qa:web` / `pnpm dev:qa:api` retain separate ports. Use the pinned versions in README.
No other worktree/main checkout, API/schema/migration, canonical contract/fixture, independent QA/CI file
or other-agent log was edited here. No approved external PR was integrated.

Remaining: foundation/web approval, Antigravity independent acceptance, deployment authorization and target
Vercel team/project access. Both automatic-deploy guards stay false. No deployment, DNS, new cloud service,
native app, reservation, payment or business integration. Connected provider dependencies are concrete in
[preview setup](../apps/web/DEPLOYMENT.md) and do not block local mock work.
[Contract request #4](https://github.com/Vivek-k24/Dzirent/issues/4) records missing optional Occasion/Fabric
filters; current menus use informational metadata without inventing API parameters.

## Archived Phase 0 handoff

Date: 2026-10-18 (America/Chicago). Owner: Codex integration owner.
Milestone: **Phase 0 candidate foundation; ready for review after recorded checks**.
Phase 1A/1B/native/realtime work has not started.

Repository: https://github.com/Vivek-k24/Dzirent. PR base:
`bb77fb86b53b2086caf5a65f99614170a2d2c371` (preserved user commit on main).
Candidate baseline: immutable `foundation-v0.1.0` tag; exact full SHA is given by
`git rev-parse 'foundation-v0.1.0^{commit}'` and the foundation PR head.
Contract version: **0.1.0-candidate.1**. This is a proposed freeze, not an assertion of prior joint approval.
Implementation artifact commit: `8108879639ccb17b50e076a9e0f8d14f5c081cef` (immutable local/CI evidence).
Foundation PR: https://github.com/Vivek-k24/Dzirent/pull/1. The final tagged candidate additionally
records this evidence and disables attached automatic Vercel deployments.

Delivered: workspace/version baseline and exact lockfiles; minimal Next status shell/API health;
candidate schema-only OpenAPI with generated TypeScript; deterministic 8-root/40-leaf/40-garment
manifest with one lender and 21 operation examples; canonical modes and startup guards; root scripts,
ownership/agent handoff, architecture notes, first CI/security configuration and actual bootstrap validation.

Read [validation](qa/bootstrap-validation.md) for real commands/results and untested checks.
Artifact Linux foundation CI and dependency/Gitleaks/Trivy/CodeQL checks passed at the immutable
implementation SHA above; final PR-head checks are visible on PR #1.
No full application, CRUD/database schema/migrations, provider authentication, cloud service,
deployment, DNS, native build, reservation or payment work was performed. Readiness remains 503.
An attached Vercel integration automatically attempted and failed a deployment on the initial push;
no deployment command was invoked by the agent. Root/web-app guards now disable automatic Git
deployments. Keep that external check distinct from the foundation/security CI results.

Merge gate: review ADR 0001's navigation/availability clarifications, candidate contract and fixture set;
review CI results, then merge the foundation. All roles subsequently start from the **same exact**
tagged SHA in separate worktrees; if review changes code, publish a new candidate tag and notify all roles.
Temporary bootstrap ownership then ends: Claude owns contracts/fixtures/API, Antigravity owns tests/CI.

| Agent | Status | First next task after merge |
| --- | --- | --- |
| Codex | Queued; `codex/web-phase1`, reserved `H:\DziRent\worktrees\codex-web` | Read all logs/contract, record exact base, claim WEB-1; MSW adapter/reset and licensed fashion images; PLP/URL/navigation |
| Claude | Queued; `claude/api-phase1`, reserved `H:\DziRent\worktrees\claude-api` | Adopt contract/fixtures; migrations, deterministic restricted seeds and catalog; Clerk/owner CRUD implementation |
| Antigravity | Queued; `antigravity/qa-phase1`, reserved `H:\DziRent\worktrees\antigravity-qa` | Requirements-to-tests matrix, independent contract/browser checks, extend CI/runbooks |

No role worktree/branch has been activated or agent asked to edit shared files.
Startup commands and separate ports/databases: [README](../README.md) and
[ownership registry](architecture/ownership.md). Provider/media/reviewer dependencies:
[setup list](architecture/setup-dependencies.md). They do not block local mock development.
