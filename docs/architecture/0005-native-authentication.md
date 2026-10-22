# ADR 0005 — native authentication (draft, locally verified in Phase 2A)

Issue [#26](https://github.com/Vivek-k24/Dzirent/issues/26), 2026-10-21. Implementation base
`c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`; branch `codex/native-auth-phase1`.
The Phase 1 assignment superseded historical external-identity assumptions and authorized source
implementation only. Issue [#62](https://github.com/Vivek-k24/Dzirent/issues/62) separately authorizes
disposable local Phase 2A tests and corrective fixes. It does not authorize hosted migrations,
real/staging accounts or admin grants, deployment, merge, demo cutover or Phase 2B.
See [actual local evidence and remaining gates](../auth/phase2a-test-report.md).

## Decision

FastAPI owns native passwords, database-backed sessions, verification/recovery and authorization.
Next.js forwards an allowlist of API paths through `/auth/api/**`, using server-only
`DZIRENT_API_UPSTREAM_URL` and one exact `DZIRENT_WEB_ORIGIN`. It never handles password hashing,
stores identities, trusts browser role/owner IDs, or provides another catalog/backend. The same
origin must be configured as FastAPI `DZIRENT_AUTH_WEB_ORIGIN`. Connected configuration errors
and upstream failures return errors; MSW remains restricted to explicit demo mode.

The read-only reference is PartGraph `Vivek-k24/forgebridge-demo` at
`d7c6795accddeb0868dc234047c222ed2ea621a1`: its six `identity/auth` modules, `AuthGate.tsx`, and
two auth/RBAC test sources. Adapted primitives: salted Argon2id, dummy verification, rehash on
login, normalized identifiers, 32 random-byte opaque tokens, SHA-256 stored digests, absolute
expiry, revocation and separately committed atomic throttle counters. No reference tests were run.
Its user/preference schema, vehicle roles, async/Neon wiring, role switching and static CSRF value
are not imported. The Next.js UI adapts the checking/signed-out/signed-in/unavailable state model.

## Identity and migration compatibility

Canonical `users.id`, `user_roles`, preferences, lender profiles, products and Studios remain.
`auth_credentials.user_id` is a one-to-one FK and `email_normalized` is non-null, unique and
lowercase; ASCII email login only, no username login. Application validation rejects non-ASCII
addresses before case folding, trims address whitespace, and validates basic address syntax.
`users.email` remains nullable/nonunique for legacy/demo profile compatibility. Native login
queries only credentials, then checks the linked user is native and active. Email matching never
adopts a legacy subject. Registration reserves existing native profile email matches and returns
the same generic acceptance without attaching a password, even if that subject has no credentials.
Mock identities cannot acquire native credentials through bootstrap or login.

The migration chain is existing `0002_studios` → existing `0003_native_identity_boundary` → new
`0004_native_auth`. The owner's empty staging DB at `0002` is an owner-reported baseline, not a
database observation by this implementation. `0003` stays immutable and aborts on unreconciled
old-provider subjects. `0004` adds six tables: credentials, sessions, throttle counters, one-use
tokens, privileged grants, and owner audit events. It changes no existing row, identity, password,
reference data, ownership relationship or SQL role membership. There is no identity backfill.

When the hosted runtime SQL role exists, `0004` requires the migrator login and refuses runtime
schema-CREATE/superuser/CREATEDB/CREATEROLE/BYPASSRLS/role-membership privileges. New tables are
owned by the executing migrator. It revokes PUBLIC and inherited default **table grants to all
non-owner roles** on those new tables, then grants runtime only needed SELECT/INSERT and selected
UPDATE columns. Rate-counter keys/actions are immutable to runtime; only attempts/window can update.
It never changes existing role attributes, memberships, default privileges or existing table ACLs.
Runtime gets SELECT of grant identifiers/user/capability/expiry/revocation only, no grant writes,
and no access to owner audit events. No blanket ALL TABLES/ALL SEQUENCES grants are added.
Existing runtime domain grants are owner-reported; they were not queried or altered in Phase 1.
Hosted role attributes, ownership and effective ACLs still require independent Phase 2B inspection.

Local disposable installations without the hosted role names can apply the same schema without
creating SQL roles. Phase 2 must additionally exercise the hosted-style migrator/runtime role split.
Downgrade is permitted only when credentials, sessions, tokens, grants and events are empty; throttle
counters can then be discarded. Otherwise it aborts for a preservation plan. Application rollback
must not drop auth tables or revert `0003` while native accounts exist. Old application binaries
fail closed on native cookie requests; the public demo does not depend on this database change.

## Browser and session boundary

HTTPS uses `__Host-dzirent_session`, `__Host-dzirent_csrf` and `__Host-dzirent_client`: Secure, HttpOnly, SameSite=Lax,
Path=/, no Domain. Loopback local/test HTTP uses unprefixed names and cannot be selected for
deployed environments. Browser credentials never enter localStorage, sessionStorage, URLs or
response bodies. A session has 256 bits of randomness and a fixed configured absolute lifetime
(24 hours default, maximum 168); only its SHA-256 digest is stored. No sliding renewal.

Every connected mutation, including login/register/recovery and all existing domain writes,
requires the exact configured Origin plus a signed double-submit CSRF challenge. Missing/null
origins and foreign Fetch Metadata are denied. The challenge contains a random nonce and a
30-minute expiry, is HMAC authenticated with a private ≥32-byte key, and is bound to the current
session-token digest (including the anonymous state). GET `/auth/csrf` returns it to same-origin
JavaScript and sets its HttpOnly cookie. The browser keeps the header value only in memory.
The middleware checks cookie/header equality, MAC, expiry and session binding before reading
mutation bodies. Login/password change rotate the session and invalidate the previous challenge;
the client clears its cached challenge. No automatic mutation retry is performed after failure.

The BFF strips bearer/role/user/forwarded-IP headers, forwards only native cookies and the actual
Origin/CSRF headers, bounds bodies (16 KiB auth; 1 MiB domain), uses a fixed validated upstream,
denies redirects and cookie-domain/security mismatches, and returns explicit 503 on configuration
or transport failures. FastAPI independently bounds bodies and checks CSRF/Origin. Credentialed
cross-origin browser API calls are not enabled; CORS remains exact and credentials=false.
Personal/auth responses carry no-store/no-referrer. Session fixation is prevented by generating a
new token on each login, revoking the presented old token and rotating after password change.

## Account lifecycle and authorization

Public registration creates ordinary renter membership and unverified credentials only when email
delivery is configured and bounded queue capacity is available; it never creates a verified email
or administrator. A committed account stays unverified until its link is confirmed. No signup
role field is accepted. Unverified users may sign in, read their own basic profile/preferences,
request verification, change password, sign out or deactivate. Profile/preference/lender writes
require verified email; lender membership remains additive and requires a real active metro.
Native bootstrap returns the already resolved canonical identity, without account creation.

| Actor | Public catalog/Studios | Own session/profile | Profile/preferences/lender writes | Other owner's listings/Studio | Operations guard |
| --- | --- | --- | --- | --- | --- |
| Anonymous | Read | 401 | 401 after transport checks | Denied | 401 |
| Active unverified native renter | Read | Read | 403 verification required | Denied | 403 |
| Verified renter | Read | Own | Own profile/preferences/enrollment | Denied | 403 without explicit grant |
| Verified lender + renter | Read | Own | Own profile/listings/Studio only | Non-enumerating 404 | 403 without explicit grant |
| Platform admin grant holder | Read | Own | Same normal business ownership rules | No bypass | Narrow capability only |
| Inactive/expired/revoked native session | Public read | 401 | 401 | Denied | 401 |
| Synthetic staging account | Read | Own in staging/test only | Ordinary membership rules | Denied | Always denied |

Password change checks the current password, updates the hash, consumes outstanding links and
revokes all sessions, then creates one fresh current session. Password reset consumes a valid
unexpired, one-use digest, revokes all sessions/links, and requires a new login. Recovery is also
available to active unverified accounts at owned mailboxes, so a lost password can be recovered
before verification; it does not itself change the email-verification state. Logout revokes the
current digest; logout-all requires password confirmation. Deactivation requires password
confirmation, marks the canonical user/lender inactive, hides owned public listings via existing
queries, and revokes all sessions/links. It preserves domain rows/history. Native DELETE `/me`
returns `reauthentication_required` and directs clients to POST `/auth/deactivate`; mock demo
DELETE behavior remains. Inactive native identities cannot read private data through old sessions.

`platform_admin` is a separate operations capability, never a `user_roles` membership or universal
superuser. The only scaffold endpoint is `/admin/access`. Runtime cannot write grants/audit events;
owner-only grant/revoke operations record actor/reason/evidence digest. Guard access also emits an
allow/deny audit log with user/request IDs, without email/password/token data. No dashboards, KPI,
revenue/accounting, user administration or financial action is implemented.

## Email, throttling and residual risk

Provider-neutral delivery is an `EmailDelivery` protocol; the default disabled backend returns
503 rather than logging a link or accepting fake delivery. Optional SMTP uses TLS verification,
no plaintext fallback, protected server settings and an 8-second timeout. Reserved example/test
domains never receive mail. Verification defaults to 24 hours, recovery to 30 minutes; tokens are
256-bit, SHA-256 digested, purpose-specific, expiring and single-use under user/token locks.
Links use fragments removed by the UI before requests; confirmation requires a user POST rather
than automatically consuming on page load. Never configure provider click tracking/link logging.

Throttle counters use HMAC identifier/client/aggregate keys and atomic upserts in independent
committed transactions, so failed auth rollbacks cannot erase attempts. A signed, expiring anonymous
client cookie separates callers behind one BFF peer. It conveys no identity, role or IP authority.
Fifteen-minute limits: login 10 per identifier / 60 per client; other actions 5 per identifier
(when supplied) / 30 per client; every action has an aggregate limit of 2048. An exceeded earlier
bucket stops consuming later budgets. Success does not reset counters. No forwarded IP is trusted.
Clients can acquire fresh anonymous cookies, and identifier limits can be targeted; internet abuse
controls, proxy topology, operational budgets and legitimate concurrency need Phase 2B review.
Retention/cleanup scheduling is owner-operated future work; no worker/service is introduced.

Delivery uses a process-local queue (16 reservations, two threads), submitted through SQLAlchemy
`after_commit` only. Commit failure, rollback/close or a refused nested transaction cannot dispatch
a link; an early reservation explicitly starts a root transaction so rollback releases capacity.
Eligibility branches reserve equally, SMTP is off the request path, and signup/recovery apply a
200–230 ms response floor. Local concurrency, rollback, permission, cookie and Chromium regressions
are tested; timing bounds are observations on the local machine, not a constant-time guarantee.
Delivery failure logs only a coarse event. No raw token is persisted in an outbox. Queue/process
loss or SMTP failure requires a new link request; there is no durable-delivery guarantee. A real
provider, TLS handshake/deliverability, HTTPS cookie behavior and operational monitoring remain
unverified. There is no email-change flow, MFA, WebAuthn, reactivation, username login, native app
or transactional email-provider integration. Local Phase 2A is not production security acceptance.
Do not enable connected staging publicly before separately authorized Phase 2B review.

Primary review references: [Argon2 API](https://argon2-cffi.readthedocs.io/en/stable/api.html),
[OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
Post-commit semantics: [SQLAlchemy session events](https://docs.sqlalchemy.org/en/21/orm/events.html#sqlalchemy.orm.SessionEvents.after_commit).
