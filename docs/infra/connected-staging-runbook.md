# Connected staging operation and review handoff

Scope issue77 / draft [PR78](https://github.com/Vivek-k24/Dzirent/pull/78), stacked on draft76,
reusing native implementation61 and guards71. No merge or production cutover. Exact observations:
[verification report](connected-staging-verification-2026-10-28.md).

## Running targets and startup

- API: `https://dzirent-api-staging-4265.azurewebsites.net/api/v1`.
- Protected connected preview:
  `https://dzirent-git-codex-connected-staging-stage3-vivekkallakuri-8617.vercel.app`.
  Use the owner's existing Vercel login; protection remains enabled. This is an integration preview,
  not an operational public registration/lender release. Catalog has0 products.
- App `dzirent-api-staging-4265`, Linux F1 plan `asp-dzirent-staging-f1`, existing staging group.
  Startup `bash infra/runtime/start-appservice.sh`; Uvicorn0.0.0.0/platform PORT (default8000),
  no raw access log, trusted-forwarder default127.0.0.1. No automatic migrations/seed.
- Readiness `/api/v1/health/ready` requires the real DB and schema0005; liveness alone is insufficient.
  The same readiness is reachable through preview `/auth/api/health/ready`.
- Oryx extracts code under its changing `APP_PATH`. Startup keeps repository-relative API/contracts
  layout and copies the hash-checked public CA to a stable Linux path. Interpreter verified3.12.15.

The public demo `https://dzirent.com` stays on production deployment
`dpl_A7AvvLu1XmuzcWuvTRiRpHcTqAUd` / source `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`.
Both repository automatic-deployment guards remain false. No main branch or DNS changes.

## Configuration custody

[Complete names/classifications/consumers](connected-staging-environment-audit.md) and
[machine policy](../../infra/azure/environment-policy.json) are canonical for this checkpoint.

| Destination | Required names/state |
| --- | --- |
| Azure runtime secrets | `DZIRENT_DATABASE_URL` (app role only), `DZIRENT_AUTH_CSRF_KEY`, `DZIRENT_AUTH_OUTBOX_KEYS` |
| Azure native configuration | `DZIRENT_MODE=connected`, `DZIRENT_ENVIRONMENT=staging`, `DZIRENT_IDENTITY_MODE=native`, exact preview `DZIRENT_AUTH_WEB_ORIGIN`, `DZIRENT_CORS_ORIGINS` containing only that origin; full21-field configuration list in audit |
| Azure email gate | `DZIRENT_AUTH_EMAIL_BACKEND=disabled`, `DZIRENT_AUTH_EMAIL_WORKER_ENABLED=false`; SMTP credentials absent |
| Vercel server-side, **this branch/preview only** | `DZIRENT_API_UPSTREAM_URL` to HTTPS API `/api/v1`; `DZIRENT_WEB_ORIGIN` to actual stable preview origin |
| Vercel public selector, **this branch/preview only** | `NEXT_PUBLIC_DZIRENT_MODE=connected`; no other browser credential/config export |
| Restricted local migrations | `DZIRENT_MIGRATOR_DATABASE_URL`, mapped only to the existing Alembic URL override/process; never runtime/Vercel |
| Local-only administrator | Protected owner intake only; never application/GitHub/Vercel |
| New required GitHub deployment secrets/variables | **None**: no deployment workflow exists; external verification is secretless |

Future deployment automation should use Azure OIDC, a protected exact-SHA staging environment and
least-privilege target scope. Proposed **variables**, not passwords: `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_WEBAPP_NAME`.
No federation/client secret/deployment environment created in this phase.

`configure_staging_runtime.py` is an explicit operator allowlist, not an application secrets client.
Application still reads App Settings through its existing Settings loader. The tool defaults to the
actual reviewed preview origin, rejects unrelated existing origins and refuses to overwrite a later
enabled email provider or change existing runtime secret values. Secret drift requires explicit
rotation review; it is never silently overwritten by reapplying the bootstrap. Do not source the
owner intake, upload it or bulk-copy its names to GitHub.
No KeyVault introduced without a separate cost/custody need.

## Operator commands and evidence

Use this isolated checkout and its pinned tools; API Python dependencies plus the isolated Azure SDK
environment are needed for configuration operations. The executed Windows setup used API Python3.12.15
and Azure SDK1.26.0 identity tooling; `PYTHONPATH` selected the existing Azure tooling's site-packages
for the configuration command. No global package upgrade or application dependency change.

```powershell
# Read-only local Settings/custody validation; values never printed.
& <api-python-with-azure-tooling> infra/azure/configure_staging_runtime.py `
  --subscription <verified-subscription> `
  --owner-input H:\DziRent\secrets\dzirent-owner-inputs.env `
  --azure-input H:\DziRent\secrets\azure-staging.env `
  --output <new-ignored-evidence-path>

# GET-only HTTPS probe, no account/mail/SQL credentials.
python infra/azure/probe_staging_https.py --report <new-ignored-report-path>
```

Adding `--execute` to runtime configuration writes real App Settings and can restart this app;
validate current custody/origin/email state first. The provisioning template/tool are **one-time
bootstrap**, not routine redeployment; existing-host guards deliberately stop recreation. Do not
reapply the initial template's minimal App Settings over the configured service.

Executed controlled SQL/API probe, with an owned state file and existing app-role privileges:

```powershell
& <api-python> infra/azure/verify_staging_crud.py `
  --azure-input H:\DziRent\secrets\azure-staging.env `
  --state <new-owned-probe-state> --phase create-update `
  --execute-owner-authorized-staging-probe
# Explicit staging restart and new-process/readiness verification.
& <api-python> infra/azure/verify_staging_crud.py `
  --azure-input H:\DziRent\secrets\azure-staging.env `
  --state <same-owned-probe-state> --phase verify-delete `
  --execute-owner-authorized-staging-probe
```

Already passed and cleaned up; **do not rerun just to recreate evidence**. These are actual staging
writes, never a fixture harness. No migration/admin credential in this script. Preserve its owned
state if interrupted; only remove its exact UUID/name row after inspection. It does not provision
accounts or prove lender HTTP authorization.

For local Next proxy only (executed on3047; no password/DB secret supplied):

```powershell
$env:NEXT_PUBLIC_DZIRENT_MODE = 'connected'
$env:DZIRENT_API_UPSTREAM_URL = 'https://dzirent-api-staging-4265.azurewebsites.net/api/v1'
$env:DZIRENT_WEB_ORIGIN = 'http://127.0.0.1:3047'
pnpm --filter @dzirent/web dev --port 3047
```

This validates server routing. Hosted native auth requires the configured HTTPS preview origin;
the API does not accept this loopback origin for authenticated mutations. No browser sign-in claimed.
Use authenticated Vercel access for protected preview checks; never turn protection off or publish
temporary bypass/share tokens. CLI curl exited2 in this environment; MCP authenticated GETs worked.

## Deployment and recovery

Working API source `bc55f71113c06814532df5b82b3af0cdedd97994`, ZIP publication
`eede9fed-93c0-4baa-959c-d4a80f37ca1e`. Preserved ignored archive `.tools/stage3/api-diagnostic.zip`,
SHA256 `242b897d9283569cad9aea7fc22ed381d0cce5e5673753429fc532ef656bcfe6`.
The diagnostic is optional and currently disabled. Packaging uses `package_appservice.py`, tracked
allowlisted files, frozen uv export and public CA only. Rebuilt ZIP timestamps may differ; verify
the source/file manifest, not an assumed reproducible ZIP byte hash. Wait for publication completion
before restarting/changing startup; verify actual new process and SQL readiness afterward.

Recovery starts by preserving current evidence and stopping only the isolated staging app if needed;
the public demo is independent. Redeploy an approved known artifact/commit with existing Entra auth,
retain native keys and app-role URL, then rerun affected health/transport checks. Do not blindly rerun
initial provisioning. No production alias promotion or automatic SQL downgrade/restore.

Protected pre-migration archive outside Git:
`H:\DziRent\secrets\stage3-recovery-20261028\pre-native-auth.dump`.
Actual restore into disposable local PG17.11 plus forward0003–0005 rehearsal passed. Keep it private;
never upload backup/raw SQL evidence to GitHub/Vercel. Recovery of hosted data requires an approved
isolated restore and verification before traffic redirection; never overwrite this database by a test.

Current SQL firewall15 entries: original owner rule plus `dzirent-stage3-api-01` through `-13` and
`dzirent-stage3-api-observed-01`. Rollback network access only by explicit removal of those newly
owned staging rules, preserving the owner rule and any later user changes. No all-Azure exception.

## Costs and remaining gates

Verified Linux F1 meter USD0/hour from [Azure Retail Prices API](https://prices.azure.com/api/retail/prices).
F1 allocated/read back as Free. Existing PostgreSQL still consumes eligible Students credit; both
spending limits were On, credit nonestimated/available and expiry beyond seven days at allocation.
No limit removal/upgrade. This is not an invoice measurement or production SLA.
Existing Vercel account confirmed active Hobby; standard private builds only. Hobby is capped rather
than purchased extra usage ([plan documentation](https://vercel.com/docs/plans/hobby)). External probe
uses a standard runner in this public repo, no artifact storage
([GitHub billing](https://docs.github.com/en/actions/concepts/billing-and-usage)).

Keep SMTP/worker disabled. No verified sender/provider; `no-reply@dzirent.com` remains proposed.
No real registration, accounts/admin grants, mail or signed-in renter/lender acceptance performed.
Private hosted media is unimplemented/unprovisioned: PR75 is local-only and unmerged, with separate
contract/0006 dependency. Provider adapter, scoped private storage, cost/restore gates, unauthorized
upload/ownership/image tests remain. Do not add speculative media secrets or use filesystem fallback.
Dedicated production database/network isolation and owner-approved cutover are separate gates.
This phase does not release public connected accounts or replace the live demo.
