# Connected staging environment audit — October 28, 2026

Scope [#77](https://github.com/Vivek-k24/Dzirent/issues/77); exact base
`a02e180f0147f4f06fd61d47c1f3997b922e9e6b`, isolated `codex/connected-staging-stage3`.
Names and consumers only: no secret values or private connection strings in this document.

## Initial inventory before writes and loading

- Audited native API Settings, migrations/operator, Next same-origin proxy/client, runtime Compose,
  root scripts and all GitHub workflows, plus names/presence in10 relevant local/template files.
- GitHub authenticated name-only queries: **0 repository secrets, 0 variables, 0 environments**.
  Existing workflows consume only GitHub's automatically provided `GITHUB_TOKEN`, plus disposable
  CI PostgreSQL/test settings. There is no Azure/Vercel deployment workflow or credential consumer.
- Verified existing Vercel project `dzirent`; **0 environment entries and0 hidden production entries**.
  No values pulled/decrypted and no Vercel configuration written. Public demo keeps existing defaults.
- Fresh complete Azure inventories: no App Service sites/plans, Container Apps/environments or storage
  accounts. Therefore **no existing backend Azure App Settings** to migrate or overwrite.
- `services/api/src/dzirent_api/settings.py`:26 typed `DZIRENT_` fields, existing Pydantic Settings
  loader, secrets masked and validation input hidden. Deployment uses platform environment values;
  no GitHub Secrets retrieval code will be added. Deployment packages exclude every `.env` file.
- `services/api/alembic/env.py`: migration process reads **`DZIRENT_DATABASE_URL`**, not the intake
  alias `DZIRENT_MIGRATOR_DATABASE_URL`. A restricted migration invocation maps the latter into the
  former only in that short-lived process; runtime always gets the application-role URL.
- Next proxy reads exactly `DZIRENT_API_UPSTREAM_URL` and `DZIRENT_WEB_ORIGIN`. Upstream must end in
  `/api/v1`, use HTTPS and contain no credentials/query/fragment; origin must be exact. Connected
  failures remain failures, without MSW fallback.
- The owner-input file is an intake bundle containing privileged credentials. It must **never** be
  sourced, uploaded as a deployment bundle or copied wholesale into App Settings/GitHub/Vercel.

The machine-readable destination allowlist is
[`infra/azure/environment-policy.json`](../../infra/azure/environment-policy.json).

Final configured state: one free Linux App Service plan/app,24 API App Settings plus six platform
fields, three active runtime secrets (app URL, CSRF key, AES keyring). Conditional SMTP credentials
absent; SMTP/worker explicitly disabled. No KeyVault/storage. Three Vercel entries only for
`codex/connected-staging-stage3` / preview; production unchanged. New GitHub deployment secrets,
variables/environments: **none**. New CI is GET-only external verification, not deployment.
[Actual resource/source/validation evidence](connected-staging-verification-2026-10-28.md).

## Exact API runtime names and destinations

All rows below are consumed by the existing API `Settings` loader. Destination is **Azure App
Settings**, protected as server configuration; secret rows are never copied to Vercel/GitHub/browser.
No Key Vault is required for this minimal staging design. References would need a separately
verified cost/identity/custody reason; none is provisioned or assumed.

| Variable | Classification | Consumer/purpose |
| --- | --- | --- |
| `DZIRENT_DATABASE_URL` | Azure runtime secret | Database engine, **dzirent_app only**, verify-full + trusted CA. |
| `DZIRENT_AUTH_CSRF_KEY` | Azure runtime secret | Independent native CSRF signing material. |
| `DZIRENT_AUTH_OUTBOX_KEYS` | Azure runtime secret | Private AES key-ring JSON. |
| `DZIRENT_AUTH_SMTP_USER` | Conditional Azure runtime secret | SMTP account identifier; only a verified provider. |
| `DZIRENT_AUTH_SMTP_PASSWORD` | Conditional Azure runtime secret | SMTP authentication; never browser/CI runtime retrieval. |
| `DZIRENT_MODE` | Azure runtime configuration | Explicit connected mode. |
| `DZIRENT_ENVIRONMENT` | Azure runtime configuration | Explicit staging environment. |
| `DZIRENT_IDENTITY_MODE` | Azure runtime configuration | Native only; no deployed mock identity. |
| `DZIRENT_DB_POOL_SIZE` | Azure runtime configuration | Bounded connection pool. |
| `DZIRENT_DB_CONNECT_TIMEOUT_S` | Azure runtime configuration | Connection/pool timeout. |
| `DZIRENT_DB_STATEMENT_TIMEOUT_MS` | Azure runtime configuration | Statement timeout. |
| `DZIRENT_CORS_ORIGINS` | Azure runtime configuration | JSON list of approved exact HTTPS origins. |
| `DZIRENT_LOG_LEVEL` | Azure runtime configuration | Existing redacted structured logger. |
| `DZIRENT_AUTH_WEB_ORIGIN` | Azure runtime configuration | Exact approved staging frontend origin. |
| `DZIRENT_AUTH_SESSION_HOURS` | Azure runtime configuration | Existing bounded session lifetime; default retained unless needed. |
| `DZIRENT_AUTH_VERIFICATION_MINUTES` | Azure runtime configuration | Existing bounded token lifetime. |
| `DZIRENT_AUTH_RESET_MINUTES` | Azure runtime configuration | Existing bounded recovery lifetime. |
| `DZIRENT_AUTH_EMAIL_BACKEND` | Azure runtime configuration | **disabled** until real provider/sender/TLS verified. |
| `DZIRENT_AUTH_EMAIL_SENDER` | Conditional Azure runtime configuration | Authorized sender, currently unverified. |
| `DZIRENT_AUTH_SMTP_HOST` | Conditional Azure runtime configuration | Actual verified provider hostname. |
| `DZIRENT_AUTH_SMTP_PORT` | Conditional Azure runtime configuration | Verified provider's TLS port. |
| `DZIRENT_AUTH_SMTP_TLS` | Conditional Azure runtime configuration | Verified SSL/STARTTLS; no plaintext transport. |
| `DZIRENT_AUTH_OUTBOX_ACTIVE_KEY_ID` | Azure runtime configuration | Nonsecret selector for the protected key ring. |
| `DZIRENT_AUTH_EMAIL_WORKER_ENABLED` | Azure runtime configuration | **false** while email dependencies remain unverified. |
| `DZIRENT_AUTH_OUTBOX_CAPACITY` | Azure runtime configuration | Existing bounded backlog. |
| `DZIRENT_AUTH_OUTBOX_POLL_SECONDS` | Azure runtime configuration | Existing worker interval. |

The generated private keys already exist locally from Stage2. No credential generation or password
reset is implied by this audit. Runtime bundle construction must explicitly select the allowlisted
fields, check actual role/TLS target, and validate with the existing `Settings` class.

## Intake, migration, media and operator names

| Variable(s) | Classification | Actual consumer/destination |
| --- | --- | --- |
| `DZIRENT_AZURE_PG_ADMIN_USER`, `DZIRENT_AZURE_PG_ADMIN_PASSWORD` | Local-only | Owner-authorized administration only; **never GitHub, Vercel or runtime**. |
| `DZIRENT_AZURE_PG_HOST`, `DZIRENT_AZURE_PG_PORT`, `DZIRENT_AZURE_PG_DATABASE` | Local-only | Intake metadata used for strict connection assembly/guards. Not standalone Settings fields. |
| `DZIRENT_AZURE_PG_SSLMODE`, `DZIRENT_AZURE_PG_SSLROOTCERT` | Local-only | Assembly metadata. Actual driver receives both through its URL. Linux CA location must be explicitly mapped and verified. |
| `DZIRENT_APP_ROLE`, `DZIRENT_MIGRATOR_ROLE`, `DZIRENT_APP_ROLE_PASSWORD` | Local-only | Intake/credential assembly, not hosted environment fields. Runtime gets only its resulting URL. |
| `DZIRENT_MIGRATOR_ROLE_PASSWORD`, `DZIRENT_MIGRATOR_DATABASE_URL` | Restricted migration credential | Protected local migration process only. No automatic GitHub storage; never application/Vercel. |
| `DZIRENT_API_BASE_URL` | Local-only, unused alias | Intake inventory label; **no application consumer**. Do not create a hosted secret for it. |
| `DZIRENT_MEDIA_BACKEND` | Candidate runtime configuration | PR75 only; disabled for hosted environment until a real provider adapter is implemented. Not present in selected native Settings yet. |
| `DZIRENT_MEDIA_ROOT` | Local-only | PR75 private filesystem adapter; explicitly rejected in staging/production. Not a cloud image store. |
| `DZIRENT_AUTH_OPERATOR_ACK`, `DZIRENT_STAGING_TEST_PASSWORD` | Local-only restricted operator input | Explicit manual account/admin tooling only; no public admin grant or provisioning from deployment. |
| `DZIRENT_STAGING_TEST_EMAIL` | Local-only acceptance input | Owner-controlled recipient proposed for real delivery verification; not a runtime setting or public fixture. |

PostgreSQL persists account/session/upload metadata; garment bytes require a separate private hosted
object store. No Blob account/container/credential/URL is invented by this audit. A later implemented
adapter's exact fields and identity scope must be added to this manifest and reviewed before use.

## Vercel, browser and GitHub names

| Variable | Classification/destination | Consumer and present state |
| --- | --- | --- |
| `DZIRENT_API_UPSTREAM_URL` | Vercel server-side configuration, staging branch/preview only, encrypted | `https://dzirent-api-staging-4265.azurewebsites.net/api/v1`. Configured. |
| `DZIRENT_WEB_ORIGIN` | Vercel server-side configuration, staging branch/preview only, encrypted | Actual stable preview origin below. Configured. |
| `NEXT_PUBLIC_DZIRENT_MODE` | **Public Vercel build selector**, explicit nonsecret exception | Client/store/MSW/proxy. Public demo remains demo; only an isolated staging build may use connected. Never put credentials here. |
| `GITHUB_TOKEN` | GitHub Actions automatic token | Existing Security/CodeQL; platform-issued, not an owner-created deployment secret. |
| `AZURE_CLIENT_ID` | Proposed GitHub deployment variable | OIDC application/client identifier, only if a reviewed deployment job and federation are established. |
| `AZURE_TENANT_ID` | Proposed GitHub deployment variable | OIDC tenant identifier. |
| `AZURE_SUBSCRIPTION_ID` | Proposed GitHub deployment variable | Exact deployment subscription identifier. |
| `AZURE_RESOURCE_GROUP` | Proposed GitHub deployment variable | Scoped existing staging group. |
| `AZURE_WEBAPP_NAME` | Proposed GitHub deployment variable | Actual reviewed hosting target. |

**Required new GitHub Secrets today: none.** No Azure deployment workflow/federation exists yet.
For a future job, prefer Azure OIDC with `id-token: write`, least-privilege target scope and a protected
`staging-backend` environment reviewing the exact commit. The five proposed identifiers above are
variables, not passwords. Source commit is supplied by GitHub's context/reviewed dispatch input,
not another copied owner-input secret. Do not add administrator, migrator, database, SMTP, CSRF or
AES values to GitHub merely because they occur in the intake file. An initial owner-authenticated
local staging deployment does not need a GitHub secret or client-secret credential.

Existing disposable CI/test-only consumers remain separate: `DZIRENT_TEST_DATABASE_URL`,
`DZIRENT_REQUIRE_DB_TESTS`, `DZIRENT_CONTRACT_DB_READY`, `DZIRENT_TEST_URL`,
`DZIRENT_SMOKE_URL`, `DZIRENT_SKIP_WEBSERVER`, local Compose `DZIRENT_DB_NAME`,
`DZIRENT_API_PORT`, `DZIRENT_WEB_PORT`, and test/local demo mode settings. These must never select
the Azure staging database for a destructive fixture. Platform variables (`PORT`, `NODE_ENV`,
GitHub/Vercel context) are not copied private intake credentials.

## Initial checks and subsequent gates

Initial name-only authenticated inventories and code consumer search completed without retrieving
secret values or changing platform configuration. Subsequent allowlisted runtime writes are recorded
above and in the verification report; secret values were never printed. Stage2's real role logins and preserved ACLs
are recorded in [the prior report](azure-connection-recovery-2026-10-28.md), not inferred from CI.

Fresh read-only October28 financial observations: Students Enabled, both spending limits On,
nonestimated credit after pending charges exceeds the initial USD10 planning reserve, listed credit
expiry beyond seven days. Free-meter entitlement lookup still failed; this does not establish an
allocation, service quota, budget or bill. Existing database Ready, TLS required/min1.2, one narrow
firewall rule; seven Full backup records, newest12:10 CDT October28. No host/storage allocated.

Those recovery/migration/hosting/network/transport gates subsequently passed as recorded in the
verification report. Final exact frontend origin, derived from Vercel deployment metadata:
`https://dzirent-git-codex-connected-staging-stage3-vivekkallakuri-8617.vercel.app`.
It is both `DZIRENT_WEB_ORIGIN` and Azure `DZIRENT_AUTH_WEB_ORIGIN`; Azure `DZIRENT_CORS_ORIGINS`
contains only that HTTPS origin. `NEXT_PUBLIC_DZIRENT_MODE=connected` only on this preview branch.
Production keeps its demo source/defaults. Operator runtime configuration defaults to this reviewed
origin and refuses unrelated existing origins or later verified SMTP configuration.
It also refuses changes to an existing runtime secret; rotation needs separate review rather than
silently replacing platform values from a stale local input file.

Email delivery, signed-in/lender/media acceptance and production database isolation remain incomplete.
Do not create proposed media variables as secrets before an actual provider consumer is reviewed.
