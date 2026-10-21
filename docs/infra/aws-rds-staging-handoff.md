# AWS RDS staging handoff — issue #34

Status: **read-only TLS/IAM verification passed; isolated staging and hosted API are pending approval**.
Issue [#34](https://github.com/Vivek-k24/Dzirent/issues/34) remains open. Real sign-up/login
[#26](https://github.com/Vivek-k24/Dzirent/issues/26) has not started: its staging and real identity
dependencies are not yet met. The live Vercel presentation demo remains unchanged.

Worktree: `H:\DziRent\worktrees\codex-web`; branch: `codex/aws-rds-staging`.
Exact fetched main/base: `8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c`.
The PR head identifies this handoff commit; `git rev-parse HEAD` resolves a checked-out copy.
Contract `0.1.0-candidate.2`, API/migrations, fixtures and dependency locks are unchanged.
Only `infra/aws/**`, this document and `docs/agents/codex.md` are in the issue claim.

## Observed evidence

Run date: October 20, 2026 in America/Chicago; October 21 UTC. Existing local AWS CLI authentication
matched the privately supplied account. Default credentials were unavailable; an existing configured
profile succeeded without a login, credential export or password retrieval. Existing IDE settings
did not provide a PostgreSQL connection. Private IDs, hostnames, IAM identities and raw inventories
remain ignored locally; they are intentionally absent here.

| Check | Actual result |
| --- | --- |
| Target | STS account, cluster ARN region/account, writer/reader and instance hostname equality verified |
| Engine | RDS `aurora-postgresql` 17.9; SQL `server_version_num=170009` |
| Topology | One available `db.serverless` writer; no reader replica |
| Network | Express configuration: existing internet access gateway enabled, VPC networking disabled; no SG/subnet attachment; legacy instance `PubliclyAccessible=false` |
| Encryption | `StorageEncryptionType=sse-rds` (AWS-owned-key encryption), despite legacy `StorageEncrypted=false` |
| Auth | IAM database authentication enabled; two successful short-lived IAM-authenticated sessions |
| DNS | All three supplied endpoint roles resolved to public addresses; addresses kept private |
| TLS | Writer and reader both passed `sslmode=verify-full`, TLS 1.3, `TLS_AES_256_GCM_SHA384` |
| SQL safety | Both sessions `transaction_read_only=on`; metadata only; no DDL or application data reads/writes |
| Reader behavior | `pg_is_in_recovery=false` on both; reader endpoint reaches the sole writer, not an independent replica |
| Operator privileges | `CREATEDB` and `CREATEROLE` true, superuser and bypass-RLS false; CONNECT/schema-CREATE true in the supplied maintenance database |
| Proposed staging names | `dzirent_staging` absent; neither proposed staging role exists |
| Maintenance DB | Zero user tables/partitioned tables observed there; other databases' data were not inspected |
| Backup/safety | One-day backup retention; deletion protection disabled; restore not rehearsed |
| Scaling | Serverless v2 minimum 0, maximum 16 ACU; auto-pause delay 300 seconds |
| Hosting discovery | App Runner service list and ECS cluster list both succeeded and were empty in the target region; other compute services were not exhaustively inventoried |
| Benefits | Free Tier account-plan request returned `ResourceNotFoundException`; credit/benefit coverage and actual billed usage are unverified |

The gateway and encryption fields above are current Express behavior. Empty VPC/SG fields do not
require opening a network rule, and the legacy encryption boolean does not justify replacing this
cluster. AWS documents gateway IAM access and its AWS-root certificate trust in
[Express configuration](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_GettingStartedAurora.AuroraPostgreSQL.ExpressConfig.html);
see also [encryption at rest](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Overview.Encryption.html).
The nullable `rds.force_ssl` setting was not interpreted as TLS being disabled.

Cluster business/production ownership is **unconfirmed**; no ownership tags established permission
to use it. Technical creation privileges are not consent. The successful maintenance-DB check is not
evidence that the entire cluster is unused, an isolated Dzirent database exists, or staging is operational.

## Actual validation and limits

Windows; Python 3.12.15, AWS CLI 2.38.3, psql 17.2. The approved live invocation was:

```powershell
& 'C:/Users/User/AppData/Roaming/uv/python/cpython-3.12.15-windows-x86_64-none/python.exe' infra/aws/inspect_rds.py --config .local/target.private.json --output-dir .local/probe-2026-10-20 --connect --allow-resume-cost --timeout 180
```

**Exit 0, 2026-10-21 00:11:32–00:12:08 UTC, 36 seconds.** Five CLI invocations: STS identity,
cluster describe, instance describe and two local IAM token signatures. Exactly two successful
PostgreSQL read-only sessions (writer and reader); zero database writes or resource mutations.
All sessions closed. Auto-pause after this run and the actual charge were not measured.
The user explicitly approved only these brief read-only checks and possible resume cost.

Run artifact SHA256:

- `inspect_rds.py`: `e6dff106e7943aa34553b84f24a7a014f7e89e649ccf1e8443e706d010d321e9`
- `inspect.sql`: `30fc4ef98ba3583268eaf8b229003d3f94ab70b22540fc5a797c4453b1370f78`

Private evidence is under `infra/aws/.local/`, especially `probe-2026-10-20/{findings.json,raw.private.json}`.
Before the live probe, Ruff 0.6.9 check/format, Python compilation and `--help` succeeded. Final focused
checks and PR CI are recorded in the own-agent log and on the PR at their tested commit. No application
build, unit/browser suite, staging migration, seed, API startup/deployment, persistence/authorization
acceptance, restored backup or connected frontend test was run for this discovery.

## Proposed isolation — review only, no DDL executed

Reuse this cluster only if the owner confirms that staging may share its compute, storage, backups
and administrative boundary. No new cluster/instance, gateway, SG, subnet, parameter or capacity change
is proposed. A separate database is logical isolation, not a separate production failure/cost boundary.

Proposed new objects, all names must be absent immediately before creation:

| Object | Intended privileges |
| --- | --- |
| `dzirent_staging` | New empty database, owned by the new migrator; never migrate the existing maintenance DB |
| `dzirent_staging_migrator` | IAM LOGIN; owns only new staging DB/schema/objects; connection limit 2; NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS |
| `dzirent_staging_app` | IAM LOGIN; connection limit 2; same administrative prohibitions; staging CONNECT, schema USAGE, application-table SELECT/INSERT/UPDATE/DELETE and sequence USAGE only |

After separate write/cost approval, serialize this sequence with stop-on-error:

1. Reconfirm the private account/cluster/DB target and owner's staging authority. Audit effective
   existing `PUBLIC`/inherited privileges using metadata, without reading application rows. Abort if
   safe isolation would require altering an existing database/role/ACL; request a reviewed scope change.
2. Assert the new database and both role names are absent. Fail if any exists; do not silently adopt it.
   Create just the two restricted LOGIN roles, grant `rds_iam` only to them, and create the empty DB.
   Any membership needed by the operator to assign ownership is confined to the new migrator,
   recorded and removed afterward. Never remove `rds_iam` from the existing operator.
3. Inside **only the new database**, revoke `PUBLIC` CONNECT/TEMP and public-schema CREATE; grant
   explicit migrator/app CONNECT. Use the new migrator-owned public schema for compatibility with
   the existing unqualified Alembic tables; set an explicit safe search path. App receives no schema
   CREATE or ownership. Give the app no membership in the migrator or admin roles.
4. Once the IAM connection adapter and real staging identity configuration are available, use a
   **separate direct migrator session** and run the existing Alembic chain once. Baseline head is
   `0002_studios`; reconfirm the reviewed release's head before executing. No automatic seed or schema
   changes in API replica startup. Default/final grants apply only to migrator-created staging objects.
   Exclude migration metadata from app DML: `alembic_version` needs SELECT only. No app DDL or TEMP.
5. Independently connect with the application identity using TLS hostname verification and fresh IAM
   authentication. Check role restrictions, CRUD on disposable staging records, DDL/admin denial and
   the effective privilege audit. Do not mutate existing databases to test denials. Never use the
   maintenance operator as the API user. Store private ACL evidence outside GitHub.

PostgreSQL roles and IAM `rds-db:connect` permissions are cluster-scoped, not DB-name scoped.
New roles can inherit existing `PUBLIC` permissions elsewhere; revoking PUBLIC on the new database
does not fix old ACLs. No claim of exclusive access to only one DB can be made until that audit passes.
Existing data/ACLs will not be changed under this proposal. Database creation alone is not the issue's
completion gate.

## API path and smallest compatible code change

The existing gateway already provides a reachable PostgreSQL wire-protocol path; no VPN, VPC connector,
new public ingress or reader write target is needed. Use the private **writer** hostname for migrations
and application writes, with an AWS trust bundle and `verify-full`.

Current `services/api/src/dzirent_api/db.py` uses a static URL and persistent SQLAlchemy QueuePool
(default size 5 plus overflow 5). That is incompatible with an IAM token treated as a permanent URL
password, and open connections can prevent auto-pause. Do not paste this probe's token or operator
AWS credentials into a hosted environment as a workaround.

Request a recorded API/runtime ownership handoff for the following narrow change before editing:

- Add explicit optional IAM database authentication to the existing engine factory. Sign a fresh
  token for **each new physical connection**, using the workload credential chain, and inject it in
  memory; retain the existing non-AWS URL path. Pin any AWS SDK dependency through Claude's API lock.
- Configure verify-full trust, connection/statement/idle timeouts and an explicit idle-closing pool
  policy (initial staging proposal: SQLAlchemy NullPool). Use a bounded resume-aware connect timeout.
  Health polling should use `/api/v1/health/live`; recurring DB readiness polls must not defeat pause.
- Keep staging `connected` + `clerk`, exact HTTPS CORS/authorized parties and fail-closed errors. No
  mock bypass, static long-lived IAM token or migration in every replica. No contract change needed.

No existing App Runner/ECS host was found. A concrete **unapproved** hosting option is one App Runner
service using the existing API Dockerfile/image, manual deployments, 0.25 vCPU/0.5 GB initially, at most
one active instance, liveness-only health checks and its generated HTTPS URL. Resource adequacy must
be tested. It would also need a reviewed image registry/log-retention plan, image-pull role and a
dedicated workload role granting only `rds-db:connect` for the staging app identity; migration uses a
separate identity. New IAM trust/policies, registry, logs and service creation need explicit approval.
No such resources have been created, and this is not a free-hosting promise.

Required private identity setup: the user's Clerk staging application/issuer, verifier public key
or backend secret, and exact staging frontend origin/authorized parties. Those values are unavailable.
No real sign-up/login, authenticated persistence or cross-user acceptance can pass until they exist.
Do not accept real user credentials in the live sample-auth demo.

## Cost boundary

No credits/free coverage were verified. Illustrative US East Aurora Standard list rates are
$0.12/ACU-hour, $0.10/GB-month storage and $0.20/million I/Os. At the observed maximum 16 ACU,
compute is $1.92/hour; 0.5 ACU continuously awake is about $43.80 per 730 hours, before storage,
I/O, backups, transfer and taxes. Ten minutes at 16 ACU is $0.32 compute, not an actual bill or cap.
[AWS Aurora pricing](https://aws.amazon.com/rds/aurora/pricing/).

Connections can resume compute even if authentication fails; retained connections prevent pause.
See [Serverless v2 auto-pause](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html).
The completed read-only permission is not approval for ongoing staging usage. Do not change the shared
capacity/auto-pause settings without approval. New DB storage/IO and shared workload impact need consent.

For the proposed App Runner size, published memory is $0.0035/hour (about $2.56/730 hours idle);
active CPU adds $0.016/hour. Always active compute/memory is about $14.24/730 hours, plus registry,
logs, transfer, database and taxes. Neither account eligibility nor all extra charges are verified.
This host is **not approved**; obtain a cost-reviewed duration/budget and cleanup decision before
creation. [AWS App Runner pricing](https://aws.amazon.com/apprunner/pricing/). Alerts/scale limits
do not impose a hard billing cap.

## Remaining acceptance and rollback

Approval A: confirm owner authority/shared-cluster suitability and authorize only the new staging DB,
two SQL roles and bounded connection/isolation checks, accepting possible compute/storage/IO charges.
No existing ACL/data change, IAM policy change, host creation or migration is included in that approval.
Approval B: separately review/authorize the host, workload IAM, registry/log costs and API/runtime handoff.
Then configure real Clerk staging, migrate once and verify the direct migrator and app connections.

Record the actual API URL/image/source SHA and migration head before running:

- HTTPS `/api/v1/health/live` and DB-backed `/api/v1/health/ready`.
- Real isolated identity bootstrap/profile write, API restart, then read the same persisted record.
- Missing/invalid auth denial and cross-user/lender ownership denial using real staging identities.
- Fail-closed provider/DB errors, safe logs and bounded connection behavior.

Only after those pass does #34 satisfy its operational gate and #26 proceed. CI on this discovery
PR cannot substitute for these unrun hosted tests. No application/infra merge or production cutover
is performed by this handoff.

Current rollback: no cloud/DB objects changed; stop the helper and close its sessions. Keep existing
evidence ignored; private config may be removed locally when no longer needed. No cloud rollback is
necessary. Do not stop/delete the shared cluster to reduce discovery costs.

If a later approved staging setup must be removed, first stop only its API connections, verify exact
new names/ownership and export needed staging data privately. Obtain explicit destructive cleanup
approval before dropping only the new staging database/roles or deleting only new staging IAM/host
resources. Never cascade through existing/shared objects or rewrite another database's ACL. An API
image rollback does not reverse migrations. Backup retention is observed, not a tested restore guarantee.
