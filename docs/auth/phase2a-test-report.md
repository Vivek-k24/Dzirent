# AUTH-CONNECT Phase 2A — local test and corrective handoff

Local phase completed on 2026-10-21 (America/Chicago; final checks continued into 2026-10-22 UTC).
Owner review remains required in [draft PR #61](https://github.com/Vivek-k24/Dzirent/pull/61).
Authority: [issue #62](https://github.com/Vivek-k24/Dzirent/issues/62), **Phase 2A only**.
Parent #26 stays open. No merge, deployment, hosted accounts/migrations or Phase 2B acceptance.

## Exact baseline and code

- Assigned checkout: `H:\DziRent\worktrees\codex-web`, branch `codex/native-auth-phase1`.
- Pinned PR #61 starting SHA: `db7d1888183c6362ad5087ab1fc13a4bed983114`.
- Main base, preserved without merging: `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`.
- Tested code candidate: **`82450720030d7fde31aeb04b432104bbbce0a28a`**.
- Preview guard: `aa18e9feab43a48e0f68cfe8ede9079537185cba`.
- API/security/regressions: `7b16e8dd396e8234e7bd6e1012608fbc02f169c2`.
- Web/Chromium handoff: `82450720030d7fde31aeb04b432104bbbce0a28a`.
- Contract remains `0.1.0-candidate.3`; no DTO/OpenAPI/generated client/fixture-data change.

Report/status commits descend from the tested code and change documentation only. PR metadata
records their exact publication head and automatic CI results. No history rewrite, main push,
branch switch, dependency upgrade, other worktree edit or other agent's status edit occurred.
No independent QA/security approval is claimed; these are Codex's local regression results.

## Environment and destruction safeguards

Windows PowerShell; Node 22.23.3, pnpm 10.29.3, Python 3.12.15, uv 0.13.1. Commands below
use `uv`, `node` and `pnpm` for the pinned `.tools/bootstrap/Scripts/uv.exe`,
`.tools/node-v22.23.3-win-x64/node.exe` and its Corepack `pnpm.js` invocation respectively.

Docker used the local Desktop Linux named-pipe context. Created only the dedicated
`dzirent-auth62-pg17` container, image `postgres:17.11`, bound to **127.0.0.1:55462**,
with a 512 MiB tmpfs database directory. The existing user container/5432 service was untouched.
Actual server: `17.11 (Debian 17.11-1.pgdg13+2)`. No hosted database/tunnel was used.

Before the first DROP/CREATE/TRUNCATE, pure guard tests passed 35 cases. Final strengthened
coverage passes 36: single exact loopback, explicit port/login/password, psycopg driver, safe
lowercase SQL identifier of at most 63 characters ending `_test`, no staging substring or
production-name parts, no multihost/query/service/libpq target overrides. `localhost` must
resolve exclusively to loopback. SQL uses only validated/quoted names. Actual server PG17 and
database/login are checked before destruction. `DZIRENT_REQUIRE_DB_TESTS=1` was set throughout.
Only sanitized hostname/port/database/role were printed, never passwords/connection strings.

Main test DB: `dzirent_auth62_test`, local owner `auth62_owner`. Auxiliary disposable databases
were `dzirent_auth62_acl_test`, `dzirent_auth62_migration_test`, `dzirent_auth62_browser_test`.
Local `dzirent_migrator`/`dzirent_app` and an unexpected-reader role simulated the hosted ACL
split. The browser API actually used the restricted `dzirent_app` login; migration/seed used
the local migrator. No real SQL roles or real admin privileges were changed.

All account passwords/keys were generated privately for these tests. Only salted Argon2id
password hashes and token/session digests persisted. The owner's staging password was never
used. Operator identities and administrator evidence were fabricated locally; evidence was
temporary/private. SMTP was mocked in memory, including TLS-constructor tests; no real email.
Trace, screenshots and video were disabled for connected acceptance. Browser requests were
restricted to loopback. Test-only control endpoints are absent from production source and
the BFF allowlist, require a private header and reject browser Origins.

The Windows hard interrupt initially bypassed harness cleanup. After checking its exact local
target/ownership, only its browser DB and two SQL roles were removed. The harness now has a
private graceful-stop command: it exited **0**, and direct PG queries confirmed **0** browser
databases and **0** remaining migrator/app roles. Final main-test head was `0004_native_auth`.
After validation the dedicated test container/tmpfs was removed. Auth ports 3500/8500 have no
listeners, and its three private runtime files were deleted using verified absolute paths.
The original user database container remained running. No local test account/key was retained.

## Final command results

Counts are per invocation, not additive; focused cases are also included in the full API run.
No skipped case is reported as a pass.

| Executed command / scope | Actual final result |
| --- | --- |
| `uv run --directory services/api --frozen --python 3.12.15 pytest -q --tb=short` | **337 passed, 0 failed, 0 skipped**, 190.23 s; includes existing PG workflows and all native regressions |
| Same pytest command with `tests/test_auth_db_safety.py` | **36 passed**, 0 skipped; no database connection |
| Same pytest command with `tests/test_native_auth_acl.py` | **3 passed**, 0 skipped, after reproducing/fixing two grant defects |
| Same pytest command with `tests/test_native_auth_migrations.py tests/test_native_auth_operator.py` | Earlier focused batch **21 passed**; final full run includes the added staging-name case, **7 migration + 15 operator** cases |
| Same pytest command with `tests/test_native_auth.py` | **19 passed**, 0 skipped; included unchanged in the final full run |
| `tests/test_native_auth_security.py` | Final full run passes **12 cases**: delivery/commit/savepoint/capacity/timing, parallel limits, cookie/TLS, dormant identity, signup/reset races and rehash/dummy work |
| Same pytest command with `tests/test_platform.py` | **8 passed**, 0 skipped, after test-isolation fixes; final full run also passes |
| `pnpm check` | Exit **0**: ESLint, TypeScript, media, Ruff/format, Mypy, contracts, fixtures |
| Final `pnpm lint` and `pnpm build` after the Host correction | Both exit **0**; production demo build and TypeScript compilation succeed |
| `uv run --directory services/api --frozen --python 3.12.15 ruff check . ../../tests/auth/local_api.py ../../fixtures/catalog/generate.py ../../scripts/validate_foundation.py` | Exit **0** |
| Same Ruff command with `format --check` | Exit **0**, **55 files already formatted** |
| `uv run --directory services/api --frozen --python 3.12.15 mypy` | Exit **0**, **29 source files** |
| `pnpm contracts:check` (within `pnpm check`) | Exit **0**, FastAPI/OpenAPI match and regenerated TypeScript has no drift |
| `pnpm fixtures:check` (within `pnpm check`) | Exit **0**, deterministic **8 roots / 40 leaves / 40 garments / 39 schema-valid operation examples** |
| `pnpm --filter @dzirent/web exec vitest run` | **33 passed**, 0 skipped: 14 existing mock-catalog cases and 19 BFF cases |
| `node --test scripts/auth-deployment-guard.test.mjs` | **3 passed**, 0 skipped; reproduces old slash-branch glob problem and verifies both exact-branch guards |
| `pnpm exec playwright test --config tests/workflows/playwright.config.ts` | **10 passed**, 0 skipped, desktop/mobile Chromium, 1.7 min; includes every canonical image/PDP/refresh and collection/Studio workflows |
| `pnpm exec playwright test --config tests/auth/playwright.config.ts` | **4 passed**, 0 skipped, actual local Chromium → Next → FastAPI → PG17, 42.0 s |
| Private graceful harness stop + direct `psql` metadata queries | Exit **0**; browser DB/role counts 0/0, main test DB head `0004_native_auth`, PG17.11 |
| `git diff --check` | Exit **0** |
| Private-value scan of the reviewable diff/new files | Exit **0**, **41 files / 3 ephemeral secret values**, none found; no values printed |

`pnpm check` passed before the final Host regression and later test additions. Affected final
checks were rerun: ESLint, production build/TypeScript, web tests, full API tests, Ruff/format
and Mypy. API declarations, generated clients and canonical fixture data did not change after
the successful drift checks. The later harness-only shutdown change was independently exercised
through its real private stop endpoint and verified cleanup; normal auth routes were unchanged.

One warning remains: Starlette's existing httpx TestClient deprecation. No dependency upgrade
was made to suppress it. Node's existing FORCE_COLOR warning also appeared in browser runs.

## Demonstrated defects and corrected behavior

1. **Recovery CI:** baseline `react-hooks/set-state-in-effect` failed. Hydration now gates the
   browser-only form; private fragment state initializes once, the effect only clears the URL,
   and opening a link never confirms it. Actual browser verify/reset flows pass.
2. **SMTP before commit:** three initial repros failed (uncommitted link, rollback link, shared
   proxy lockout). Delivery now reserves bounded process-local capacity and submits only after
   acknowledged root commit. Failed commit/rollback/close discards jobs. Savepoints are refused;
   no-op/early rollback frees capacity. Follow-up tests caught and fixed both queue edge cases.
3. **Shared proxy throttling:** one signed client cannot consume unrelated clients' limits just
   because they share the Next peer. Identifier and per-action aggregate budgets remain. Failed
   auth commits counters independently; parallel updates, 15-minute reset, aggregate exhaustion,
   cookie tampering/expiry and forged forwarded-IP headers are covered. Rejected earlier buckets
   do not drain later aggregate budgets. Signup/recovery share a response floor and reserve mail
   capacity equally; local timing checks pass without claiming constant-time behavior.
4. **SQL isolation:** the runtime could update rate-limit keys, and an unexpected default reader
   could read new auth tables. The unmerged `0004` now removes inherited non-owner ACLs **only on
   its six new tables**, then grants required runtime SELECT/INSERT/column UPDATE. It changes no
   role/default privileges/existing table ACLs. Real runtime login/verify/change/logout passes;
   DDL, migration writes, protected columns and grant/audit writes are denied.
5. **BFF Host:** a focused test reproduced accepting an unapproved Host. The exact HTTP Host is
   now checked, with no trust in X-Forwarded-Host. The first Chromium attempt exposed Next's
   internal localhost normalization; a regression proves the approved HTTP authority works
   while spoofing fails. Path/query injection, header stripping, body bounds, cookie validation,
   no redirects, API errors and fail-closed connected UI pass through the real BFF.
6. **Operator/test guards:** staging-name suffixes, unsafe identifiers and inherited target
   overrides fail closed before connecting; runtime owner operations are refused. Prompt/env
   password input, independent hashes, idempotency, mismatch abort, legitimate metro enrollment
   and reserved-domain no-mail behavior pass. A fabricated local admin has no implicit privilege;
   private evidence/UUID confirmation, expiry, revocation and audit are tested.
7. **Existing test/static assumptions:** native placeholder expectations were updated from 503
   to actual unauthenticated 401, valid production config needs HTTPS auth origin, and operator
   narrowing/import/format failures were corrected. The health test now restores its prior head
   instead of hardcoded 0001, and its missing-DB negative case explicitly supplies an empty URL.
   Canonical fixture generator edits are formatting only, with deterministic drift validation.

Fresh `0001→0002→0003→0004`, upgrade from `0002`, head/ORM parity, no-op upgrade, empty rollback
and native-data preservation guards pass. Mock subjects remain mock; legacy-provider rows block
upgrade; dormant native subjects cannot acquire a credential through signup. Historical 0001–0003
are unchanged. Signup is unverified ordinary renter membership, never platform admin. Verified
lender enrollment preserves renter membership and requires an actual reference metro. Cross-owner
listing/Studio access is a non-enumerating 404. Sessions rotate/expire/revoke; password changes,
single-use recovery, replay/wrong-purpose/expired tokens, inactive accounts and concurrent token
consumption pass. Secure HTTPS cookie attributes were simulated locally; real HTTPS is untested.

The four Chromium cases exercise signup/verification, keyboard sign-in, reload restoration,
private recovery/reset, logout/deactivation, lender enrollment, two authenticated account contexts,
no credential/identity browser storage, forbidden headers/path/CSRF/body/Host/redirect behavior,
and a visible API outage with no mock identity fallback. Normal renter/lender flows had no uncaught
page exceptions. Expected 401/403/404/413/503 responses are assertions, not hidden browser failures.

## Failed/partial attempts retained as evidence

- Initial static check stopped at recovery ESLint; later attempts exposed the new proxy test's
  HeadersInit typing, Phase 1 Ruff formatting/imports and operator Mypy narrowing. Each was fixed
  and its affected gate rerun; a stopped command did not validate later gates.
- Initial existing-PG selection: **34 passed / 4 failed** (stale identity/config assumptions),
  followed by correction and the final full pass.
- Initial security repro: **3 failed**. Initial ACL batch: **1 passed / 2 failed**. Initial
  additional security batch: **8 passed / 2 failed** (savepoint and reservation release). Corrected
  cases pass and are included in the final 337.
- Strengthened pure DB guard initially **35 passed / 1 failed** for `dzirent_staging62_test`;
  corrected guard passes all **36** before subsequent destructive runs.
- Initial BFF tests **17 passed / 1 failed** for Host acceptance; final BFF set **19 passed**.
- First connected browser attempt: **1 failed, 1 interrupted, 2 not run** after the internal-URL
  Host problem. Next: **2 passed / 2 failed** because recovery copy and exact label selectors in
  the new tests were wrong. The affected rerun: **1 passed / 1 failed**, exposing an incorrect
  dashboard-heading assertion. Selectors were aligned with actual accessible roles/copy; the
  final complete suite passes **4/4**. Interrupted/unrun tests were never counted as passes.
- First full API run: **336 passed / 1 failed**, the test-isolation defect described above.
  Affected platform run **8 passed**; final full run **337 passed / 0 skipped**.
- Harness preparation first used an unsupported Windows PowerShell RNG convenience method;
  it was replaced with the supported cryptographic RNG instance. A cleanup inspection included
  unavailable `dblink`; direct connections replaced it. A private-value scan first used uv's
  service cwd instead of Git root; the corrected root scan passed. None of these partial
  diagnostics was represented as successful validation or changed a hosted resource.

## Preview restriction and automatic CI

The old `"*": false` guard does not match a slash-containing branch under documented minimatch
semantics; unmatched branches default to enabled, and any matching true rule enables deployment.
Both repository configs now explicitly set `"codex/native-auth-phase1": false`. The existing
main rule remains unchanged. The three local guard tests verify the exact matching behavior.
Reference: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

Before publication, **read-only** `vercel project inspect --non-interactive --scope vivekkallakuri-8617`
using the existing CLI 59.23.2 confirmed the intended existing `dzirent` project, `apps/web` root,
and explicit demo build command. No link, environment pull, settings update, deploy or hosted HTTP
test was performed. An exact-code-SHA deployment metadata query returned **0 deployments** before
publication; that alone is not proof of post-push suppression. The publication head's metadata
must also be checked and recorded in PR #61 without deploying anything.

At report preparation PR #61 was open/draft at the pinned initial SHA; its old Foundation check
failed on the recovery effect and its existing security/PG checks passed. New automatic GitHub
checks can start only after the source guard is resolved. Their exact head/outcomes are recorded
in the PR update, separate from these manually executed local results. Existing CI does not run
the entire new local auth/Chromium matrix; no claim that it does. No manual workflow dispatch.

## Remaining risks and proposed Phase 2B — not executed

- Queue delivery is bounded but not durable across process loss; SMTP failure after commit needs
  resend, and mail/counter/token retention plus monitoring remain operational work.
- Anonymous clients can acquire fresh signed client cookies; identifier limits may be targeted.
  Local timing/concurrency evidence is not internet load, DoS resistance or a constant-time proof.
- Real SMTP TLS handshake/deliverability, hosted PG TLS/ACLs/persistence, HTTPS cookies/BFF behavior
  and a hosted connected deployment are **not tested**. No Azure/AWS/Neon calls, real email,
  staging account insertion, real administrator grant or live-demo change occurred.
- The owner's existing administrator identity/origin is still unverified. Fabricated local evidence
  is not evidence for a real grant. No MFA, email-change flow or reactivation added.
- `0004` is an unmerged migration corrected before authorized hosted application. If another
  environment already applied an older `0004`, do not assume `upgrade head` changes its ACLs:
  stop and review a forward migration/preservation plan. Inspect the actual hosted head first.
- Independent owner/security review and explicit new Phase 2B authorization remain required.

Proposed gated checklist (no action is inferred):

1. Obtain owner authorization for the exact staging host/database, migrator/runtime roles, cost
   boundary, backup/rollback plan and expected schema head; inspect them without destructive helpers.
2. Review migration/ACL/queue/rate-limit changes, reconcile parallel work serially, then authorize
   any hosted migration separately. Never send the DROP/TRUNCATE pytest URL to staging.
3. Review a sender and mail provider/TLS/delivery/retry/monitoring policy; keep secrets server-only.
4. Privately discover the existing designated admin identity and ownership evidence; approve any
   capability grant separately. Confirm synthetic identities/private password policy before inserts.
5. Authorize a protected HTTPS API/frontend origin and gated hosting/preview workflow; test actual
   cookies, persistence, recovery and ownership without replacing the live demo until accepted.

Local rerun/start/stop instructions: [tests/auth/README.md](../../tests/auth/README.md).
