# Connected staging verification — 2026-10-28

Owner-authorized Stage3, [issue77](https://github.com/Vivek-k24/Dzirent/issues/77).
Base `a02e180f0147f4f06fd61d47c1f3997b922e9e6b`, isolated
`codex/connected-staging-stage3`. No main merge or public website cutover authorized.
All times below CDT (UTC−5). SMTP stays disabled at the owner's explicit instruction.

**Backend and protected web transport operational; full connected release remains gated.**

| Component | Actual deployed result |
| --- | --- |
| API | `https://dzirent-api-staging-4265.azurewebsites.net/api/v1` |
| Protected preview | `https://dzirent-git-codex-connected-staging-stage3-vivekkallakuri-8617.vercel.app` — owner Vercel access required |
| API source | `bc55f71113c06814532df5b82b3af0cdedd97994` |
| API publication ID | `eede9fed-93c0-4baa-959c-d4a80f37ca1e` |
| ARM deployment | `dzirent-stage3-issue77-f1` — Succeeded |
| Preview source | `8d9ac658c19673cbed1436ad3a723dce179f3db3` |
| Preview deployment | `dpl_F7LNuZNEztA42UDXBJxTKdFCkR9D` — READY, preview/null target |
| Actual runtime | Python3.12.15, PostgreSQL17.11, schema0005, contract `0.1.0-candidate.3` |

API SHA was read back from the **deployed Oryx archive's release manifest**. Later operator/docs
commits are not another app deployment. Public `dzirent.com` remains on
`dpl_A7AvvLu1XmuzcWuvTRiRpHcTqAUd`, source `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`.

## Recovery and migration results

At13:37, a read-only `pg_dump`17.2 connection using only the existing migrator created a protected
48,199-byte custom archive of the application `public` schema. Source PostgreSQL17.11,
`sslmode=verify-full`, established CA, TLS1.3/256-bit. Archive/list integrity verified with
`pg_restore`17.2; 18 tables. Backup is outside Git under
`H:\DziRent\secrets\stage3-recovery-20261028`; current user/SYSTEM only. No role/password-global dump.
SHA256 `5dd7f78472f858af5741a9e55b8b28bc08ef0b9c28400d395dda4722a0ba1e0f`.

At13:42, restored that actual archive into a new disposable local PostgreSQL17.11 container,
image `sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`.
Loopback-only random port, fresh local credentials, tmpfs, no Azure credentials or host data volume.
First restore stopped because the new local default `public` schema already existed. Corrected the
rehearsal to remove only that guarded empty disposable schema before restoring; subsequent restore
passed. The source Azure database was untouched by this correction.

Rehearsed the unchanged migrations0003–0005 using the local `dzirent_migrator` equivalent. Restored
0002 and all18 table counts matched the source; upgrade reached0005, 25 tables, seven new empty
auth tables. Existing counts preserved. Runtime database/schema CREATE and migration-history UPDATE
denied; platform-admin grant/event writes denied; credential column ACLs checked. Owned container
removed after label/id verification, disposable local password file cleared. Protected backup retained.

At13:44, applied the **same unchanged**0003–0005 once to Azure using the existing migrator. Final
prechecks required recent backup/hash, successful restore/rehearsal, unchanged migration digests,
source0002, no legacy identities, no accounts/products, matching source counts and no concurrent
app/migrator transaction. Alembic serialized via its existing advisory lock; bounded statement/lock
timeouts, no startup/per-replica migrations.

**Actual Azure result: `0005_auth_email_outbox`, 25 public tables, all original18 counts preserved,
seven new auth tables empty.** Existing role OIDs/flags/memberships, database/schema/default/function
ACLs/ownership, old object/column ACLs and effective privileges preserved. Runtime cannot CREATE
database/schema, UPDATE migration history, INSERT platform-admin grants/events. Independent runtime
login reads the new revision with verify-full/TLS1.3. No administrator used, accounts provisioned,
fixtures seeded, historical migrations edited or privileges broadened outside new-table migration ACLs.

Commands actually executed (PowerShell, Python3.12.15):

```powershell
& <api-venv-python> .tools/stage3/rehearse-recovery.py
# final exit0; restore, migration and privilege checks passed; local container removed
& <api-venv-python> .tools/stage3/apply-validated-migrations.py --execute-owner-authorized-stage3
# final exit0; existing migrator, Azure0005 and independent runtime login passed
```

The first migration helper invocation stopped before any DB action on a local signature TypeError;
corrected the call to the existing URL validator, preserved failed evidence and reran. No skipped
checks counted as passed. Ignored local helpers/evidence contain operational paths; private source
credentials remain exclusively in protected external input files.

## Hosting preflight

At13:47, `infra/azure/appservice_staging.py` inspection passed against current VS Code authentication,
exact Students subscription/tenant, Enabled and spending-limit On. Fresh billing/credit evidence
from13:26: billing limit On, Free/Active, nonestimated available USD credit after pending charges above
the initial USD10 planning reserve, complete credit lots expiring beyond seven days. No upgrade or
billing-limit change. Free-service entitlement lookup remains unavailable; do not call that verified.

Fresh Azure Retail Prices API: NorthCentralUS **Linux F1 USD0/hour**. No paid fallback in this tool.
No existing App Service sites/plans in the complete subscription inventories. Microsoft.Web initially
NotRegistered. Regional stack discovery previously advertised stable Python3.12; allocation/quota
is a separate execution gate. Initial local financial-parser attempt failed closed without writes;
corrected actual response-field locations and the subsequent authenticated inspection passed.

The reviewed template contains only one free Linux plan, one isolated staging app, its managed
identity and disabled SCM/FTP basic-auth policies. HTTPS-only/minTLS1.2, Python3.12, readiness path,
native/connected/staging selectors and email disabled. No database/network/KeyVault/registry/telemetry
resource and no secret in ARM deployment history. Runtime App Settings are a separate allowlisted step.

Allocation submitted13:51 and read back Succeeded13:52: free Linux plan `asp-dzirent-staging-f1`, app
`dzirent-api-staging-4265`, system-assigned identity. ARM read-back verified the Free SKU, Linux,
HTTPS-only, app/SCM minTLS1.2, FTPS/basic SCM/basic FTP/remote debug off, readiness path. No existing
PostgreSQL resource recreated. Published the allowlisted ZIP through existing VS Code Entra bearer;
frozen dependencies unchanged. Public CA hash checked before copying to stable Linux location
`/home/dzirent/azure-postgres-roots.pem`; app URL uses verify-full. Local URLs retain their Windows CA.

App Settings:24 API fields plus six platform fields, three active secrets (app URL, CSRF, AES keyring),
conditional SMTP credentials absent, worker/email disabled. Existing Settings and keyring validated;
saved values compared privately. Administrator/migrator absent from runtime. No secret in ZIP/ARM
history, GitHub, Vercel or browser variables. JSON logs exclude query strings/headers; raw HTTP logs,
detailed errors and tracing off. No KeyVault, registry, telemetry or media storage created.

Owner separately approved13 declared outbound /32s, then process-observed `172.214.222.211/32`.
Rechecked sources before each change; final15 rules preserve the original owner rule plus14 exact
staging sources, no all-Azure/range exception. [Network evidence](connected-staging-network-review.md).
Readiness correctly returned503 until the additional approved source was allowed, then200.

An early restart overlapped Oryx publication and temporarily lacked the startup script. A restart
after publication loaded the archive successfully. Later restart verification used a new actual
process diagnostic timestamp. Optional diagnostic is now **off**; normal startup:
`bash infra/runtime/start-appservice.sh`. F1 has cold starts/quotas and no production availability
promise. Changed egress needs new review; never automatically broaden the firewall.

## Actual CRUD, restart and transport checks

- At14:28, `verify_staging_crud.py --phase create-update --execute-owner-authorized-staging-probe`
  committed one uniquely owned temporary brand row as **dzirent_app**, read it through HTTPS facets,
  committed its label update and read the update through HTTPS. Existing privileges only; no account,
  owner identity, grant or fixture seed. First probe stopped42501 while counting the restricted admin
  trail, before creating its row. Corrected the helper to count only runtime-readable tables;
  preserved the admin restriction and reran the affected check.
- Explicit staging restart14:30:38; new API process14:31:10 proved correct database/app role,
  PostgreSQL17.11, read-only transaction, TLS1.3/256-bit and schema0005 through existing Settings and
  SQLAlchemy. Python3.12.15. Original anonymous CSRF challenge reached missing-body validation422
  after restart; Secure/HttpOnly/host-only/SameSite=Lax cookie flags, foreign-origin403 and anonymous
  session401 verified. No cookie/token value persisted. **Not a signed-in session test.**
- At14:33, `--phase verify-delete` read the update through the restarted HTTPS API, deleted only the
  owned row as app role, verified absence through HTTPS and restored readable counts. Separate
  restricted-migrator **SELECT-only** audit14:37 checked all25 counts: original18 restored, seven
  auth tables empty, users/products/credentials/sessions0. No administrator/migrator for CRUD writes.
  This tests SQL writes plus hosted API reads; authenticated lender HTTP CRUD remains untested.
- Secretless Ubuntu24.04 external runner: **7/7 GET checks passed**, latest attempt3 of
  [run40754108508](https://github.com/Vivek-k24/Dzirent/actions/runs/40754108508), probe source
  `885be72aeec8ad6bb713513236b32455db740b29`. Health live/ready200, facets200, auth session/lender
  products401, docs/OpenAPI404; JSON/error codes checked. Initial attempt failed on readiness/facets503
  before the approved network correction. No Azure/SQL secrets, accounts, email, deployment, data
  writes or artifact storage in this job. Plain web-fetch could not access Azure; runner did.
- Existing Next16.4.2 proxy in isolated checkout127.0.0.1:3047: **5/5 checks passed** at14:40 —
  proxied Azure readiness200, facets200, session401, unknown route404, wrong-origin POST403. Node22.23.3,
  pnpm10.29.3, frozen offline install passed, manifests/locks unchanged. Server then stopped.
- Verified Vercel existing account/project, active Hobby plan, apps/web root and preview protection.
  Created only three **branch-scoped preview** variables. Derived actual stable URL from deployment
  metadata, set backend exact auth/CORS origin, preserved all other values/secrets, republished same
  frontend source. Authenticated MCP fetches: homepage200, proxy readiness200, products200/0 items,
  session401, CSRF200/Secure+HttpOnly cookies. Protection left on. CLI curl exited2; MCP supplied GET
  evidence instead, without counting that CLI attempt as a pass. No signed-in/browser acceptance.
- At15:06, final frontend origin + valid CSRF reached native API missing-body validation422; foreign
  origin403. No email/account/data writes. This checks native transport against final configuration.

Relevant CI for deployed API sourcebc55 passed Foundation/PostgreSQL integration and Security.
Preview source8d9ac65 passed Foundation40754623478 and Security40754623616. Scoped Ruff, shell
syntax, deployment-guard and whitespace checks passed. Final head CI is reported on PR78; a newer
result must not be inferred from older source evidence.

Final read-only custody audit15:31 matched all24 API and six platform values privately against the
protected inputs; app-role-only URL, strict TLS/CA, SMTP/worker disabled, normal startup/diagnostic
off, F1 SKU and hosting/logging guards passed. All15 exact firewall entries matched the approved
source set. Final Vercel inventory had exactly three branch-preview entries, zero production entries
and zero hidden production entries; preview READY, protection on and public demo alias unchanged.
GitHub name-only inventories still returned zero repository secrets and zero repository variables.

After the final operator-only change, `ruff check` and `ruff format --check` passed for
`infra/azure/{appservice_staging,configure_staging_runtime,package_appservice,probe_staging_https,verify_staging_crud}.py`
and `infra/runtime/diagnose_appservice.py` (six files). `node scripts/check-deployment-guards.mjs`,
`bash -n infra/runtime/start-appservice.sh` and `git diff --check` passed. A focused Python policy
check compared all26 `Settings.model_fields` against the destination allowlist, checked no overlap
with local/migrator names, zero required GitHub secrets and valid deployment/network JSON: passed.
No local broad auth/browser suite was rerun; the deployed application source was unchanged.

## Outstanding acceptance

Not run/passed: real email/account provisioning, signed-in expiry/revocation/restart behavior, hosted
renter/lender ownership or lender HTTP CRUD, unauthorized media upload denial/private image retrieval.
Email disabled by owner instruction; proposed `no-reply@dzirent.com` is **not verified**. Provider,
sender authorization/TLS and approved test recipient needed; no verification bypass, synthetic hosted
account or real admin grant. CSRF/AES keys are configured, not a substitute for verified delivery.

PR75 at `deee0a13c191ddd05cc832771afcad58cee11a1f` is still draft with no recorded approval,
although its CI passes. It explicitly enables filesystem media only locally/in tests and rejects it
in hosted staging. Its candidate.4/0006 dependency is not imported over this deployment's frozen
candidate.3/0005. The requested smallest compatible follow-up is to review that dependency, add an
explicit private hosted-provider adapter using this app's scoped managed identity (no filesystem
fallback), and rehearse the additive migration/recovery before enabling it. Actual provider cost,
ownership/upload/image retrieval tests remain required. No speculative media account/container/keys
created. An unmounted endpoint's404 is not an upload
authorization test. Catalog intentionally empty; no connected demo/mock identity seed.

Production database/network isolation and explicit public cutover approval remain gates. This is
staging, never public production by default. Full connected application acceptance is unfinished.

Both Vercel automatic-deployment guards remain false. Existing live demo and production environment
unchanged. No GitHub deployment secrets/variables created. See the
[exact environment destinations](connected-staging-environment-audit.md).

New host meter USD0/hour; existing PostgreSQL continues using eligible Students credit under both
spending limits. No upgrade/limit removal. Existing Vercel Hobby plan used for two private standard
builds, no purchased usage/add-on. Configuration/meter observations are **not a finalized invoice**
or a claim that the existing database has no cost. See [runbook/rollback](connected-staging-runbook.md).
