# Azure connection recovery — Stage 2, October 28, 2026

**Stage 2 complete. Both existing SQL roles authenticate. No deployment or schema/application-data
change.** This supersedes the rejected-login checkpoint in [draft #76](https://github.com/Vivek-k24/Dzirent/pull/76).
All times below are America/Chicago (CDT); UTC is five hours later.

## Authority, exact source and boundary

The owner supplied the existing administrator password privately, reported the two role passwords
unknown, and explicitly authorized generating/resetting only those existing role passwords, saving
them and their TLS URLs in the protected local files, and verifying unchanged permissions. No
database/role/table/schema recreation, privilege/ownership/data change, deployment or website change.

- Exact starting Git revision: `19b850bb42102525590c792bed2a63487301813c`.
- Own isolated branch/check-out: `codex/azure-backend-phase1`,
  `H:\DziRent\worktrees\codex-azure-backend-phase1`. Existing issue #25 claim and draft #76 retained.
- Runtime integration stays83ba855; selected native source is still draft #61 at8c98d88. No runtime,
  dependency, schema, generated contract/client, other agent log or worktree change.
- Stage1 reconciled all17 worktrees and preserved the one prior edit; main stayedc7b3db3. #76's
  Foundation/Security workflows at the starting revision completed successfully. Those CI results
  are separate from the actual Azure connection evidence below.

## Protected configuration and operation

Stage1 created `H:\DziRent\secrets\dzirent-owner-inputs.env` outside all repositories/worktrees,
with inheritance disabled and only the owner's Windows account/SYSTEM allowed. Administrator
username came from read-only metadata for the exact existing server, not from its server name.
The owner filled its administrator password privately; unknown role passwords remained blank.
No administrator password is copied into application runtime configuration.

At **11:24 CDT**, the administrator authenticated to the existing `dzirent_staging` using the owner's
exact CA bundle and `sslmode=verify-full`. Read-only SQL reported PostgreSQL17.11 and TLS1.3/256bits,
the expected administrator/database identity, both existing LOGIN roles, and schema0002. Both target
roles were nonsuperuser, no CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS. No reset occurred at this gate.

At **11:32:18–11:32:42 CDT**, the one-time authorized recovery:

1. Locked both existing private files against concurrent edits. Reverified administrator identity,
   exact target/CA, existing role identities/login/expiry and administrator ADMIN OPTION for both
   roles. No membership or privilege grant was needed.
2. Checked statement/duration/transaction-sampling and pgAudit configuration before sensitive SQL.
   The logging gate passed; no server/session audit/logging configuration was changed.
3. Generated two **different** passwords using independent cryptographically secure draws (48 random
   bytes each plus password-policy characters). Constructed URLs with the existing SQLAlchemy URL
   encoder and verified exact role/host/database/port/verify-full/CA and decoded-password round trips.
4. Generated independent native CSRF material and a separate 32-byte AES outbox key/key ID in the
   format accepted by the existing keyring. These three fields were previously empty; no active
   key was rotated or reused. Saved only in the protected owner-input file.
5. Durably saved pending new credentials in a newly created, owner/SYSTEM-only recovery file outside
   Git before database commit. The owner-input file's administrator password was not duplicated.
6. Serialized one transaction with a dedicated advisory lock. Used libpq's explicit SCRAM-SHA-256
   client-side verifier generation, then **only two `ALTER ROLE ... PASSWORD` statements**. Cleartext
   passwords were absent from those statements. All other role options were omitted and preserved.
   In-transaction preservation checks passed before both resets committed together.
7. Updated the two existing protected files in place, retaining their exact Windows ACLs and unrelated
   settings. Verified saved bytes and parsed values. Runtime URL selects only `dzirent_app`; migration
   URL selects only `dzirent_migrator`; administrator credentials are never selected for either URL.
8. Opened independent, default-read-only sessions as each role and verified TLS, identity, schema,
   counts and effective permission boundaries. Repeated the preservation snapshot after commit.
9. Used the existing native settings/keyring/database adapter for a separate **local-loader probe
   against the real Azure database as `dzirent_app`**, with explicit URL and `_env_file=None`. The
   SELECT passed. This did not launch FastAPI or create hosted/staging origin configuration.
10. Verified exact before/after file security descriptors and zero unexpected allowed principals.
    Removed only the newly created temporary recovery copy after authoritative files and connections
    were verified. Both authoritative private files remain intact; no secret copy entered Git.

The client-side verifier approach follows
[PostgreSQL's libpq password guidance](https://www.postgresql.org/docs/17/libpq-misc.html#LIBPQ-PQENCRYPTPASSWORDCONN).
Only PASSWORD was supplied to [ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html).
No raw password, URL, verifier, administrator username, key, token or raw exception is in this report,
terminal output, GitHub or application logs. Private helpers/evidence remain ignored locally.

## Actual connection and preservation results

| Check | `dzirent_app` | `dzirent_migrator` |
| --- | --- | --- |
| New-password authentication, separate session | Passed | Passed |
| Exact database/current role | Passed | Passed |
| CA + hostname verification | `verify-full`, TLS1.3, 256bits | `verify-full`, TLS1.3, 256bits |
| SQL server version | 17.11 | 17.11 |
| Transaction mode for verification | Read-only | Read-only |
| Read Alembic revision | `0002_studios` | `0002_studios` |
| Read user/product counts | 0 / 0 | 0 / 0 |
| CREATE public schema | False | True, unchanged |
| CREATE database | False | False |
| UPDATE Alembic table | False | True, unchanged |

Before/in-transaction/after-commit snapshots compared equal for existing role OIDs, nonpassword role
attributes/configuration, memberships/admin/inherit/set options, database/schema/object ownership and
ACLs, column/function/default ACLs, RLS policies, database-role settings, effective database/schema/
table/column/sequence privileges, Alembic revision and **all18 public table counts**. Counts alone do
not prove every row byte unchanged; the executed mutation scope was exclusively the two role
passwords, with no application-data DML or object/schema DDL. No original role/schema was recreated.

## Actual commands and evidence limits

Executed with existing Python3.12 API environment, psycopg3.3.6/libpq18.4 and pinned native code:

| Command/check | Actual result |
| --- | --- |
| Bounded administrator inspection via `services/api/.venv/Scripts/python.exe -` | Exit0, read-only administrator/roles/schema/TLS verification at11:24. |
| `.../python.exe -m py_compile .tools/azure-phase1/stage2-role-recovery.py` | Passed before execution. |
| `.../python.exe .tools/azure-phase1/stage2-role-recovery.py --execute-authorized-stage2` | Exit0; two password resets committed, both files saved, independent logins and preservation checks passed. |
| Existing native `Settings` / `keyring` / `create_db_engine` readonly probe within that command | Passed; actual runtime-role Azure SELECT, no local PostgreSQL fallback or privileged runtime role. |
| Windows `Get-Acl` comparison and restricted-principal inspection | Both files' exact ACLs unchanged; zero unexpected allowed principals. |
| Guarded `Remove-Item -LiteralPath` for the newly created pending recovery file | Completed only after successful result/persistence/ACL checks; authoritative files retained. |

Administrative helper digest (SHA-256):
`5b384756961a7af0b510f1ee9acd198adce2f38dcbce4a8e734c37a44f8b8d81`.
No password/verifier-bearing SQL or raw exception was persisted in its output. Recovery is not an
idempotent routine or authorization for another reset; its execution flag and empty-journal guard
prevent accidental reuse of a prior operation.

Not run: migrations, application CRUD, destructive fixtures/pytest against Azure, hosted API/health,
browser/E2E, real email, account/admin provisioning, uploads, resource/hosting/firewall/billing
configuration or deployment. No full local application test rerun or hosted acceptance is claimed
from documentation publication/CI. The live public demo is unchanged.

## Stage 3 readiness and remaining blockers

**Credentials and local secret custody are ready for Stage3 planning. Hosted acceptance is not ready.**

- The actual database is still **0002**. Selected native runtime expects **0005**. Additive migration
  review, recovery readiness and explicit permission for that later step are required; this Stage2
  instruction forbade schema changes, so no migrations were run. Media0006 is a separate unmerged
  candidate and not silently included.
- No Azure HTTPS FastAPI service or deployed API URL exists. Recheck current credit/spending-limit,
  minimum hosting capacity/cost, narrow egress/firewall access, TLS trust and runtime-only secret
  delivery before later cloud writes. Previous financial observations are dated October27, not
  refreshed or asserted current by this password-recovery run.
- Staging frontend/backend origins remain blank until actual approved hosts exist. Use the exact
  native API origin/CORS and server-only Next upstream fields from code. Never deploy/source the
  entire privileged owner-input file or expose secrets through NEXT_PUBLIC variables.
- Outbound email/provider/sender ownership is unverified. SMTP and its worker remain disabled;
  registration is not operational and verification must not be bypassed.
- Draft #75 implements private local/test files and PostgreSQL upload metadata/ownership checks;
  filesystem media is explicitly rejected in hosted staging/production. A reviewed hosted private
  object-storage adapter/service identity is still required. PostgreSQL is not garment-image storage.
- `dzirent_staging` remains staging. Production isolation, full connected auth/upload/security and
  restart/persistence acceptance, owner cutover approval and a rollback plan remain prerequisites
  to replacing the public demo. No Stage3 deployment/configuration was begun here.

Keep current URLs/credentials in protected storage; do not restore the earlier rejected values as
an application rollback. Any future role password reset requires its own authorization. Do not
drop/downgrade schema or grant privileges to work around a later connection/authentication failure.
Stop at this Stage2 handoff and owner review.
