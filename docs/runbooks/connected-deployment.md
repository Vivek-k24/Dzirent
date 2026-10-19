# Runbook: Phase 1B Connected Deployment

**Target Systems:** Render (Python API Docker) & Neon (PostgreSQL)  
**Target Domains:** `api.dzirent.com`, `dzirent.com`  
**Milestone:** Phase 1B Connected Persistence and Authorization  
**Author:** Antigravity (QA Lane)  
**Authority:** `Dzirent_Engineering_Brief_and_AI_Prompts.md` §14.3  

---

## 1. Prerequisites and Safety Boundaries

1. **Explicit Mode:** API and Web run in `connected` mode (`DZIRENT_MODE=connected`, `NEXT_PUBLIC_DZIRENT_MODE=connected`).
2. **Fail-Closed Principle:** Connected requests MUST fail closed on dependency outages or errors. They must NEVER fall back to mock data or report simulated success.
3. **Database Isolation:** Production/staging data MUST NEVER be subjected to destructive tests. All test runs execute against disposable test instances (port 55432 / `dzirent_qa`).
4. **Server-Derived Identity:** Clerk session tokens are verified by FastAPI using the official backend verification SDK. Client-supplied `user_id`, `lender_id`, or `role` are strictly rejected.
5. **No Password Database:** Credentials are exclusively managed by Clerk. Database stores application profiles, preferences, and lender records only.

---

## 2. Infrastructure Setup Sequence

### Step 2.1: Neon PostgreSQL Provisioning
1. Provision a dedicated Neon PostgreSQL project in a region close to API compute.
2. Configure connection pooling (PgBouncer) for application runtime queries.
3. Configure direct connection string for Alembic schema migrations.
4. Set SSL mode to `require`.

### Step 2.2: Clerk Authentication Configuration
1. Create dedicated development/staging Clerk application instance.
2. Configure allowed web origins:
   - Preview URLs: `https://*.vercel.app`
   - Custom domain: `https://dzirent.com`
   - Local QA web: `http://localhost:3100`, `http://127.0.0.1:3100`
3. Export Clerk Issuer URL and authorized party IDs.

### Step 2.3: Render Python API Deployment
1. Create a Web Service on Render using the Docker runtime (`infra/runtime/Dockerfile`).
2. Set environment variables securely in platform settings:
   - `DZIRENT_MODE`: `connected`
   - `DZIRENT_ENVIRONMENT`: `staging` (or `production`)
   - `DZIRENT_DB_URL`: Pooled connection string
   - `DZIRENT_DIRECT_DB_URL`: Direct connection string for migrations
   - `CLERK_ISSUER`: Verified Clerk issuer URL
   - `CLERK_AUTHORIZED_PARTIES`: Comma-separated allowed origins
3. Set health check path to `/api/v1/health/live`.

---

## 3. Database Migration Execution

Migrations MUST execute as a single serialized step before API traffic routing:

```bash
# Execute within migration runner container
alembic upgrade head
```

Verify migration status:
```bash
alembic current
```
Assert single migration head and clean status.

---

## 4. Post-Deployment Connected Verification

Run independent connected integration verification:

```powershell
# Point tests to live connected staging endpoints
$env:DZIRENT_API_URL = "https://api.dzirent.com"
$env:DZIRENT_TEST_URL = "https://dzirent.com"

# 1. Verify health and readiness
pnpm exec playwright test tests/contracts/api-smoke.spec.ts --config tests/contracts/playwright.config.ts

# 2. Run full persistence loop test
pnpm exec playwright test tests/e2e/connected-persistence-loop.spec.ts --config tests/e2e/playwright.config.ts
```

Verification assertions:
- `GET /api/v1/health/live` returns 200.
- `GET /api/v1/health/ready` returns 200 when database pool responds.
- Full UI write -> API -> PostgreSQL -> second-session reload displays persisted value.
- Cross-owner read/write returns 404.
- Anonymous write returns 401.
- Stale version edit returns 409.
- CORS denies unauthorized origins.

