# Existing AWS database inspection

Issue [#34](https://github.com/Vivek-k24/Dzirent/issues/34). This tool inspects the existing,
privately identified Aurora PostgreSQL Express cluster. It cannot create a database, change
IAM/networking, migrate, seed, or deploy. The [handoff](../../docs/infra/aws-rds-staging-handoff.md)
records the actual successful run and the approvals still needed.

## Prerequisites and private configuration

Use the existing Python 3.12, AWS CLI v2 credential chain/profile and PostgreSQL `psql` client.
No Python dependencies or application lockfile changes are needed. The observed versions were
Python 3.12.15, AWS CLI 2.38.3 and psql 17.2 on Windows. AWS/psql must be on `PATH`.

From the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Path infra/aws/.local -Force | Out-Null
Copy-Item infra/aws/config.example.json infra/aws/.local/target.private.json
```

Fill the ignored copy locally with the private expected account, region, existing profile,
cluster identifier, maintenance database and three supplied hostnames. Never put passwords or
tokens in it. Do not paste its contents, AWS inventory or full connection errors into GitHub.
The tool does not sign in or retrieve stored database passwords; it reuses the existing CLI session.
Expired/missing credentials are a reported blocker.

## Bounded read-only use

Control-plane metadata and DNS only (no PostgreSQL socket):

```powershell
python infra/aws/inspect_rds.py --config .local/target.private.json --output-dir .local/inventory-01
```

An inventory-only run exits **2** deliberately: SQL connectivity has not been demonstrated.
Choose a new output directory for each run; existing evidence is not overwritten.

Connecting can resume billable Serverless v2 compute. Obtain the user's explicit cost permission
first; adding a flag is not approval. The approved probe uses exactly two SQL sessions, one per
writer/reader endpoint:

```powershell
python infra/aws/inspect_rds.py --config .local/target.private.json --output-dir .local/probe-01 --connect --allow-resume-cost --timeout 180
```

Exit **0** means both read-only connections succeeded. It **never** means isolated staging, API
hosting or authentication acceptance is complete. `staging_operational` remains `false`.

Account, cluster ARN region/account and all supplied endpoint roles are checked before connecting.
Only STS identity and RDS describe operations are exposed, plus in-memory IAM token signing.
The SQL file is fixed: `BEGIN READ ONLY`, catalog/session metadata `SELECT`, `ROLLBACK`.
`default_transaction_read_only` is also forced in the connection. No application rows are read.

TLS uses `verify-full`, minimum TLS 1.2, and the official Amazon Root CA 1 certificate fetched over
verified HTTPS without redirects. This is the Express internet gateway trust model; do not substitute
the conventional RDS CA bundle or downgrade verification to fix a connection. IAM tokens are passed
only through the child process environment, not argv, a DSN, output or files. Psql ignores startup
files and never prompts. See [AWS Express configuration](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_GettingStartedAurora.AuroraPostgreSQL.ExpressConfig.html).

Default supervisor budget: 180 seconds (allowed 30–300); at most 12 CLI invocations, four cluster
members and two SQL sessions. Each CLI command has a 25-second subprocess timeout, one attempt,
and bounded network timeouts. SQL statements have 5-second timeouts, locks 2 seconds and idle
transactions 10 seconds; psql connect/command limits are 40/50 seconds to accommodate resume.
The supervisor terminates the worker on its deadline; a child already running has its own bounded
command/connection timeouts. These limits bound work, not AWS billing or the auto-pause delay.

## Evidence and failure handling

All outputs stay in ignored `infra/aws/.local/<run>/`:

- `raw.private.json`: private account/cluster/session metadata. Never publish.
- `findings.json`: allowlisted observations, statuses, timestamps and tool/SQL hashes. Review before sharing.
- `amazon-root-ca1.pem`: public trust certificate; no credentials.
- `failure.json` / `timeout.json`: category-only failures when applicable.

Failures redact command stderr rather than persisting identifiers or token-bearing errors. Successful
control-plane discovery does not prove database permissions; observed database role flags do not
authorize mutations. The helper intentionally supports only the verified Express IAM gateway path;
a different network/auth configuration needs a separate reviewed change.

## Focused local checks

```powershell
ruff check infra/aws/inspect_rds.py
ruff format --check infra/aws/inspect_rds.py
python -m py_compile infra/aws/inspect_rds.py
python infra/aws/inspect_rds.py --help
git diff --check
```

Keep raw evidence and private configuration ignored. Do not repeat live probes merely to validate
documentation, run application tests against the existing maintenance database, or reuse the operator
identity as an application's runtime credential.
