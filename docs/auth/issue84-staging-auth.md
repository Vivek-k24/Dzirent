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
wording use the cleaned presentation. The registration-restricted placeholder is absent. The other
11 files and QA work from83 are not implicitly merged; no other agent/worktree/log is changed.

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

Local candidate checks passed; hosted activation/browser acceptance is pending. The exact deployed
candidate and actual staging results will be recorded before a ready PR. Failed/skipped checks are
not passes. Protected test email/password are read only from the owner-supplied separate file and
never copied into this report, artifacts, screenshots or logs. Initial private password was rejected
as shorter than the existing minimum; the owner corrected it privately. Policy was not weakened.

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
| API `ruff check` / `ruff format` on changed Python paths; `mypy` | Passed,31 source files for mypy. |
| `NEXT_PUBLIC_DZIRENT_MODE=connected pnpm build` | Passed Next16.4.2 production build,15 static pages. |

The test container used cached PG17.11 image
`sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`, tmpfs data, a random
loopback-only port and fresh local credentials. Native destructive fixture guards checked the
`*_test` target. Container ID/labels verified before removal; local generated password file cleared.
No Azure fixture, migrations/roles/firewall write or owner-input modification was performed.

Rollback starts by disabling the temporary signup setting, keeping the private proxy gate and mail
disabled, then using an approved known artifact if required. Preserve real accounts/session metadata
and all native keys. No automatic SQL downgrade, destructive fixtures, database restore or old-demo
promotion. Public demo is independent. Stop at one main-targeted reviewable auth PR after acceptance;
no full repo audit, pruning, media/AI phase or automatic main merge/public rollout follows.
