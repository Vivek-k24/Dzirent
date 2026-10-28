# Issue #26 — Phase 1 implementation handoff

Historical Phase 1 snapshot below. Issue #62 subsequently authorized **local Phase 2A only**;
its [test report and corrective handoff](phase2a-test-report.md) supersede the untested findings.
No Phase 2B, hosted migration/account, deployment or merge authorization is inferred.

**Implemented but untested. Draft owner review only.** No Phase 2 permission is inferred.
Base `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`, branch `codex/native-auth-phase1`, assigned
checkout `H:\DziRent\worktrees\codex-web`. Exact committed head and full changed-file list are
recorded in the draft PR. [Design/threat/migration note](../architecture/0005-native-authentication.md).

## Delivered source

- Native email/password registration/login, cookie-session resolution, logout/logout-all,
  password change, verification/resend, recovery/reset and password-confirmed deactivation.
- Canonical user relationships preserved; additive `0004_native_auth` after immutable `0003`;
  guarded SQL grants, independent renter/lender roles and an owner-only auditable admin capability.
- Same-origin Next transport, connected auth forms, session checking/unavailable/restoration,
  renter/lender navigation and account security screens. Demo identity remains explicitly separate.
- Contract `0.1.0-candidate.3` generated from source, client types regenerated, deterministic auth
  denial examples with private-input placeholders. No real accounts/tokens/passwords in fixtures.
- Opt-in staging/test operator utilities prepared as source; none executed.

## Identity discovery and provisioning gates

The owner reports `admin@dzirent.com` already exists. The scoped tracked account/seed/auth/config
records contain no trusted native account ID, creation event or verification route for that identity.
Demo sample identities are not proof. No live/private account database was queried; Azure staging
was owner-observed empty and was not assumed to contain admin. **Actual environment and identity
origin remain unknown.** The owner must supply private evidence of the existing subject, target
environment and trusted creation/ownership verification before any identity reconciliation/grant.
Never create a duplicate, attach a password to a dormant subject, reset admin or grant by email alone.

`python -m dzirent_api.auth.operator` has two explicit subcommands, **not run in Phase 1**:

| Utility | Guarded future operation |
| --- | --- |
| `synthetic-accounts` | Two specified example.com identities only, independent Argon2id salts, renter membership; lender enrollment only with an actual active `--metro-id` |
| `admin-capability` | Grant/revoke only `operations:access` to an existing canonical `--user-id`; no password/create path; owner evidence and UUID confirmation required |

Both require `--execute`, `--expected-host`, protected
`DZIRENT_AUTH_OPERATOR_ACK=issue26-owner-approved-phase2`, connected/native settings, and either
the isolated Azure `dzirent_staging` database in staging with `sslmode=verify-full`, or a loopback
disposable `*_test` database in test. Production/local targets are refused. Staging requires the
existing migrator login, never runtime. This acknowledgement is an operator safety interlock,
not an authorization token or a replacement for explicit owner Phase 2 approval.
The utility rejects multi-host/service/query overrides (only sslmode/sslrootcert are allowed),
inherited libpq service/address/options overrides, and checks actual database/login against the
private target before touching account data. These safeguards are implemented but untested.

Synthetic provisioning additionally requires
`--synthetic-email-policy operator-asserted-no-mail`. Its password comes from private
`DZIRENT_STAGING_TEST_PASSWORD` (removed from the process environment after reading) or a protected
`getpass` prompt and confirmation. No password CLI argument/default/output; only independently
salted Argon2id hashes persist. Python cannot guarantee memory zeroization. Existing eligible
synthetic users are checked, never reset/reactivated; incompatible identities abort the transaction.
Synthetic verification is operator asserted and flagged, never evidence of example.com ownership;
reserved mailboxes receive no messages. Public signup does not expose this policy, and production
login and admin capability checks reject synthetic credentials. Without legitimate metro data,
the lender identity keeps ordinary renter access and reports enrollment pending, without forged FKs.

Admin utility also requires `--identity-evidence` (private JSON path), `--operator`, `--reason`,
`--action grant|revoke`, existing `--user-id`, and optional 1–30 day expiry (default seven).
Private evidence fields: `user_id`, `email`, `environment`, `database`, `host`,
`trusted_creation_route`, `ownership_verification_route`, `owner_authorized: true`.
Do not place this file or connection metadata in GitHub. It is an owner attestation requiring
manual review, not a cryptographically verified identity-provider assertion. The utility confirms
the exact existing UUID privately, requires a verified active non-synthetic native target for grants,
and records an evidence SHA-256 plus bounded operator/reason in the restricted audit table.
Email is a cross-check against the already selected identity, never a discovery/elevation mechanism.
Revocation remains possible after account inactivity. Passwords are never read or changed by it.

## Future startup configuration — do not start in Phase 1

When Phase 2 is explicitly approved, use the existing commands `pnpm dev:api:connected` (8000)
and `pnpm dev:web:connected` (3000), after the disposable local DB is isolated and reviewed migrations
are applied. API private settings: connected/native mode, local/test environment, disposable DB URL,
one exact `DZIRENT_AUTH_WEB_ORIGIN`, a newly generated private `DZIRENT_AUTH_CSRF_KEY` ≥32 bytes.
Web private settings: `DZIRENT_API_UPSTREAM_URL` ending `/api/v1`, exact `DZIRENT_WEB_ORIGIN`;
the only public auth selector is `NEXT_PUBLIC_DZIRENT_MODE=connected`. Local HTTP is loopback only;
deployed staging must use HTTPS. Do not populate deployment settings or start servers in this phase.

Mail is disabled by default. A reviewed delivery backend is required for public registration and
verification/recovery; configure a real sender and TLS SMTP host/credentials privately when approved.
Synthetic provisioning does not depend on mail and cannot be triggered by public requests.
Existing demo startup scripts/mode remain. No live settings, project, DNS or alias were modified.

## Actual Phase 1 command evidence

Windows PowerShell; pinned Node 22.23.3 / pnpm 10.29.3 / Python 3.12.15 / uv 0.13.1.
Read-only Git/GitHub inspection and pinned PartGraph source reads completed; refreshed main to
the base above, preserved Azure branch and parallel AI branches. No Azure/AWS calls performed.

| Command/action | Actual result / meaning |
| --- | --- |
| `uv lock --directory services/api --python 3.12.15` | Exit 0; added argon2-cffi 25.1.0 and required bindings/cffi/parser lock entries only |
| `uv pip install --python services/api/.venv/Scripts/python.exe --only-binary :all: --no-deps argon2-cffi==25.1.0 argon2-cffi-bindings==26.1.0 cffi==2.1.1 pycparser==3.11` | Exit 0; installed the two missing wheels for declaration generation, no application build; hardlink fallback warning only |
| `pnpm contracts:generate` with `UV_NO_SYNC=true` | Exit 0 on both generation runs (initial declarations, then explicit auth 400/413/415 responses); OpenAPI/TypeScript source output only, no environment sync/application build or database connection |
| `uv run --no-sync --directory services/api --python 3.12.15 python ../../fixtures/catalog/generate.py` | Exit 0; deterministic files generated (8 roots, 40 leaves, 40 garments, 39 operation examples); no database seed |

Generation is not validation or evidence that flows work. No tests, typecheck, lint/format command,
application build, contract/fixture drift checks, migrations, seeds, operator command, browser suite,
hosted smoke, account provisioning or manually dispatched CI was run. Automatic PR CI, if triggered,
is incidental and must not be treated as owner-approved Phase 2 acceptance. No QA approval claimed.

## Parallel integration and next owner decision

Open measurement/quality branches were inspected read-only. Their intended `main.py`, `settings.py`,
API manifest/lock and environment-doc edits overlap this lane; their AI source is not included here.
Preserve both sets of additive settings/router imports and resolve dependency locks serially when
reviewed later. No other agent was started, reassigned or asked to edit shared files. Existing QA
ownership/session remains untouched. No other agent status file was changed.

Owner review is next. Only a separate explicit Phase 2 assignment may add/execute disposable
PostgreSQL 17 auth/permission/migration, CSRF/Origin/proxy-cookie, email/token replay, throttle,
cross-user/role/deactivation and browser tests. Legacy tests/contract smoke that pin `.2`, the native
503 placeholder, or settings without a private CSRF key will need scoped realignment then; no tests
were changed merely to assert new implementation. Review migration grants against actual operator
ACL evidence before any staging execution. Never point destructive `tests/conftest.py` DB creation/
DROP helpers at staging. Hosted HTTPS API (#25), actual admin origin, email delivery, Phase 2 security
acceptance, migrations and accounts all remain gated. Preserve the live demo through that process.
