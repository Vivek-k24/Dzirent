# Draft email verification delivery — Issue #64

This completes the local implementation on PR #61. Owner review and separate activation
authorization remain required. Nothing here authorizes hosted migration, SMTP delivery or deployment.
The live demo keeps its sample identities and sends no mail. Native sessions, renter/lender
membership, verified-email gates and independent platform capability checks are preserved.

## Transaction and recovery

Registration validates sender/encryption readiness before account writes. Account, digest-only
single-use `auth_tokens` row and `auth_email_outbox` row commit together. Rollback leaves none of
them visible to a worker. No mail transport runs in a request/commit callback. Generic public
acceptance covers duplicate, dormant and unknown identities without adopting credentials or
implicitly sending another verification message. `202` means accepted work, never inbox delivery.
Disabled/missing configuration returns `503`; a capacity failure rolls the account/token/job back.

The API lifespan starts one small in-process worker per connected API process when SMTP and keys
are configured. No new broker, service or cloud resource is needed. Test settings disable this
thread and invoke the same dispatcher with a fake transport. Polling defaults to two seconds,
at most ten handoffs per worker cycle; the queue defaults to 1,000 active jobs (maximum 10,000).
An advisory transaction lock serializes the brief capacity/enqueue segment across processes.

Workers claim due rows using PostgreSQL `FOR UPDATE SKIP LOCKED`, commit a unique 120-second
lease, then acquire locks in **user → token → job** order. The user lock serializes delivery with
resend, confirmation, password changes and deactivation; the claim's fencing ID prevents a stale
worker from acknowledging a replacement claim. Each send checks active native account,
non-synthetic credential, unconsumed/unexpired purpose-matched digest, current email/origin and
verification state. Invalid, consumed, superseded, inactive or poisoned work is erased and terminal.
Resend/consumption/password/deactivation cancel queued payloads in their own account transaction.

SMTP handoff and database acknowledgement cannot be one transaction. A process loss after SMTP
acceptance can resend the **same** link with a stable Message-ID; this is at-least-once handoff,
not exactly-once inbox delivery. Only the first valid confirmation can consume the token. A
stopped process's job becomes claimable after its lease expires; the sixth abandoned claim is
terminal after lease expiry. An SMTP failure is never recorded as a successful send.

Transient transport/network/4xx failures retry after 30, 60, 120, 240, 480 seconds, then stop at
six attempts; jitter is 0–10 seconds and backoff is capped at 900 seconds. A next attempt beyond
token expiry is terminal. SMTP 5xx, certificate verification or unsupported TLS failures stop
immediately. Unknown adapter exceptions receive bounded transient handling; only coarse codes/events
are recorded, never exception text. Poison jobs cannot prevent a later eligible job being processed.
The SMTP adapter uses verified SSL or STARTTLS, an eight-second socket timeout and no plaintext
fallback. User/job locks span the bounded transport operation: concurrent account operations may
wait or hit their configured DB timeout and must retry; this is a deliberate consistency tradeoff.

## Encrypted retention and migration

New additive revision `0005_auth_email_outbox` follows unchanged 0001–0004. It changes only the
new table/indices and its ACLs, not existing data, role memberships, default privileges or policies.
Rows contain immutable job/token/user IDs, purpose, key ID and expiry; mutable lifecycle fields
contain attempts, due/lease/completion timestamps, a coarse code and nullable encrypted payload.
Check constraints enforce statuses, leases, attempts, ciphertext size and a maximum 24-hour lifetime.
Downgrade refuses **any** outbox rows pending a reviewed preservation plan. It never discards them.

Only the necessary `{token, recipient, origin}` payload is AES-256-GCM encrypted with a fresh
96-bit random nonce. Authenticated associated data binds version, job/token/user IDs, purpose,
UTC expiry and key ID. Token digests remain the source for confirmation. No plaintext token,
password, session credential or reusable URL is persisted in the outbox. `cryptography==50.0.1`
is the only required new dependency; other pins are retained. Key configuration is a `SecretStr`.

Payload is cleared immediately on sent, cancelled or terminal failure. Each cycle erases at most
100 expired/exhausted rows and removes at most 100 terminal metadata rows older than seven days.
This is bounded application cleanup, **not** physical deletion from backups/WAL or a timer while
all processes are stopped. Expired encrypted rows can remain until a correctly configured worker
resumes. Hosting/storage backup retention and operational monitoring require later review.

Existing migrator isolation preconditions apply. New-table PUBLIC/inherited nonowner grants are
revoked. `dzirent_app` gets SELECT/INSERT/DELETE on this table and UPDATE only on payload/lifecycle
columns; it cannot rewrite IDs, purpose, key ID, creation time or expiry. DELETE enables cleanup
and is confined to this new ephemeral table. Runtime cannot administer existing admin grants/audit
or delete auth tokens. Local tests exercise these grants with a separate nonprivileged SQL role.

## Configuration and later activation runbook

1. Keep `DZIRENT_AUTH_EMAIL_BACKEND=disabled` until activation is separately authorized. Supply one
   exact canonical HTTPS frontend origin (HTTP only for loopback local/test), a bare normalized
   sender, reviewed SMTP host/port, `ssl` or `starttls`, and protected credentials when needed.
   Recipient/sender reserved domains, header injection and mismatched/malformed links are rejected.
2. Privately generate an independent 32-random-byte key, unpadded base64url encoded (43 characters).
   Configure `DZIRENT_AUTH_OUTBOX_KEYS` as a JSON object mapping 1–3 lowercase key IDs to such keys;
   `DZIRENT_AUTH_OUTBOX_ACTIVE_KEY_ID` selects encryption. Never print/commit the populated JSON.
   Do not reuse the CSRF key. Missing or malformed configuration fails closed before account writes.
3. For key rotation, distribute old + new keys to every process first, then choose the new active
   ID. Retain previous keys until all their active jobs have expired/completed (at least the maximum
   24-hour token lifetime plus worker/rollout allowance). An unavailable *configuration* preserves
   queued work. A job whose old key was removed from an otherwise valid ring fails terminally;
   restore the configuration before processing or let its authenticated user request a new link.
4. Later, after owner review, apply 0005 using the existing migrator lane, not API runtime. No hosted
   command is executed by this issue. Keep worker enabled in at least one API process. A disabled
   worker can accept durable work if configuration is ready, but cannot promise prompt delivery.
5. Recovery: unverified users can sign in with limited access and explicitly request verification.
   Requests within one minute reuse valid pending/leased/sent work; after that they replace the old
   token/job. Terminal failure permits an immediate new authenticated request. Old links fail after
   supersession. Existing CSRF and persistent client/identity/aggregate rate limits still apply.
6. The fragment page removes the URL token and waits for explicit submit. Successful confirmation
   refreshes existing session truth from the API; no login/verification occurs on page load. An
   unavailable session read fails closed, and a visitor without a session stays signed out.
7. Later activation must separately verify provider access, sender ownership/allowlists, domain
   SPF/DKIM/DMARC where applicable, TLS, relay/recipient failures, delivery/bounces/spam placement,
   monitoring and hosted connectivity. None of these are established by simulated transport tests.

Local tests and exact evidence: [test report](email-verification-test-report.md). Historical Phase 2A
mail queue limitations are superseded here only for implementation, not hosted acceptance.

Implementation references: [AES-GCM API](https://cryptography.io/en/50.0.1/hazmat/primitives/aead/),
[PostgreSQL 17 locking/queue selection](https://www.postgresql.org/docs/17/sql-select.html).
