# Production integration checkpoint — 2026-10-27

Owner assignment: production integration and release; [claim #70](https://github.com/Vivek-k24/Dzirent/issues/70).
This is a blocked infrastructure checkpoint and a deployment-safety correction, **not a connected release**.
No cloud resource, SQL data/ACL, schema, sender, DNS, production alias or deployed application was changed.

## Reconciliation completed before edits

Three independent Git object stores were inspected and fetched: `Dzirent_dev`, `codex-web`, and
`claude-api`. Commands were `git worktree list --porcelain`, `git status --porcelain=v1 --untracked-files=all`,
`git branch -vv`, `git remote -v`, `git fetch --all --prune`, ahead/behind comparison, and
`git log HEAD --not --remotes`. GitHub refs agreed with all three fetched origin refs.
Every checked-out named branch was zero ahead/behind; there were no unpublished commits.
Inactive local `main` refs were created/fast-forwarded with
`git fetch origin refs/heads/main:refs/heads/main`; no working branch was switched.

| Reference | Exact source revision |
| --- | --- |
| `origin/main` / integration base | `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc` |
| Draft [#61](https://github.com/Vivek-k24/Dzirent/pull/61), native auth | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` |
| Draft [#65](https://github.com/Vivek-k24/Dzirent/pull/65), six Studios | `806f72f18d154ef410bc10f2b7d621bba1526e10` |
| Quality integration | `96339e056937a9b636e20609e10e3658cc63350d` |
| Measurement integration | `0fd9a2b057f67f33111f4a28d7a842cc22814bfc` |
| Measurement 2A integration | `bf524f2d4ab175f659236cbefaaf0bca116bab00` |
| Measurement 2B integration | `0d26ffc1ae49584b4517d8d7c4a5daa197389247` |
| Measurement 2C1 / draft #52 | `b02c25164aa32ce7dcfcabe3d4748e86776f5aed` |
| Quality contract / draft #30 | `64ebd948e568ff9c51ebd641e134687dfecc95ec` |

All paths below are under `H:\DziRent\`.

| Original checkout | Branch / state | Exact head |
| --- | --- | --- |
| `Dzirent_dev` | `coord/ai-measure-1-integration`, clean | `0fd9a2b057f67f33111f4a28d7a842cc22814bfc` |
| `worktrees/antigravity-demo-realism` | `antigravity/demo-realism-phase1a`, clean | `806f72f18d154ef410bc10f2b7d621bba1526e10` |
| `worktrees/antigravity-measure-2a` | clean | `2ca4e980326738a48b59f93f21b92176385bfd73` |
| `worktrees/antigravity-qa` | currently `codex/native-auth-phase1`, clean; preserved | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` |
| `worktrees/claude-api` | `claude/ai-quality-1a`, clean | `639ab37206414962d1c1328aa7f26a8c3dc89724` |
| `worktrees/claude-measure` | `claude/ai-measure-1a`, clean | `784d76d140a31938abec8b5769c356625d250675` |
| `worktrees/claude-paper-snap` | clean | `31c1bc25ebcf4bc1e85a85db0465cc5db010a8ba` |
| `worktrees/claude-proxy-tests` | clean | `e298b22ebfa9a0e06ce3c32817b031552acdfe43` |
| `worktrees/codex-web` | `codex/native-auth-phase1`, clean | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` |
| `worktrees/pr61-local-review` | owner's detached clean review checkout; untouched | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` |
| `worktrees/release-rental-refresh` | detached; existing `.gitignore` edits preserved | `4c5b8864edb7715951cb4d65d0a50fdaea22ca43` |

The old release edit adds `.vercel` / `.env*` ignores. It was not staged, reverted or moved.
No other agent was started or asked to edit shared files. Existing branches, review checkout and tags remain intact.

New implementation checkout: `H:\DziRent\worktrees\codex-production-integration`,
branch `codex/production-integration-20261027`, from the main revision above.
Read-only tooling checkout: `H:\DziRent\worktrees\codex-azure-readiness`, detached at unchanged
[#31](https://github.com/Vivek-k24/Dzirent/pull/31) source `131ca66fef46fa085e667ba645ce220e9d6d86ea`.
Azure tooling was reused, not merged into this change.

## Smallest remaining gaps

| Area | Existing evidence | Required next change / gate |
| --- | --- | --- |
| Native auth | #61 implements credentials, sessions, verified-account gates, renter/lender RBAC, audited `operations:access`, recovery and encrypted mail outbox. Historical local report records 400 PostgreSQL-backed tests, zero skips. | Final independent source/security review and exact combined-candidate testing; no administrator grant is inferred. Not on main or hosted. |
| Auth CI | Initially six success conclusions plus cancelled Foundation. Foundation attempt 2 now passed at unchanged native-auth source; all seven reported checks are green. | Review is still absent (`reviews: []`); green CI alone does not approve merging. |
| Studios | #65 supplies six Studios, 40 stable product IDs/images and partition 14/8/6/5/4/3. CI passed at its recorded head; coordinator re-review accepted the prior corrections. | Reconcile after #61 merges. Resolve [#66](https://github.com/Vivek-k24/Dzirent/issues/66) brand/facet consistency and perform combined visual/catalog verification. |
| PostgreSQL | Current ARM inventory and certificate-verified TLS checks succeeded; details below. | Authenticate with protected existing SQL settings, inspect schema/data/ACLs, verify migrator separation and recovery before any migration. |
| HTTPS backend | Complete subscription resource inventory contains only the PostgreSQL server. No Web sites/plans, Container Apps/environments or storage accounts. | Select/cost the minimum secure host only after SQL and restricted networking prerequisites are verified; no host was provisioned. |
| Email | #64 has transactional encrypted outbox/retry/recovery and simulated-transport evidence. DNS currently has Google MX and one SPF record; DMARC lookup returned NXDOMAIN. | Actual sender ownership, SMTP credentials and sender authentication remain unverified. Requested protected configuration location. No live email or DNS edits. Registration must remain disabled/fail-closed until configured. |
| Lender media | Catalog/listing forms exist, but upload-intent/completion remain contract-only in main. | Implement owner-scoped runtime, validated file processing/metadata removal, private storage, authorized attachment/persistence, cross-owner denial and bounded orphan cleanup. No fabricated upload success or storage deployment. |
| Storefront header | Public browser observation confirms prototype banner and Demo controls. Accurate footer transaction limitations are present. | Remove public technical controls while keeping truthful footer/checkout disclosure and mode isolation. Not implemented in this checkpoint. |
| Sample prices | Audit of all 40 canonical entries: USD, integer minor units, minimum 3500, maximum 17950; 30 exceed 4000. | Cap all sample base prices at 4000 with variation and valid bands; preserve the real-lender price contract. Not implemented yet. |
| Photography | Forty local catalog JPEGs and media provenance records exist. #65 improves editorial mapping. | Human visual/type/color/rights audit and appropriate curated replacements are still required; no claim that existing assets meet the new authenticity requirement. |
| Deployment safety | Source used `* : false` plus `main : true`; slash-named branches were not fully denied and serial main merges could deploy partial work. | Corrected in this PR; both configs now use boolean false, enforced by `pnpm deploy:check` inside `pnpm check`. Remains undeployed/unmerged. |
| Measurement / classifier | Draft quality/measurement branches inspected read-only. Quality branch includes local developer proxy and processing code. | Reuse only reviewed deterministic validation if needed later. Do not merge local-only endpoints or measurement experiments. |
| Future scope | No payments, automated pricing/condition/ownership certification, shipping promises or native release. | Remains outside this production integration scope. |

## Actual Azure readiness — read-only

Observations: 2026-10-27, approximately 19:03–19:13 UTC. Existing VS Code Resources authentication
worked through `VisualStudioCodeCredential`; no interactive login, token export, password reset,
SQL connection, provider registration or ARM mutation was performed.

- Exact intended subscription/tenant matched; subscription Enabled, Azure for Students offer.
  Subscription and billing-profile spending limits are **On**, billing Free/Active.
  Current credit minus pending charges is positive, exceeds the existing planning reserve,
  and the credit/spending-limit window extends beyond seven days. Private amounts/identifiers are not committed.
- Existing server **Ready**, PostgreSQL major 17 / minor 11 (ARM), North Central US, Burstable B1ms,
  32 GiB Premium LRS, autogrow disabled, HA disabled. Intended database exists.
- `require_secure_transport=on`, minimum TLS 1.2, no pending configuration restart.
  An unauthenticated PostgreSQL SSLRequest negotiated **TLS 1.3**, verified CA chain and hostname.
  This proves TLS reachability, **not SQL authorization or a SQL-reported engine version**.
- Public networking is enabled with one firewall rule and no broad all-Azure/all-IP rule in the returned inventory.
  No network change was made; a future host's restricted egress path is unverified.
- Password authentication enabled; Entra authentication disabled. The optional administrators-list lookup
  returned HTTP 400, so no administrator list is inferred from that endpoint.
- Seven automatic Full backups were listed, latest completed **2026-10-27T17:09:29.2091538Z**;
  retention seven days, earliest restore timestamp October 21. This is backup metadata evidence,
  not a restore rehearsal or proof of a logical SQL snapshot.
- Subscription resource listing is complete: one PostgreSQL server, no hosted application or storage resource.
- Consumption response complete: 14 records for the existing server, October 21–27; provider-reported
  accrued cost **USD 0**, using `B1MS Compute - Free` (136 hours) and `Storage Data Stored - Free`
  (5.8494623536 GB-month). Records indicate credit eligibility. This is not a future free-usage guarantee,
  final invoice, host/storage quote or out-of-pocket authorization.
- The separate free-services entitlement endpoint returned 404 `InvalidResourceType`; remaining free
  meter quantities were not established. No billing upgrade, spending-limit removal or purchase was attempted.

**SQL blocker:** the owner-selected external connection settings still await private population for
the existing `dzirent_app` and `dzirent_migrator` roles. Initial inspection found no protected SQL file;
the known local `.env` points to loopback and relevant process settings are absent. The owner then
specified a path outside all repositories/worktrees. It and its parent did not exist; a credential-free
template was created atomically without overwriting files, restricted to the current Windows user
and SYSTEM. Its two keys are `DZIRENT_DATABASE_URL` and `DZIRENT_MIGRATOR_DATABASE_URL`.
No connection setting or credential is published here.

The owner also specified the established CA bundle under `%APPDATA%/postgresql/azure-postgres-roots.pem`.
It exists. A further SSLRequest at **19:29 UTC** using that exact bundle, with no alternate trust fallback,
verified the chain/hostname and negotiated TLS 1.3. Future SQL connections must use that bundle and
`sslmode=verify-full`. Azure Resources management authentication does not authenticate SQL; Entra
authentication is disabled. Do not reset passwords, substitute local settings or change roles to bypass
the missing private values. The owner's reply did not identify an SMTP sender/configuration.

Consequently current row counts, table/schema ownership, role memberships, default/table/column ACLs,
actual Alembic revision, runtime CRUD, host-to-database TLS and SQL recovery preconditions remain **unverified**.
The older owner-reported `0002_studios`, 17 tables and zero user/product rows are historical evidence only.
No hosted migration, account, admin grant or test write occurred.

### Migration source inspection, not execution

Reviewed #61's forward chain:

- `0003_native_identity_boundary`: refuses unreconciled external-provider users before replacing only
  the provider constraint. Existing user rows must be checked first.
- `0004_native_auth`: six new auth/audit tables, restricted grants on the new tables, no role creation;
  rejects a privileged or role-member runtime and requires the existing migrator when the app role exists.
- `0005_auth_email_outbox`: one new encrypted-payload outbox with expiry/lease/lifecycle constraints,
  restricted runtime columns and the same migrator/isolation guard. Does not rewrite earlier revisions.

These grants deliberately remove inherited grants on **new sensitive tables**. Validate actual default ACLs
and migration ownership first. No data-bearing downgrade is a release rollback strategy. An available
backup, protected schema/data inventory, local migration/ACL evidence and confirmation of no parallel
database writer are required before one serialized hosted upgrade. None of those SQL gates is waived.

## Production observation and rollback

Read-only Vercel inspection confirmed the existing `dzirent` Next.js project is linked to this repository.
The verified domains include `dzirent.com`, `www.dzirent.com` and `dzirent.vercel.app`.
Preview SSO protection remains enabled; domain verification was already complete. No provider setting changed.

Current production source: `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`, not current main.
Current production deployment: `dpl_A7AvvLu1XmuzcWuvTRiRpHcTqAUd`.
The public homepage returned HTTPS 200. Fresh unauthenticated Chromium observation at 19:18 UTC showed
the prototype banner, demo-only controls and footer: “Sample listings, prices, ratings and availability.
No reservations, payments or delivery promises.” No page exceptions were observed in this bounded visit.
Correlating the demo-only controls with the exact production source supports demo-mode operation;
no mock-worker request was observed. This was not an authentication, upload or full-route release test.
Vercel environment metadata returned no entries; it does not establish backend email/database settings.

The current production deployment is the preserved application rollback target. No rollback is necessary
for this checkpoint because nothing was released. Before a future release, re-read the production alias,
record its deployment/source and retain that exact deployment. Keep `git.deploymentEnabled=false`
in both configurations. After review/gates, use a deliberate staged build/deployment and authorized
promotion on the verified project; `pnpm deploy:check` must pass first. Do not relax guards to merge PRs.
Vercel documents boolean false as disabling all automatic Git deployments
([Git configuration](https://vercel.com/docs/project-configuration/git-configuration)).

If a later application release fails, restore the recorded previous deployment through Vercel's deliberate
rollback/promotion operation, then recheck public routes and mode. Never downgrade auth tables containing
accounts/outbox/audit data as part of application rollback. Select a schema-compatible application or stop
the connected entry point; recovery/restoration requires a separately reviewed SQL preservation plan,
validated recovery point and fresh cost checks. No DNS change or payment service is required.

## Validation and reproducible handoff

Guard implementation source: `513fb9c40c735b269834dc0f6ba50824baee43cb`.
Only deployment configuration/root check wiring changes application tooling in this checkpoint;
auth, catalog, API contracts, fixtures and dependency versions are unchanged.

Actual local commands, Windows, Node 22.23.3 / pnpm 10.29.3:

| Command | Actual result |
| --- | --- |
| `node scripts/check-deployment-guards.mjs` before config correction | Exit 1, correctly rejected both old configs. |
| `pnpm install --frozen-lockfile --offline` | Exit 0; 355 packages reused, zero downloads; lockfile unchanged. |
| `pnpm deploy:check` after correction | Exit 0, both guards disabled. |
| `pnpm exec eslint scripts/check-deployment-guards.mjs scripts/task.mjs` | Exit 0. |
| `node --check scripts/check-deployment-guards.mjs` and `node --check scripts/task.mjs` | Both succeeded. |
| `git diff --check` | Exit 0. |

Existing pinned infrastructure interpreter:
`H:\DziRent\worktrees\codex-web\infra\azure\.venv\Scripts\python.exe` (Python 3.12.15).
From the detached tooling checkout, ran
`infra/azure/staging_preflight.py --benefits-only --output-dir .local/release-credit-2026-10-27 --timeout 90`.
Exit 2 is the preflight's documented non-provisioning outcome; individual credit/billing observations
were evaluated privately, not mislabeled as a provisioning pass.
Bounded local wrappers reused #31's SDK/authentication and GET-only transport for server/TLS/backup,
resource and consumption reads. They exited 0; the administrators subsection failed as disclosed above.
TLS probe exited 0. Raw responses, credit details and helpers remain ignored locally.
Tool hashes: server inventory `0d1d80ba54282e53ca70e94b03dca3a4c5314565aef0bb1b693041b71047b5c6`;
resource/cost inventory `8c2d8588db4779d9fd4a9beadf454e4df63e0ad79090fbb22c42912a98ff0b84`.

Native-auth CI: restarted only the cancelled Foundation job with
`gh run rerun 39809204991 --repo Vivek-k24/Dzirent --job 119930534229`.
[Attempt 2](https://github.com/Vivek-k24/Dzirent/actions/runs/39809204991/attempts/2) passed
at the unchanged native-auth revision: static/contract/fixture checks, build, compose validation and
**10 bounded desktop/mobile workflow tests passed**. The successful PostgreSQL job from attempt 1
was reused, not reported as rerun. All seven PR checks now report success; no formal review is present.
The prior full 400-test auth result belongs to #61's existing local report, not a new full run here.
First checkpoint head `3a945bdd78e99d7f4500a389c07632665b18b345`: all seven PR checks passed,
including [Foundation](https://github.com/Vivek-k24/Dzirent/actions/runs/40568863287) and
[Security](https://github.com/Vivek-k24/Dzirent/actions/runs/40568863025). Vercel listed zero deployments
for that head. This documentation follow-up leaves guard implementation unchanged; its latest CI/head
must still be evaluated together at review. [Draft PR #71](https://github.com/Vivek-k24/Dzirent/pull/71).

Not run: destructive hosted pytest, hosted SQL/migrations/CRUD, real email, connected browser/account/
upload E2E, restore rehearsal, full combined-candidate regression, production release or post-release
acceptance. The local application build/full test suite was not repeated for this guard-only code change;
ordinary PR CI remains enabled. Incidental diagnostic command parse errors were corrected; they are
not product failures or passing checks.

Resume from the isolated integration checkout, fetch origin, and recheck status/ownership first.
Use the pinned Node/pnpm, `pnpm install --frozen-lockfile`, and `pnpm deploy:check`.
Local mock work remains available through `pnpm dev:web` (3000); connected startup is
`pnpm dev:web:connected` / `pnpm dev:api:connected` only with protected valid settings. Never silently
fall back to mocks. Do not point any destructive `*_test` fixture at hosted staging.

**Next required input:** private population of the owner-selected external SQL settings and, independently,
an existing legitimate sender configuration location. Then establish SQL ACL/schema/recovery and restricted hosting/budget gates;
finish auth review, merge #61 only when approved, refresh main, reconcile #65/#66, implement uploads and
storefront requirements, test the combined exact source, and release serially only after every gate passes.
