# Connected deployment — first-party authentication and Azure PostgreSQL

> Active staging runbook, updated 2026-10-21. Issue #25 governs the HTTPS API host; Issue #26 governs native authentication. No deployment is authorized by this document.

## Existing infrastructure

- PostgreSQL Flexible Server **17.11**, North Central US, Burstable B1ms: `dzirent-pg17-ncus-4265.postgres.database.azure.com`.
- Database: `dzirent_staging`, 17 app tables, applied Alembic head `0002_studios`. No real renter/lender accounts or sample products were present at the last owner verification.
- Distinct migration role `dzirent_migrator` and runtime role `dzirent_app`; runtime cannot create schema or change the Alembic revision. TLS 1.3 and `sslmode=verify-full` were verified locally.
- Current firewall rule permits only the owner's local client IP. A future hosted API needs a deliberate and restricted network access design. Do not enable broad public IP ranges.
- Azure for Students credit and spending limitations remain hard cost boundaries. Never disable the spending limit or provision speculative resources.

## Current connected boundary

- `DZIRENT_MODE=connected`, `DZIRENT_IDENTITY_MODE=native`, `DZIRENT_DATABASE_URL`, and exact HTTPS CORS origins are required.
- The browser uses `NEXT_PUBLIC_DZIRENT_MODE=connected` and a valid API URL ending in `/api/v1`.
- **Until Issue #26 completes**, all protected connected requests return 503. They never authenticate unverified bearer tokens, demo subjects or client-supplied user IDs.
- The public demo remains explicitly labeled, uses local mock identity only, and is not backed by Azure user records.

## When Issue #26 code and testing are approved

1. Review the additive Alembic migrations and revised database grants on a disposable local PostgreSQL 17 test database. Never target the Azure staging DB with destructive `*_test` fixtures.
2. Apply only reviewed forward migrations once as `dzirent_migrator`. Verify a single Alembic head; grant runtime `dzirent_app` the minimum required table/sequence rights.
3. Supply session and email delivery configuration through private protected settings; never publish password hashes, login credentials, verification secrets or raw connection URLs.
4. Deploy one cost-controlled HTTPS FastAPI host after explicit review of the Azure Students financial boundaries. Validate TLS, exact origins, CSRF and cookie-domain behavior.
5. Verify `/api/v1/health/live`, database-backed `/api/v1/health/ready`, session registration/login/logout and persistent account/profile CRUD. Cross-user and unauthorized writes must be denied; no mock fallback.
6. Record endpoint URL, deployed SHA, evidence and rollback procedure. Do not switch `dzirent.com` or merge/deploy on the authority of this runbook alone.

**Pending:** native credentials/sessions, verification/recovery, admin RBAC, hosted API and independently exercised security checks. These are not complete merely because the database schema exists.
