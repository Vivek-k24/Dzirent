# Issue84 — protected native staging signup

Owner scope: [issue84](https://github.com/Vivek-k24/Dzirent/issues/84), one native-auth consolidation.
The story is protected preview signup → Next server proxy → FastAPI registration commit → ordinary
native login → PostgreSQL-backed cookie session → refreshed account UI. Public production is unchanged.

## Exact integration and ownership

Current-main base `8bbc9eb1e2eabb5bb73fefc85963498b03b0f0b9`, includes merged60. Isolated branch
`codex/auth-integration-issue84`, checkout `H:\DziRent\worktrees\codex-auth-integration-84`.
Targeted ancestry proves61 `8c98d88d5a12164d562f595dc1f3f78d031f1db6`,71
`1d48763ed8c4a43b8fb690233d74c92264af617b` and76
`a02e180f0147f4f06fd61d47c1f3997b922e9e6b` already in78
`fd775dda458c25fb4ac2d81e1285caecf051de0e`. Integrated78 once with merge211ee3f; main owner
assets preserved. No repeated migration/cherry-pick, branch reset, force push or main merge.

From83 `d62da9c8215bf10043c851a638364e9ca21710bf`, only auth-dialog/providers/shell and necessary
header CSS were reconciled. Conflicts retained real ConnectedAuth, restoreSession/query isolation,
server-cookie logout/failure handling and account security links. Header/demo controls/footer/account
wording use the cleaned presentation. The registration-restricted placeholder is absent. Only the three existing no-banner assertions in83’s collections test were carried forward to
match this required header. The other10 files are not implicitly merged; no other agent/worktree/log is changed.

## Configuration and security gates

| Name | Destination / behavior |
| --- | --- |
| `DZIRENT_AUTH_STAGING_SIGNUP_WITHOUT_EMAIL` | Azure App Settings only. Single temporary default-off setting. True only in connected/native staging at the existing protected preview origin; false in every normal environment. Production activation refuses startup. |
| `DZIRENT_AUTH_STAGING_PROXY_KEY` | Secret in Azure App Settings and encrypted Vercel server-side **auth branch/preview only**. Cryptographically random, never browser/public/GitHub/owner-input file. Separately enforces direct API access restriction even with signup setting off. |
| `DZIRENT_AUTH_EMAIL_BACKEND=disabled` | Retained Azure setting; no SMTP. |
| `DZIRENT_AUTH_EMAIL_WORKER_ENABLED=false` | Retained Azure setting; no delivery worker. |
| `DZIRENT_API_UPSTREAM_URL`, `DZIRENT_WEB_ORIGIN` | Existing Next server-only routing; exact API and existing stable protected staging origin. |
| `NEXT_PUBLIC_DZIRENT_MODE=connected` | Existing nonsecret preview build selector; no browser-controlled auth/verification exception. |

Runtime still uses existing typed Settings, application-role DSN, verify-full/CA, CSRF and AES keys.
No administrator/migrator in web/runtime, new GitHub secret, private owner-input edit, DB ACL/firewall
change, migration0001–0005 edit, cloud resource or dependency upgrade. No real admin or seeded account.

Vercel protection and CORS do not protect direct public Azure requests. A private server credential
must be checked independently by FastAPI before accepting auth or domain API work. Only exact
live/ready paths remain publicly readable; a forged correct Origin without the key still gets403.
The Next proxy never accepts this credential from browser headers. Existing native cookies, CSRF,
origin checks, request bounds, throttling and verified-only lender/admin boundaries stay active.

Rollout order: test source locally; configure key with exception **off**; deploy protected preview
and staging API; independently prove direct Azure denial and protected proxy success; then activate
the single staging signup setting. Never activate if protection, credential custody or denial fails.
No paid resource or production/DNS/alias promotion is authorized. Keep automatic deployment guards false.

## Account behavior and eventual removal

Registration keeps generic202 `AuthNotice`; duplicate/dormant email never receives a new password.
The browser then calls normal login after the committed response and accepts only its genuine
cookie-backed session. Wrong/unknown credentials keep the existing generic401. Password exists only
in private input/process/form memory; DB stores salted Argon2id. No raw session token is returned or
persisted in browser storage. Email timestamp stays null, email_verified=false, synthetic=false,
renter membership only, no capabilities/lender profile. Staging permits ordinary own profile and
preferences; lender enrollment, listing/Studio access and admin still require existing verification
and role/ownership rules. The UI truthfully shows pending verification. No recovery-delivery claim.

Once an authorized sender/provider is available, set the **single temporary setting false**, validate
normal Settings, configure the existing SMTP/key/worker workflow, restart and verify normal delivery.
Existing unverified users can sign in to limited account/security/status access, request verification
and explicitly confirm a real token. They must verify before ordinary profile/preferences or lender
access; never backfill verification timestamps, grant roles, alter password hashes or reseed identities.
The staging proxy credential stays in place until a separately reviewed access design replaces it.

## Verification record

Required local and **actual hosted auth acceptance** completed on frozen application source
`9a2d9c67ec118d41abbe1c39e24456e1214c2f65`; subsequent report commits change documentation only.
The extra Windows demo workflow has a separate unresolved timeout below. Failed/skipped checks are
not passes. Protected test email/password were read only from the owner-supplied separate file and
never copied into this report, artifacts, screenshots or logs. The owner privately corrected an
initial short password and later a reserved sample mailbox. Neither policy was weakened.

### Deployed candidate and actual browser/SQL results

Protected preview: https://dzirent-git-codex-connected-staging-stage3-vivekkallakuri-8617.vercel.app
at deployment `dpl_HDnbfRoScriWerwugpuiowUCBSnR`, actual Git source9a2d9c6, Preview target (not production).
Existing Azure API: https://dzirent-api-staging-4265.azurewebsites.net/api/v1, publication
`9cfd0563-6413-4d93-a9cb-5e2a8c0be866`. The actual Oryx archive's release manifest reports the same
full source SHA and schema0005; artifact SHA256
`92bb604835295e646b93121c39fdd332c063ffcc6935db70b971225248b124aa` (48 archive files).
Only the existing protected staging alias moved. Production `dzirent.com` stayed on
`dpl_A7AvvLu1XmuzcWuvTRiRpHcTqAUd`, source `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`.

The following results are from actual Chromium → protected Vercel → Next proxy → Azure FastAPI →
Azure PostgreSQL, using the real private owner-controlled test input. No fake account or seeded
identity was used. Browser access used an origin-scoped short-lived development OIDC header from
the existing authenticated CLI; protection stayed enabled. No token or credentials were persisted.

| Actual check | Observed result |
| --- | --- |
| Public preview / direct Azure exposure | Unauthenticated preview302; direct Azure csrfGET/registerPOST with correct Origin but no server key403. Private proxy challenge200 and anonymous session401. Verified before enabling signup. |
| One signup action | Browser register202 followed by ordinary login200, genuine Secure/HttpOnly/host-only/SameSite=Lax session. No browser credential/session/identity storage. |
| SQL identity | Exactly one real active native account, matching Argon2id password, `email_verified_at IS NULL`, synthetic=false, renter only, zero lender/admin grants/tokens/outbox jobs. Read-only application-role transaction, verify-full/CA, TLS1.3, schema0005. |
| Persistence | Browser header/account and session/me restore on refresh. Actual API restart200, new container markers at23:18:57Z, readiness200; original cookie still authenticates session/me and restored account UI. |
| Ordinary vs elevated access | Own profile/preferences PATCH200. Unverified lender enrollment/listing/admin403; lender UI requires verification. No role or ownership exception added. |
| Pending verification/delivery | UI says pending; resend and recovery fail truthfully with mail disabled. No verification claim, mail job or delivery attempt. |
| Negative/security behavior | Invalid inputs and browser verification/role claims422, bad CSRF403, foreign Origin403; duplicate202 cannot replace password; unknown/wrong login generic401;10 unknown logins401 then429 with Retry-After900. |
| Logout / re-login / revocation | UI logout makes current and replayed cookie401; original password logs in to the same account. Password-confirmed logout-all204; browser/replayed cookie401. Final read-only SQL: all3 hashed sessions revoked, account/hash/unverified/renter state preserved. |
| Browser errors | Zero uncaught page errors in the completed focused auth runs. |

[Sanitized machine-readable evidence](issue84-staging-evidence.json) retains individual results,
timestamps and failed attempts. The initial long browser run completed34 assertions but its final
logout-all label selector timed out. A focused UI rerun used the existing fixed control IDs,
received204 and independently checked cookie rejection plus zero active SQL sessions. Application
code stayed unchanged. Do not describe the interrupted original run as a single all-green run.

Runtime preparation first hit a Windows CLI wrapper failure; direct Node CLI stdin relay succeeded
without printing or saving the private key. The automatic-alias list did not include the manually
assigned staging alias; the dedicated alias endpoint verified its exact target before activation.
An initial reserved-mailbox422 created no account. After the owner corrected it, the first attempt
returned503 following the App Settings change. An explicit existing staging API restart and fresh
container/readiness proof preceded successful signup. Runtime changes require this restart gate;
App Settings readback alone does not prove the running process has reloaded.

No new cloud resource or paid tier was created. Reused Azure F1 Free and active Vercel Hobby; no
billing/spending-limit change. Existing PostgreSQL credit usage continues; this issue did not measure
an incremental database bill or claim zero existing database cost. Zero GitHub Secrets were created.
Only Azure's two new auth setting names and four auth-branch Preview variables were configured;
existing values stayed unchanged. No private owner-input, SQL ACL/role/firewall or migration edit.

### Startup, review and remaining gates

Azure startup remains `bash infra/runtime/start-appservice.sh` (normal mode, no diagnostic override).
It verifies/copies the public CA and starts uvicorn without access logs. Vercel uses the existing
`apps/web` root, pinned Node22 and connected production build. Automatic deployment guards remain
false. Existing hosted native keys and application-role DSN were preserved; no administrator or
migrator setting was put in runtime or Vercel. Deployment tooling reused VS Code Entra and the
authenticated Vercel project; no custom application secret retrieval or GitHub credential was added.

Review branch `codex/auth-integration-issue84`, exact tested/deployed source9a2d9c6. Inspect this
branch's auth tests and report; do not run Azure migrations or destructive DB fixtures. For isolated
local DB tests use only an owned loopback `*_test` PostgreSQL17 target with the existing destruction
guards. Connected browser acceptance uses the protected URL above and owner input read privately;
do not seed or reset the real account to repeat signup. It is retained unverified and signed out.

CI/reviewer approval and any main merge are separate gates. SMTP delivery/token-click acceptance and
positive verified lender/admin real-account flows were not run. No public-production cutover,
DNS/network/role changes, other issue or follow-up phase is included.

Frozen dependencies installed locally: pnpm10.29.3 offline/frozen355 packages, uv0.13.1
Python3.12.15 frozen/offline81 packages. No lockfile change; uv hardlink fallback warning only.

Actual local checks (PowerShell, pinned tools), source tree frozen after these checks:

| Command / environment | Result |
| --- | --- |
| `python -m pytest -q tests/test_staging_signup.py tests/test_native_auth.py tests/test_native_auth_security.py tests/test_native_auth_acl.py tests/test_auth_email_outbox.py tests/test_auth_email_delivery.py`, `services/api`, owned loopback PG17.11, `DZIRENT_REQUIRE_DB_TESTS=1` | **120 passed**, no skips, one pinned Starlette/httpx deprecation warning,152.30s. No cloud credentials or real SMTP. |
| `pnpm --filter @dzirent/web test -- src/lib/signup.test.ts src/lib/verification.test.ts src/app/auth/api/proxy.test.ts` | **44 passed /4 files**; runner selected the four web test files. |
| `pnpm typecheck` | Passed client and Next route generation/TypeScript. |
| `pnpm contracts:check` | Runtime OpenAPI and generated TypeScript byte drift checks passed; candidate.3 unchanged. |
| Targeted `pnpm exec eslint` on changed auth/proxy/header sources/tests | Passed. |
| `pnpm check`, frozen/offline tool environment matching Foundation configuration | Passed complete deployment guards, full root ESLint, TypeScript, all40 licensed image checks, Ruff/check-format60 files, mypy31 sources, contract drift and deterministic fixtures. |
| API `ruff check` / `ruff format` on changed Python paths; `mypy` | Passed,31 source files for mypy. |
| `NEXT_PUBLIC_DZIRENT_MODE=connected pnpm build` | Passed Next16.4.2 production build,15 static pages. |
| `NEXT_PUBLIC_DZIRENT_MODE=demo pnpm build` | Passed, same frozen source. |
| `pnpm exec playwright test --config tests/workflows/playwright.config.ts tests/workflows/collections.spec.ts`, Windows loopback demo13384 | **3 passed/1 failed**: desktop all40 PDP refresh remained in Loading outfit past12s. Isolated desktop retry failed on a different sample product. Not an auth acceptance pass. |

A diagnostic with50 reloads of one demo PDP passed without page errors; that does **not** replace
the failed all40 navigation case. The broader Windows demo timeout remains an explicit review/CI
concern. No assertion was deleted, timeout raised or unassigned UI/MSW path changed to hide it.

The test container used cached PG17.11 image
`sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`, tmpfs data, a random
loopback-only port and fresh local credentials. Native destructive fixture guards checked the
`*_test` target. Container ID/labels verified before removal; local generated password file cleared.
No Azure fixture, migrations/roles/firewall write or owner-input modification was performed.

Rollback starts by disabling the temporary signup setting, keeping the private proxy gate and mail
disabled, then using an approved known artifact if required. Preserve real accounts/session metadata
and all native keys. Never restore an older API artifact that lacks the private proxy gate while
calling it restricted staging. No automatic SQL downgrade, destructive fixtures, database restore or
old-demo promotion. Public demo is independent. Stop at one main-targeted reviewable auth PR after acceptance;
no full repo audit, pruning, media/AI phase or automatic main merge/public rollout follows.
