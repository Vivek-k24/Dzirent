# AUTH-EMAIL #64 â€” local implementation and verification

Local scope completed, 2026-10-22 (America/Chicago). [Draft PR #61](https://github.com/Vivek-k24/Dzirent/pull/61) remains unmerged. Scope is
[Issue #64](https://github.com/Vivek-k24/Dzirent/issues/64) only, not Phase 2B or hosted acceptance.

## Baseline and resulting behavior

- Assigned checkout: `H:\DziRent\worktrees\codex-web`, existing `codex/native-auth-phase1`.
- Exact authorized start: `5b130d3dfc16d5514dcde6815aea8d78aa47b9a0`, initially clean.
- Main merge base: `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`; main/worktrees preserved, no merge/reset.
- Tested code SHA: **`9e2af2cdb579aa18a5f4f0bd2e5854366c3e8f94`**.
- Backend implementation revision: `64814c132ffd3431c57191986d46e87d946c582b`; web/session revision is the candidate above.
- Contract remains `0.1.0-candidate.3`; no DTO/OpenAPI/generated client/canonical fixture change.
- No independent QA, security approval or real inbox delivery is claimed.

Registration now commits unverified renter account, digest-only token and encrypted PostgreSQL
outbox job together. Rollbacks cannot send. Restartable, expiring/fenced claims recover interrupted
work; bounded retries distinguish transient/permanent transport failures, clear poison/expired jobs,
and tolerate duplicate handoff without allowing token replay. Resend coalesces for one minute,
replaces old links afterward and recovers immediately after terminal delivery failure. Confirmation
refreshes existing Next.js session state from the API, without creating a login or auto-verifying
on page load. Existing CSRF, throttling, native-session, ownership and RBAC gates are preserved.

Detailed design, encryption/rotation, dispatch guarantees, operational tradeoffs and later activation
steps: [email workflow/runbook](email-verification.md). Historical #62 evidence stays unchanged.

## Environment and destruction safeguards

Pinned Python **3.12.15**, uv **0.13.1**, Node **22.23.3**, pnpm **10.29.3**, local Docker
`desktop-linux` over `npipe:////./pipe/dockerDesktopLinuxEngine`. `postgres:17.11` reported
`server_version_num=170011`. New owned container `dzirent-auth64-pg17` used **127.0.0.1:55464**,
a 512-MiB tmpfs data directory, random private SQL password and no external database/SMTP endpoint.
Existing user container `dzirent-local-db-1` on port 5432 was preserved.

Before test-database creation/destruction, all **36 pure target-safety tests passed**. The hardened
fixture printed sanitized host/port/database/role, required a single loopback PostgreSQL 17 target,
checked actual server version/current target, then recreated only `dzirent_auth64_test` and its
guarded local migration/ACL auxiliary `*_test` databases inside this owned container.
`DZIRENT_REQUIRE_DB_TESTS=1` was set; libpq override environment variables were removed in the test
subprocess. `DZIRENT_DATABASE_URL` was blank for module import/demo defaults; each TestClient
received its explicit disposable URL. No tunnel or hosted URL was used.

All application/test passwords were privately generated, not the owner's test-account input.
Private local helper files lived only under ignored `.tools/auth64`. Every pytest test blocks real
`SMTP`/`SMTP_SSL` constructors by default; mail tests explicitly replace them with pure fakes or an
in-memory mailbox. No TCP SMTP/mailbox/browser or hosted HTTP server was used.

## Actual command results

All commands ran from the assigned checkout. `$uv` below is
`.\.tools\bootstrap\Scripts\uv.exe`; Node and Corepack/pnpm came from
`.tools/node-v22.23.3-win-x64`. Each API command used `--directory services/api --frozen --python 3.12.15`.
The ignored `.tools/auth64/test.ps1` wrapper only loaded private local credentials/CSRF, cleared
libpq overrides, set the flags above, and invoked that pinned `uv run ... pytest` command.

| Check | Exact command / result |
| --- | --- |
| Database-target guards before destruction | `uv run ... pytest tests/test_auth_db_safety.py -q` â€” **36 passed**, 0 skipped |
| Required encryption dependency | `uv lock --directory services/api --python 3.12.15`, then `uv sync --directory services/api --frozen --python 3.12.15` â€” exit 0; only new required pin `cryptography==50.0.1`, existing pins retained |
| Initial focused regressions | `test.ps1 tests/test_auth_email_delivery.py tests/test_auth_email_outbox.py tests/test_native_auth_security.py -q --tb=short` â€” corrected run **67 passed**, 0 skipped, 28.02s |
| Additional focused mail/ACL/migration/Studio regressions | `test.ps1 tests/test_auth_email_delivery.py tests/test_auth_email_outbox.py tests/test_native_auth_acl.py tests/test_native_auth_migrations.py tests/workflows/test_studios.py -q --tb=short` ? **78 passed**, 0 skipped, 235.68s; final complete run also covers the subsequent slow-failure regression |
| Complete final API suite | `test.ps1 -q --tb=short` / `uv run ... pytest -q --tb=short` — **400 passed**, **0 skipped**, 340.91s, exact code `9e2af2cdb579aa18a5f4f0bd2e5854366c3e8f94` |
| Python static checks | `uv run ... ruff check src tests alembic/versions/0005_auth_email_outbox.py`; `uv run ... ruff format --check src tests alembic/versions/0005_auth_email_outbox.py`; `uv run ... mypy` â€” passed; 51 formatted files, 31 source files typed |
| API dependency audit | `uv run ... pip-audit --skip-editable` â€” exit 0, **no known vulnerabilities found**; editable `dzirent-api` intentionally excluded |
| Web unit suite | `pnpm --filter @dzirent/web test` â€” **38 passed**, 0 skipped, 3 files |
| Web TypeScript | `pnpm --filter @dzirent/web typecheck` â€” passed after fixture correction |
| ESLint | `pnpm lint` â€” passed |
| Contract drift | `uv run ... python -m dzirent_api.export_contract --check` â€” **OpenAPI matches FastAPI declarations** |
| Exact branch preview guard | Node `--test scripts/auth-deployment-guard.test.mjs` â€” **3 passed**, 0 skipped; final pre-push check recorded in PR |
| Whitespace / owned scope | `git diff --check` â€” passed; historical migrations 0001â€“0004, JS pins/lock, canonical contracts/fixtures and other agent logs unchanged |

Test warning: the pinned FastAPI TestClient emits Starlette's `httpx` deprecation warning. No
dependency upgrade was made for that unrelated warning. Dependency sync also reported a harmless
cross-volume hardlink fallback to copying files.

## Failures, corrections and reruns

The initial focused run had **64 passed / 3 failed**. It exposed acceptance of public HTTP auth
origins in demo configuration; origin validation now rejects non-loopback HTTP consistently. Two
new test harness errors were corrected: the crash hook targeted a different sessionmaker subclass,
and a cooldown fixture aged creation time without matching the DB's 24-hour lifetime constraint.
The corrected focused run passed all 67 cases.

The first complete run had **396 passed / 3 failed**, 0 skipped, 598.09s. Two new tests had been
collected before missing `ApiError`/`uuid4` imports were corrected. The third was an unchanged Studio
workflow receiving one coarse `OperationalError`/503 from the local database. The owned container
reported zero restarts and no OOM; no cause or product defect is asserted from that response alone.
The explicit Studio rerun passed with the focused 78-case run; the final complete suite passed all **400** cases. No unrelated Studio code was changed.

Static checking caught a web error fixture using `{}` instead of the contract's `details: []`.
That fixture is corrected. Review also caught retry due time being measured before SMTP socket
waits; backoff now starts after the failure, with a regression advancing a fake clock by 45 seconds.
Earlier results are not substituted for the final candidate's checks.

Initial publication `6bb3f4c13eba1e240f2f72f2695635c4ed233be3` triggered the automated secrets
scanner's `generic-api-key` rule on this report's line 12: the backend **Git revision** itself.
`git show` verified the value as the existing implementation commit. The line is relabeled and
only that exact historical commit/file/line fingerprint is documented in the existing root
`.gitleaksignore`. [Recorded integrator scope](https://github.com/Vivek-k24/Dzirent/issues/64#issuecomment-6345080654).
No scanner rule, workflow, broad exclusion or application behavior changed. The final automatic
CI/deployment metadata belongs to the draft PR's exact publication head, not this earlier failure.

## Test coverage and schema/privileges

- Real PostgreSQL account/token/job commits and rollback/commit-failure isolation; ciphertext at rest,
  random independent AEAD envelopes, authentication/tamper rejection, old-key rotation and fail-closed
  missing configuration before account writes. Encrypted work survives a config outage.
- Claim/restart/lease fencing, multiple worker races, send-success/ack-loss duplicate link and stable
  Message-ID, single-use confirmation, sender/resend serialization and superseded queued work.
- Transient recovery, retry timing/exhaustion, permanent rejection, poison isolation, expiry, ineligible
  account/credential, changed origin, immediate resend after failure, cooldown and honest generic
  duplicates. Existing normalization/rate/ownership/RBAC/session/security tests stay active.
- Strict plaintext message rendering/headers/private fragment URL, reserved addresses, SSL/STARTTLS
  certificate/hostname context, TLS failure before credentials, fake SMTP 4xx/5xx/cert/timeout paths,
  proper close and no insecure fallback. This does not prove a real TLS handshake or inbox receipt.
- New forward `0005_auth_email_outbox` from unchanged 0004 preserves existing credentials/identity;
  ORM parity, idempotent upgrades, empty downgrade and refusal to discard outbox data; runtime
  claim/finish/cleanup grants and immutable-column/admin/token denials; broad inherited ACL rejection.
- Cleanup batch limits, abandoned sixth claim, immediate ciphertext erasure and seven-day terminal
  metadata pruning. Expiry while all workers are stopped remains a documented operational limit.
- Focused web unit checks: no automatic confirmation, API-derived refreshed verification/ordinary
  renter state, rejected links, signed-out visitor and fail-closed unavailable session read.

## Excluded work and review handoff

**Not run:** Playwright/Chromium/browser tests, live Next-to-FastAPI E2E, hosted/Vercel smoke,
real SMTP/mailbox, Azure/AWS/Neon migrations/provisioning/accounts, real admin grants, production
build/deployment/domain configuration or manual external CI workflows. These are deliberately
outside #64, not skipped tests claimed as passes. Automatic GitHub checks after a guarded push are
incidental CI, not authorization/acceptance for those excluded tests.

No actual SMTP provider/sender, SPF/DKIM/DMARC, bounce/deliverability, hosted TLS, operational abuse
monitoring or backup/physical erasure is verified. Handoff is at-least-once bounded email work, not
guaranteed inbox receipt. Missing/damaged keys can require authenticated resend; SQL privileges,
key custody and production operational limits still need owner/security review.

After the clean full run, the verified owned container was stopped and removed; its tmpfs test
data disappeared with it. The three private helper files were removed with literal local paths;
all three `Test-Path` checks returned `False`. The original `dzirent-local-db-1` remained healthy.
Publication changes documentation and the exact historical scanner fingerprint after tested code; the PR records its exact head and
automatic CI. Source branch suppression was rechecked before push; no provider setting was changed.

## Exact changed files relative to authorized #64 baseline

34 files; all are in the recorded auth handoff or integrator documentation/tooling scope.

```text
.gitleaksignore
apps/web/src/app/auth/_components/connected-auth.tsx
apps/web/src/app/auth/_components/recovery.tsx
apps/web/src/lib/auth.ts
apps/web/src/lib/verification.test.ts
docs/PROJECT_STATUS.md
docs/agents/codex.md
docs/architecture/0005-native-authentication.md
docs/architecture/ownership.md
docs/auth/email-verification-test-report.md
docs/auth/email-verification.md
services/api/.env.example
services/api/README.md
services/api/alembic/versions/0005_auth_email_outbox.py
services/api/pyproject.toml
services/api/src/dzirent_api/auth/delivery.py
services/api/src/dzirent_api/auth/dispatch.py
services/api/src/dzirent_api/auth/mail_crypto.py
services/api/src/dzirent_api/auth/outbox.py
services/api/src/dzirent_api/auth/router.py
services/api/src/dzirent_api/auth/service.py
services/api/src/dzirent_api/db.py
services/api/src/dzirent_api/health.py
services/api/src/dzirent_api/main.py
services/api/src/dzirent_api/orm.py
services/api/src/dzirent_api/settings.py
services/api/tests/conftest.py
services/api/tests/test_auth_email_delivery.py
services/api/tests/test_auth_email_outbox.py
services/api/tests/test_native_auth.py
services/api/tests/test_native_auth_acl.py
services/api/tests/test_native_auth_migrations.py
services/api/tests/test_native_auth_security.py
services/api/uv.lock
```
