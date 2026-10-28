# Connected staging verification — 2026-10-28

Owner-authorized Stage3, [issue77](https://github.com/Vivek-k24/Dzirent/issues/77).
Base `a02e180f0147f4f06fd61d47c1f3997b922e9e6b`, isolated
`codex/connected-staging-stage3`. No main merge or public website cutover authorized.
All times below CDT (UTC−5). SMTP stays disabled at the owner's explicit instruction.

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

F1 is a development host with quotas, cold starts and no production availability promise. Runtime
package/dependency installation, actual allocation, HTTPS response and DB access from the host are
**not yet verified**. Database firewall still has only the existing narrow rule. No broad all-Azure
rule is allowed; actual host outbound /32 additions require a concrete review before any write.

## Outstanding acceptance

Not run: hosted health/CRUD/restart persistence; real email or account provisioning; connected session
and lender ownership acceptance; private hosted uploads/image retrieval; Vercel connected preview.
Email remains blocked, no mailbox/sender/provider is assumed. Media PR75 is a separate local-only
adapter dependency, not a hosted object store. Public production database isolation also remains a
release gate: this database is staging, never public production by default.

Both Vercel automatic-deployment guards remain false. Existing live demo and production environment
unchanged. No GitHub deployment secrets/variables created. See the
[exact environment destinations](connected-staging-environment-audit.md).

Recovery action: retain the backup; prefer application rollback without schema downgrade. Never
automatically downgrade native auth or restore over the hosted database. A database recovery needs
an owner-reviewed isolated restore/validation plan before traffic is redirected.
