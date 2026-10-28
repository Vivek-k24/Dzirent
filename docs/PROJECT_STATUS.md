# Project status

## Connection recovery Stage 2 — 2026-10-28, America/Chicago

**Stage 2 complete; SQL credentials recovered, not deployed.** Exact start
`19b850bb42102525590c792bed2a63487301813c`, own `codex/azure-backend-phase1` / draft #76.
Owner authorized password resets only for the two existing database roles after administrator login.
Administrator inspection passed at11:24 CDT; rotation/verification completed11:32 CDT.

Two independent secure passwords committed in one transaction, using client-generated SCRAM
verifiers. Both protected external files updated and checked, exact file ACLs retained, temporary
recovery copy removed. Independent CSRF/AES outbox material generated only in protected owner input.
Both **`dzirent_app` and `dzirent_migrator` logins passed** with verify-full/TLS1.3/PG17.11 and read-only
identity/schema/count checks. Existing native FastAPI database adapter also selected through
`dzirent_app`, without administrator/migrator runtime privileges.

Before/after role identities/attributes, memberships, database/schema/object/column/default/function
ACLs and ownership, RLS/role settings, effective permissions and all18 public table counts match.
Runtime still cannot CREATE database/schema or UPDATE migration history. **Schema remains
`0002_studios`, users0/products0; no application-data/schema write or migration.**

**Ready for Stage 3 planning, not hosted acceptance.** Native runtime expects0005; migrations need
review/authorization before execution. HTTPS hosting/cost/network/runtime-secret/origin configuration,
verified outbound email and a hosted private media provider remain unfinished. SMTP/worker/media
remain disabled; no public accounts or live website change. No new resource, deployment or merge.
[Actual commands, preservation evidence, limits and handoff](infra/azure-connection-recovery-2026-10-28.md).
Older SQL-authentication blockers below describe the October27 checkpoint and are superseded here.

## Azure backend Phase 1 — 2026-10-27, America/Chicago

**Highest-priority backend-only assignment; blocked on private SQL input, not deployed.**
Recovered guards+native-auth integration `83ba85525e6db23fb5af150c0c705d1fe13f4def` in isolated
`codex/azure-backend-phase1`. Reused #71/#61/#31; all 17 worktrees and one prior edit preserved.
No storefront/AI work or other agent activation. Main remains `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`.

**Completed:** built existing frozen backend image, non-root/read-only/network-disabled configuration/
crypto probe passed, automatic frontend deployment guards verified. No runtime/schema/dependency edit.
**Verified:** current VS Code Azure sign-in, Students credit available and both spending limits On,
existing PG17.11 Ready, CA/hostname-verified TLS1.3, intended DB and seven backup records. No HTTPS
host exists. Latest provider usage reports USD0 through Oct27; no new hosting resource/charge.
**Resumed 22:21–22:36 CDT:** owner populated both SQL URLs, then explicitly authorized local encoding
repair. Both password components saved using the known host boundary, preserving valid percent
sequences, credential semantics, other settings and file ACL. Saved-byte and exact-target/role/
verify-full/CA guards pass, but PostgreSQL still rejects authentication for both roles; final check
exit2, ready=false. No SQL login/results/writes; schema/privileges/CRUD/migration safety unverified.
Additional read-only hosting checks found advertised native Python 3.12/Linux F1 in North Central US
and published USD 0/hour hosting; provider remains unregistered and quota lookups failed404, so no
allocation/capacity claim or new resource. No host/deployment ID.
**Next:** accepted passwords for the existing roles, then SELECT-only SQL/recovery/security gates,
controlled migrations/HTTPS hosting/staging CRUD and restart/external checks. Stop after this phase.
The staging DB is not production isolation; no real public accounts or verification bypass.

Live demo remains unchanged. No cloud/SQL/network/billing mutation, migration/account/admin grant,
merge/deploy/DNS/tag change or live email. See [exact recovered sources, commands, image and blocker](infra/azure-backend-phase1-2026-10-27.md).

## REL-2 production integration checkpoint — 2026-10-27

Claim [#70](https://github.com/Vivek-k24/Dzirent/issues/70); isolated branch
`codex/production-integration-20261027`, exact main base
`c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`. All 11 prior checkouts/three object stores reconciled;
owner review and the old detached release's `.gitignore` edits preserved. No agent launched.

**Completed:** smallest-gap inventory and a concrete guard fix: both Vercel configs disable automatic
Git deployments, with `pnpm deploy:check` enforced by `pnpm check`. No dependency upgrade.
**Verified:** Azure Students authentication/credit/spending limits; existing PostgreSQL 17.11 Ready,
certificate-verified TLS 1.3, intended database and seven listed backups. Reported existing usage through
October 27 is USD 0; future hosting/storage costs remain unverified. PR #61 Foundation retry passed
at `8c98d88d5a12164d562f595dc1f3f78d031f1db6`, including 10 workflow tests; all seven checks green.
**Blocked:** the protected external SQL template awaits private values, so current ACLs/data/schema/migration safety are unverified.
No Azure HTTPS API host or storage exists. Legitimate SMTP sender configuration and independent auth
review remain outstanding. Public onboarding/upload and production release are not ready.
**Next:** owner populates SQL settings and identifies the legitimate sender configuration; finish SQL/recovery/host prerequisites, auth review,
then serialized #61 → refreshed main → #65/#66 → uploads/storefront → exact-source regression/release.

Current production is preserved at `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`, https://dzirent.com/.
An unauthenticated browser confirmed the existing demo UI/footer and no page exceptions during its visit.
No cloud writes, migration, account/admin grant, email, merge, tag change, DNS change or deployment occurred.
The guard fix remains a reviewable source change. Historical status below does not supersede this checkpoint.
See the [reconciliation, actual tests, gap matrix and release/rollback handoff](releases/2026-10-27-production-readiness.md).
The owner-specified CA bundle also passed certificate/hostname-verified TLS 1.3 at 19:29 UTC.
Draft [#71](https://github.com/Vivek-k24/Dzirent/pull/71) records the guard and checkpoint; initial
head `3a945bdd78e99d7f4500a389c07632665b18b345` passed all seven checks and triggered no listed Vercel deployment.

## AUTH-EMAIL #64 — local scope completed, 2026-10-22

Draft PR #61 remains unmerged; no hosted activation or Phase 2B is authorized. Code candidate
`9e2af2cdb579aa18a5f4f0bd2e5854366c3e8f94` descends from the exact approved start
`5b130d3dfc16d5514dcde6815aea8d78aa47b9a0`; main and live demo are preserved.

Encrypted transactional verification/recovery email work now survives process interruption,
uses expiring fenced claims, bounded retry/cleanup and single-use/superseded token checks.
The forward 0005 migration adds only the outbox and its restricted grants. Existing account/RBAC
behavior and contract `.3` are preserved. SMTP is disabled by default and no provider was configured.
The UI refreshes session truth only after explicit confirmation; no automatic login/verification.

Focused local API regressions **78 passed**, web unit tests **38 passed**, preview guards **3 passed**;
static/contract checks and API dependency audit passed. Final complete API suite **400 passed / 0 skipped** at the exact code candidate above. See
[exact report and changed files](auth/email-verification-test-report.md) and
[dispatch/encryption/activation runbook](auth/email-verification.md). Historical #62's nondurable
queue limitation below is superseded in source, with hosted delivery still unverified.

Only a disposable loopback PostgreSQL 17.11 container and simulated mail were used. No browser/E2E,
real SMTP, Azure migration/accounts, real admin, deployment, merge, domain change or Phase 2B.
Next: owner reviews the local-tested draft, migration/privileges, key custody and later sender/
hosted activation dependencies. No real inbox delivery, DNS authentication or live security
acceptance is claimed by these tests.

## AUTH-CONNECT #62 — Phase 2A local validation, 2026-10-21

**Local phase complete; draft PR #61 remains under owner review. Phase 2B is not authorized.**
Pinned start `db7d1888183c6362ad5087ab1fc13a4bed983114`; tested code
`82450720030d7fde31aeb04b432104bbbce0a28a` on `codex/native-auth-phase1` in the assigned Codex
checkout. Main `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc` was preserved without merging.
Final local evidence: **337 API tests**, **33 web tests**, **3 preview-guard tests**, **4 actual
connected Chromium scenarios**, **10 demo desktop/mobile workflows**, all passed with **zero skips**;
static checks, production demo build, contract and deterministic fixture checks also passed.
Earlier failures, corrections and exact commands are retained in the [Phase 2A report](auth/phase2a-test-report.md).

Fixed post-commit mail correctness, shared-BFF throttling, sensitive-table ACLs/protected columns,
recovery CI, exact Host validation, local destruction/operator guards and demonstrated test isolation.
Only disposable loopback PG17, fabricated local identities and in-memory mail were used. No Azure,
staging migration/accounts, real admin privilege, real email, hosted test, deployment or merge.
The Vercel exact-branch guard was corrected in source; project inspection is read-only and any
safe publication's exact-head automatic CI/deployment-suppression evidence belongs to PR #61.
Contract stays `.3`; locks, canonical sample data, old migrations and other lanes are preserved.

Next: owner reviews the local-tested draft and explicitly decides whether to authorize Phase 2B.
Hosted TLS/mail/operational abuse controls and the real admin identity remain unverified. The
bounded mail queue is not durable. Parent #26 remains open; the live presentation demo is preserved.

## AUTH-CONNECT #26 — Phase 1 implementation, 2026-10-21

**Implemented but untested; draft owner review required before Phase 2.** Branch
`codex/native-auth-phase1`, exact main base `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc` (includes #60).
Native FastAPI credentials/cookies/lifecycle, additive auth schema/least-privilege grants, independent
renter/lender/admin boundaries, connected Next.js proxy/forms/account security, and guarded operator
utilities are source artifacts only. Contract `.3` and TypeScript/fixture outputs were generated;
no tests/lint/typecheck/builds/migrations/accounts/provisioning/hosted/browser checks or manual CI run.
No merge/deployment, live demo/settings/DNS change, or cloud call in this phase. Automatic draft-PR
CI is incidental, never Phase 2 acceptance. Existing measurement/quality branches and QA untouched.

Staging PostgreSQL 17.11 at head `0002` with zero users/products is **owner-reported**, not reverified
here. Proposed chain `0002` → existing guarded `0003` → new `0004_native_auth` is unexecuted. HTTPS API
hosting (#25), actual existing admin identity origin, reviewed mail delivery, Phase 2 validation and
explicit later staging migration/account authorization remain. [Handoff and command record](auth/phase1-handoff.md),
[draft ADR](architecture/0005-native-authentication.md), [contract note](../contracts/changes/0003-native-auth.md).

## Rental refresh: two independent workflow assignments

User-authorized batch from code baseline `a63acc0e9d55d79a918775a57d09bcec63cd3726`.
The coordination PR establishes one shared start SHA; use its merged SHA from the launch handoff.
Codex: collection sidebar/shell/palette/product-page reliability. Claude Code: Studio management,
public directory/profile/API/database and per-Studio rotating outfit previews. Antigravity is deferred
until both candidates are ready. See [assignments and ownership](parallel-rental-refresh/README.md).
No claim that external agents have started. No unit tests; bounded workflow integration/E2E only.
`pnpm check` is static/media/contract/fixture validation. Automatic full QA matrix is now manual;
routine CI runs a small PostgreSQL integration selection and Chromium desktop/mobile workflow smoke.
The user reports www.dzirent.com and dzirent.com are now live. No domain changes are needed in this batch.


## REL-1 released presentation demo — 2026-10-19

**Public URL:** https://dzirent.vercel.app/

**Deployed code/main baseline:** `baf04b67ccaede358b3e4aab526c0b6889bb09bb`

**Verified candidate:** `8c6ae70946d52cbcab9280bb11f7348c36f57071`

**Shared code tree:** `2de479c05a32089d5787ad828f471852d0a4447d`

**Production deployment:** `dpl_EinNXwHamr1YpjVnvMqQmm737RXe`

Integration PR [#13](https://github.com/Vivek-k24/Dzirent/pull/13) merged frontend #5, backend #11
and independent QA #12 through their preserved histories; all four PRs now show merged.
All 156 browser/accessibility checks across Chromium/Firefox/WebKit at four widths and all 258
PostgreSQL API tests passed, alongside foundation, contract smoke and security checks. The public
production alias was verified without a Vercel share URL or sign-in. Preview/unique production URL
protection remains enabled, automatic Git deploy guards remain false, and no DNS was changed.

The frontend is an explicitly labeled presentation demo with sample auth and session-only mock CRUD.
The Python API is merged. The owner has created Azure PostgreSQL 17 staging and applied the 17-table schema,
but native authentication, the hosted HTTPS API and connected browser-to-database persistence remain **unreleased**. No payment integration or native app is claimed.
Read [release evidence](qa/release-integration.md) for exact SHAs, commands, checks and limitations.

All lanes must fetch latest `origin/main` before new work and record that SHA in their own log.
The deployed code baseline above remains the reference for this release; later release-record commits
change documentation only. Preserve source branches and existing immutable candidate tags. Use an
isolated next-phase branch/worktree, claim scoped work, and agree contract changes before implementation.

## Historical Section 13.2 planning (superseded by REL-1 above)

Foundation PR [#1](https://github.com/Vivek-k24/Dzirent/pull/1) merged at
`2ff5cae77ec165637ae02fade6d4619826760f28`. Codex fetched origin and merged main into the assigned
`codex/web-phase1` branch without rewriting history or editing another checkout. Frontend PR
[#5](https://github.com/Vivek-k24/Dzirent/pull/5) now targets main. Reconciled candidate:
`44e408602e54573b4d208aaed5f556c4a51ae406`; its complete tree matches immutable
`demo-v0.1.0-rc.1` (`47f8aa1f3c2aa7be41384eb34ca8af9df787a377`). The 118-file frontend/integration diff
contains no API, canonical contract/fixture or independent QA changes. Contract `0.1.0-candidate.1`
is unchanged. Dependency upgrade PRs #6–#9 are separate and not presentation dependencies.

Antigravity has claimed [QA-2 / #10](https://github.com/Vivek-k24/Dzirent/issues/10), reconciled its
own clean checkout, and is replacing foundation-skipping acceptance assertions with independent tests
of the real production UI. A QA PR/report tied to exact candidate and test-code SHAs is required before
merge/release; no independent acceptance or deployment is claimed yet. All six CI checks passed at
the reconciled frontend SHA. Codex is rerunning local static/unit/contract checks.

Startup: in `H:\DziRent\worktrees\codex-web`, use Node 22.23.3 / pnpm 10.29.3,
`pnpm install --frozen-lockfile` then `pnpm dev:web` (3000). Built demo: set
`NEXT_PUBLIC_DZIRENT_MODE=demo`, run `pnpm build`, then
`pnpm --filter @dzirent/web start --port 3000`. QA uses its own branch/checkout and port 3100.

The user now explicitly authorizes the verified demo on the existing Vercel project. Read-only CLI/API
inspection verified account `vivekkallakuri-8617`, team `team_Ur6AwuUGgeBixSwdnTTrTECE`, project
`dzirent` / `prj_hG63XH3glAqy9VcyMvLNnY4CLsnI`, linked to GitHub `Vivek-k24/Dzirent`.
The project's root/framework/Node/obsolete production branch need the reviewed configuration in
[release instructions](../apps/web/DEPLOYMENT.md). Both automatic Git deployment guards stay false;
the authorized release will use a deliberate staged CLI deployment, so guard relaxation is unnecessary.
No DNS, new service, backend deployment or payment work is included.

Next: independent QA/source review → fix owned frontend defects → passing CI → merge frontend then QA
→ rerun integrated checks → stage/test/promote the same demo build → test the public presentation alias
without Vercel auth → record deployed SHA/URL/report and a new immutable release tag. Claude continues
API-1 / #3 independently; no unreviewed backend work is required for this presentation.

## Archived pre-merge candidate status

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
| Claude | Queued; `claude/api-phase1`, reserved `H:\DziRent\worktrees\claude-api` | Adopt contract/fixtures; migrations, deterministic restricted seeds and catalog; prior identity-provider/owner CRUD implementation |
| Antigravity | Queued; `antigravity/qa-phase1`, reserved `H:\DziRent\worktrees\antigravity-qa` | Requirements-to-tests matrix, independent contract/browser checks, extend CI/runbooks |

No role worktree/branch has been activated or agent asked to edit shared files.
Startup commands and separate ports/databases: [README](../README.md) and
[ownership registry](architecture/ownership.md). Provider/media/reviewer dependencies:
[setup list](architecture/setup-dependencies.md). They do not block local mock development.
