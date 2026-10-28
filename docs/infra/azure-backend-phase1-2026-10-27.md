# Azure backend Phase 1 — 2026-10-27, America/Chicago

**Historical October 27 checkpoint.** The SQL-authentication blocker below was resolved by the
owner-authorized [October28 Stage2 connection recovery](azure-connection-recovery-2026-10-28.md).
Both roles now authenticate, with original permissions/data/schema retained. Hosting remains
undeployed; no migration or Stage3 activity followed automatically. Preserve the timestamped
observations below as the original evidence, not the current credential state.

**Blocked; not deployed.** This is the owner's highest-priority Azure backend-only assignment,
not storefront/AI development, public onboarding activation or completion of the production master.
Claim: [issue #25](https://github.com/Vivek-k24/Dzirent/issues/25#issuecomment-6459311814).
Initial observations were collected approximately 21:47–22:09 CDT (UTC October 28).
The owner-supplied SQL configuration and hosting suitability were rechecked at 22:21–22:36 CDT.

## Exact recovered source and preservation

- New isolated checkout: `H:\DziRent\worktrees\codex-azure-backend-phase1`.
- Branch: `codex/azure-backend-phase1`.
- Recovered integration Git revision: `83ba85525e6db23fb5af150c0c705d1fe13f4def`.
  Parent `e5405a4299f5e076a3a75fcfec48def001330c1d` combines [#71](https://github.com/Vivek-k24/Dzirent/pull/71)
  and [#61](https://github.com/Vivek-k24/Dzirent/pull/61); the final commit changes only test CSRF
  settings/current-contract assertions. The existing coordination checkout is untouched.
- Native-auth source remains `8c98d88d5a12164d562f595dc1f3f78d031f1db6`. A direct comparison found **no
  difference** in runtime Python, migrations, dependency manifests/lock, Dockerfile or image allowlist
  between #61 and the recovered candidate. Contract stays `0.1.0-candidate.3`; expected schema is
  `0005_auth_email_outbox`. No authentication rebuild or dependency upgrade.
- Guard source/handoff remains `1d48763ed8c4a43b8fb690233d74c92264af617b`. Both Vercel files contain
  `git.deploymentEnabled=false`; the actual policy command passed in the recovered checkout.
- Existing [#31](https://github.com/Vivek-k24/Dzirent/pull/31) SDK/preflight code at
  `131ca66fef46fa085e667ba645ce220e9d6d86ea` was reused. Its old allocation-blocked conclusions are
  historical; the owner-created PostgreSQL server/database now exist. No PostgreSQL provisioner ran.
- Fetched all three local object stores. Remote/main is
  `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`. No reset, main push, branch switch in another checkout,
  rewrite, merge to main, new agent or other-agent log edit.

All **17** worktrees were inspected. Sixteen were clean; the one pre-existing tracked edit in the
old detached release was preserved. Source/reference snapshots are listed below. These branches
were not integrated into this backend candidate merely because they exist.

| Checkout suffix | Git revision | State |
| --- | --- | --- |
| `Dzirent_dev` | `0fd9a2b057f67f33111f4a28d7a842cc22814bfc` | clean at inspection |
| `antigravity-demo-realism` | `806f72f18d154ef410bc10f2b7d621bba1526e10` | clean at inspection |
| `antigravity-measure-2a` | `2ca4e980326738a48b59f93f21b92176385bfd73` | clean at inspection |
| `antigravity-qa` | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` | clean at inspection |
| `pr61-local-review` | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` | clean at inspection |
| `codex-web` | `8c98d88d5a12164d562f595dc1f3f78d031f1db6` | clean at inspection |
| `codex-azure-backend-phase1` | `83ba85525e6db23fb5af150c0c705d1fe13f4def` | clean at inspection |
| `codex-azure-readiness` | `131ca66fef46fa085e667ba645ce220e9d6d86ea` | clean at inspection |
| `codex-lender-media` | `deee0a13c191ddd05cc832771afcad58cee11a1f` | clean at inspection |
| `codex-production-integration` | `1d48763ed8c4a43b8fb690233d74c92264af617b` | clean at inspection |
| `codex-storefront-release` | `ca7e75db2e888a473a7fd514ccf35b50c10fe317` | clean at inspection |
| `coord-integration-guards-auth` | `83ba85525e6db23fb5af150c0c705d1fe13f4def` | clean at inspection |
| `release-rental-refresh` | `4c5b8864edb7715951cb4d65d0a50fdaea22ca43` | one pre-existing tracked edit preserved |
| `claude-api` | `639ab37206414962d1c1328aa7f26a8c3dc89724` | clean at inspection |
| `claude-measure` | `784d76d140a31938abec8b5769c356625d250675` | clean at inspection |
| `claude-paper-snap` | `31c1bc25ebcf4bc1e85a85db0465cc5db010a8ba` | clean at inspection |
| `claude-proxy-tests` | `e298b22ebfa9a0e06ce3c32817b031552acdfe43` | clean at inspection |

The separate storefront #73 and media #75 drafts remain preserved and suspended for this assignment.
No media/AI code, candidate.4 schema or 0006 migration is included in the selected image.

## Current Azure and TLS evidence

Fresh authentication used **VisualStudioCodeCredential**, with exact subscription/tenant verification.
No interactive login, token export, key retrieval, password reset or credential publication.
Read-only wrappers retained the existing fixed GET-only ARM transport and wrote only new ignored evidence.

- Existing `dzirent-pg17-ncus-4265`: **Ready**, North Central US, control-plane version **17.11**
  (`version=17`, `minorVersion=11`), Burstable `Standard_B1ms`, 32 GiB Premium LRS. This is management
  metadata, not a new SQL-reported version observation.
- Intended `dzirent_staging` is present. No server, database, role or resource group was created/recreated.
- Password authentication is enabled; Entra authentication is disabled. Azure management sign-in does
  **not** supply SQL-role passwords. Optional administrators-list lookup returned HTTP 400; no SQL
  administrator/privilege conclusion is drawn from that failed lookup.
- Secure transport required, minimum TLS 1.2, neither setting pending restart. Public network has one
  firewall rule and zero broad all-IP/all-Azure rules in the complete returned inventory; unchanged.
- At **21:56 CDT**, a PostgreSQL SSLRequest followed by chain/hostname validation using the owner's
  exact CA bundle negotiated **TLS 1.3**. No alternate trust fallback and **no SQL authentication**.
- Seven automatic Full backups listed, latest **2026-10-27 12:09:29 CDT**. Retention seven days,
  earliest restore point October 21. Metadata is verified; restore rehearsal/logical backup and
  current data preservation prerequisites remain unverified without SQL access.
- Complete subscription inventory has **one PostgreSQL resource**. Web sites/plans, Container Apps/
  environments and storage inventories are empty. **No HTTPS FastAPI host or deployment exists.**
- Hosting-SKU GET returned HTTP 200 with an empty list. This is **unknown eligibility/capacity**,
  not zero quota or proof that a free/custom-container runtime can be allocated.

## Protected SQL authentication blocker — resumed at 22:21–22:36 CDT

`H:\DziRent\secrets\azure-staging.env` exists and was inspected without printing its contents.
The owner populated both `DZIRENT_DATABASE_URL` and `DZIRENT_MIGRATOR_DATABASE_URL` privately.
ACL inspection again found zero unexpected allowed principals. Initial checks left the file unchanged;
the subsequent owner-authorized encoding repair is recorded below. No secret or connection string
was printed, logged, committed or uploaded.

The earlier 21:47 and 22:09 CDT runs exited **2** before connection because both values were blank.
At **22:21 CDT**, populated values failed the exact-host guard before connection: reserved password
characters were parsed into the hostname. The owner corrected the URLs privately. At **22:30 CDT**,
both then passed the exact server/database/role/port/`sslmode=verify-full`/established CA guards.
The guarded reader exited **2**, `sql_attempted=true`, with an `OperationalError`. A bounded,
independent check of each role classified both failures as **server authentication rejected**;
neither was a DNS, timeout, firewall or certificate-validation failure. No alternate password,
role, target, permissive TLS setting or local database fallback was tried.

At **22:35 CDT**, the owner explicitly authorized direct repair of both URLs in the existing protected
file. The agent used the **known full Azure hostname** as the password boundary, percent-encoded
reserved characters, and preserved every existing valid percent-encoded sequence. Both entries
changed. An exclusive open of the existing file retained its ACL; all nonpassword URL/settings text
and credential semantics were preserved in memory, and the saved bytes were checked. No private
backup/copy, raw diagnostic output or repository file containing credentials was created.

Both saved URLs pass the exact server/database/role/port/verify-full/CA and decoded-password
preservation guards. The unchanged guarded reader still exited **2** on SQL authentication. A final
bounded, SELECT-only check of **each** role also exited **2**, with both classified as **authentication
rejected** and `ready=false`. No SQL login succeeded and no SELECT result was obtained. URL syntax
validation passed; **SQL credential acceptance did not**. Correct, accepted passwords for the existing
roles are now the concrete dependency. No guessed/alternate password, reset, role recreation or
broader access is a proposed fix.

Therefore current Alembic revision, table ownership/data, effective table/column/default privileges,
role memberships, migrator separation and **all SQL CRUD are unverified**. Historical owner evidence
of 0002/17 tables/zero users-products is not treated as a fresh SQL result. No migrations, synthetic
row/account creation, administrator grant, destructive fixture or hosted write ran.

The backend requires genuine connected/native database configuration. An empty/invented URL or
healthy liveness response would not establish readiness or CRUD. Hosting without its required SQL
configuration would not complete this assignment, so no unused metered host was allocated.

## Credit, cost and hosting boundary

Fresh linked billing reads at approximately 21:50 CDT established:

- Subscription Enabled and Azure for Students; subscription and billing-profile spending limits **On**.
- Free/Active billing, positive non-estimated current credit after pending charges, above the initial
  USD 10 planning reserve; listed credit expiry extends beyond seven days. Exact balances/financial
  identifiers remain private. This does not mean a selected resource's complete budget is approved by
  the preflight or that every service has a verified free meter.
- Free-service entitlement lookup failed; subscription-specific free meter quantities remain unknown.
  Eligible credit-funded staging usage is authorized, so a nonzero retail rate alone is not a new
  permission requirement. No personal charge, upgrade, limit removal or Marketplace purchase.
- Fresh usage query: **14 cost-bearing records, provider-reported USD 0 through October 27** for the
  existing resource. Billing reports can lag; this is not a forecast or a guarantee of future free use.
- **New hosting resources: 0. New hosting commitments/charges: none introduced.** No budget/alert,
  provider registration, networking, service setting or resource mutation occurred in this run.

At **22:26–22:28 CDT**, additional GET-only suitability checks established:

- `Microsoft.Web` is **NotRegistered**; it was not registered by this run.
- Subscription-scoped Linux F1/B1 region listings advertise **North Central US**, matching the existing
  database's region. This is advertised availability, not successful allocation or effective quota.
- The current regional `webAppStacks` endpoint advertises **`PYTHON|3.12`**, non-preview, with end of
  support listed as October 31, 2028. The older `availableStacks` endpoint returned stale versions and
  is not used to infer lack of 3.12 support.
- The public Retail Prices API returned **F1 Linux: USD 0/hour** and **B1 Linux: USD 0.018/hour**
  (about USD 13.14 per 730-hour month), in North Central US. The first narrow price query returned no
  rows because this service's `armSkuName` fields are empty; the complete 130-row regional query
  resolved the published rates by product/sku/meter. This is retail evidence, not an allocation or bill.
- Regional quota lookups returned **404** for both checked regions. Capacity remains **unknown**;
  successful region listings or permission patterns do not establish it. Hosting/create/register
  permission patterns are present, but effective policy/deny/capacity acceptance is still untested.

The smallest proposed host is a **Linux F1 native Python 3.12 app**, reusing existing API code and frozen
dependencies, with explicit Uvicorn startup. It would avoid a registry, Log Analytics workspace,
Application Insights and a paid plan. This packaging path is **not yet implemented or deployed**;
the prepared Docker image remains the validated local artifact. F1 has a 60 CPU-minute daily limit,
idle/cold starts and no production SLA, so it is a staging option only. See the
[published Linux plan limits](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/)
and [explicit Python/FastAPI startup guidance](https://learn.microsoft.com/en-us/azure/app-service/quickstart-python).
No paid fallback was selected or allocated.

Once SQL gates pass, confirm the minimum supported host/region/SKU and remaining incremental
build/logging/network meters before allocation. Do not assume an empty SKU response or region listing
establishes F1/custom-container eligibility. For App Service, use its actual outbound
IP set and narrow database firewall entries, preserving the owner rule; do not enable blanket Azure access.
See [Azure's outbound-address guidance](https://learn.microsoft.com/en-us/azure/app-service/overview-inbound-outbound-ips)
and [plan behavior](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans).
No paid plan/registry/logging service has been selected or falsely quoted as allocated.

## Actual local preparation and checks

The existing runtime image is built, not yet deployment-configured with the protected SQL settings/CA file.
Existing `services/api/Dockerfile` built successfully from the exact recovered revision, with frozen
runtime dependencies and an explicit Docker context allowlist. `.env`, tools, other applications and
private configuration were excluded; no credential was passed to the build. The image has never
been uploaded to a registry or deployed.

- Local tag: `dzirent-api:azure-phase1-83ba855`.
- Image ID: `sha256:2d849e1c38e989f368a5f8b02b00f4b1d920402ccfe42590884bf94af55660c7`.
- Revision label equals the recovered Git revision above.
- Runtime uid **10001**, Python **3.12.15**, psycopg **3.3.6**.
- Network-disabled/read-only container probe passed Argon2 hash/verify, AES-GCM round trip,
  packaged migration head 0005, missing connected database rejection, disabled email default and
  exclusion of `.tools`/`.env`. The ephemeral probe container was automatically removed.

| Command/check | Actual result |
| --- | --- |
| `git fetch --all --prune` in the three object stores; worktree/status inspection | Passed; exact references and preserved edit above. |
| Runtime-source comparison against #61 | Empty diff for all listed runtime/build/schema/lock paths. |
| `node scripts/check-deployment-guards.mjs` | Passed, both automatic deployment guards false. |
| Existing `staging_preflight.py --benefits-only ... --timeout 90` | Exit 2 by non-provisioning design; successful financial observations evaluated above; free-meter lookup failed. |
| GET-only readiness wrapper reusing #31 | Completed; server/DB/TLS/backups/inventories verified; optional administrator lookup failed as disclosed. |
| Existing `staging_preflight.py --hosting-skus-only ... --timeout 60` | Exit 2; empty SKU list, capacity/eligibility unknown. |
| Guarded protected-config SQL reader, initial runs | Exit 2 before connection; both required private values absent. |
| Resumed protected-config reader and boolean-only URI diagnostics | First stopped before connection on host parsing; owner corrected privately; final exact-target/TLS guards passed, reader exit 2 on rejected SQL authentication. |
| Bounded SELECT-only per-role diagnosis | Both runtime and migrator logins rejected authentication; no SQL results or writes. Diagnostic wrapper exit 0 means its report completed, not that SQL checks passed. |
| Owner-authorized local URI repair at 22:35 CDT | Both password components encoded using the known host boundary; valid existing percent sequences/credential semantics/ACL preserved; saved bytes and strict configuration guards passed. No database change. |
| Post-repair reader and per-role verification | Both exit 2; both role logins still rejected authentication, `ready=false`. No SQL results/writes; not reported ready. |
| GET-only hosting suitability/runtime and public retail queries | F1 rate USD 0/hour; native Python 3.12 and region advertised; provider unregistered, quota GETs 404; no allocation. |
| Certificate/hostname-verified PostgreSQL TLS probe | Passed TLS 1.3; no SQL login. |
| GET-only complete resource/usage wrapper | Completed; one resource, 14 records totaling reported USD 0. |
| `docker build --label org.opencontainers.image.revision=83ba85525e6db23fb5af150c0c705d1fe13f4def --file services/api/Dockerfile --tag dzirent-api:azure-phase1-83ba855 .` | Passed, unchanged frozen runtime; artifact above. |
| `docker run --rm -i --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --entrypoint python dzirent-api:azure-phase1-83ba855 -` with the bounded offline configuration/crypto probe | Passed; no network or hosted database. |

Not run: hosted HTTP health/readiness, any SQL SELECT/CRUD, migrations, restart/persistence against
Azure, public account provisioning, live mail, external hosted acceptance, production isolation
exercise or the full native-auth regression suite. Prior #61 results are referenced, not rerun claims.
No storefront/browser/AI development or manual UI suite was started in this phase. Publication CI is
separate exact-head evidence and will be recorded on the draft PR; it cannot prove hosted readiness.

## Deployment state, isolation and concrete next action

| Requested release field | Actual state |
| --- | --- |
| Hosted HTTPS endpoint | **None** |
| Azure deployment ID | **None** |
| Deployed Git revision | **None**; prepared source is recorded above |
| Tested hosted database operations | **None**, blocked before login |
| New cloud resource/configuration writes | **None** |

`dzirent_staging` remains staging and must not host real public production accounts by default.
No production database/role/environment isolation is established or claimed by this run. Public
registration stays inactive; outbound email remains disabled/unverified, with no verification bypass
or administrator grant. The existing web demo remains at https://dzirent.com/, source
`8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`, deployment `dpl_A7AvvLu1XmuzcWuvTRiRpHcTqAUd`,
confirmed READY by a fresh read-only provider lookup. No frontend environment/DNS/tag/alias changed.

**Next required input:** accepted passwords for the existing SQL roles in the protected file. Both
URLs are populated, encoding is repaired and configuration guards pass, but both SQL logins are
rejected. Do not repeat encoding/credential guesses or reset roles to bypass this gate. Then perform
strict SELECT-only schema/data/ACL inspection, confirm recovery/no concurrent writer, serialize only
needed additive migrations, allocate the verified minimal HTTPS host and narrowly scoped network
access, supply runtime-only secrets and the owner CA bundle at its verified Linux path, and perform explicit controlled staging CRUD plus persistence/
restart and external HTTPS verification. Distinguish SQL-role CRUD from authenticated HTTP business
writes; no synthetic account or email-verification shortcut is implied. Preserve/clean only the
specific approved test rows. A successful health check alone never proves CRUD.

No rollback is required because no cloud deployment/configuration/schema changed. Preserve the
existing web deployment; keep the local image if useful for the resumed staging rollout. Never drop
or downgrade data-bearing auth schema as an application rollback. **Stop this assignment at the
rejected protected SQL credentials; do not continue storefront, AI, public onboarding or a later phase.**
