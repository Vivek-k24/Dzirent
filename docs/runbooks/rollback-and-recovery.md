# Runbook: Rollback, Database Disaster Recovery, and Incident Response

**Scope:** Web, API, and PostgreSQL Services  
**Author:** Antigravity (QA Lane)  
**Authority:** `Dzirent_Engineering_Brief_and_AI_Prompts.md` §11, §14  

---

## 1. Rollback Decision Triggers

Initiate immediate rollback if any of the following occur post-deployment:
1. **Critical Functionality Failure (P0):** Core browsing, cart, auth modal, or listing operations crash or fail to load.
2. **Security / Privacy Violation:** Token leakage, credential exposure in browser storage/logs, or authorization bypass (cross-owner mutation allowed).
3. **Data Loss / State Corruption:** Database writes fail silently or optimistic UI masks persistence failures.
4. **Availability Degradation:** P95 response times degrade beyond acceptable limits or 5xx error rate exceeds 1%.

---

## 2. Web Rollback Procedure (Vercel)

1. Open Vercel Dashboard -> **Deployments**.
2. Locate the previous verified stable deployment (e.g. tagged `demo-v0.1.0` or previous SHA).
3. Click **Instant Rollback** or promote the previous deployment:
   ```powershell
   vercel rollback [deployment-id-or-url]
   ```
4. Verify DNS/traffic immediately routes to the rollback deployment.
5. Execute smoke tests:
   ```powershell
   $env:DZIRENT_SMOKE_URL = "https://demo.dzirent.com"
   pnpm smoke:web
   ```

---

## 3. API Rollback Procedure (Render)

1. In Render Dashboard -> Web Service -> **Deploys**.
2. Identify the last healthy build SHA.
3. Select **Rollback to this deploy**.
4. Monitor startup logs and verify readiness probe (`/api/v1/health/live`) passes.
5. Execute API smoke contract tests:
   ```powershell
   pnpm exec playwright test tests/contracts/api-smoke.spec.ts --config tests/contracts/playwright.config.ts
   ```

---

## 4. Database Schema Compatibility and Recovery Guidelines

> [!CAUTION]
> A code rollback does NOT automatically reverse a database schema migration. Premature schema downgrades can destroy data created by active sessions.

### 4.1 Schema Evolution Principles
- **Expand / Contract Pattern:**
  - **Step 1 (Expand):** Add new columns/tables with nullable or default values. Existing code continues to operate unaffected.
  - **Step 2 (Migrate):** Deploy new code reading and writing the new structure.
  - **Step 3 (Contract):** Only after all clients are updated and stable, deprecate and remove old columns in a subsequent release.
- **Never Drop Columns in Hot Fixes:** Avoid destructive drops or non-nullable column additions without defaults.

### 4.2 Disaster Recovery Rehearsal (Neon Point-in-Time Recovery)
1. In the Neon Console, navigate to the affected branch/database.
2. Select **Restore to point in time** prior to the corrupted migration or event.
3. Create a disposable recovery branch from the restore snapshot.
4. Verify database consistency:
   - Check row counts for `users`, `products`, `categories`, and `product_unavailability`.
   - Confirm foreign key integrity and constraints.
5. Update application connection strings to point to the restored branch.
6. Record incident details, recovery timestamp, and affected records.

---

## 5. Post-Incident Review Protocol

1. Preserve application logs and request IDs associated with the failure.
2. Open a GitHub Issue documenting:
   - Defect classification (P0/P1/P2)
   - Exact commit SHA and deployment URL
   - Steps to reproduce
   - Expected vs actual behavior
   - Root cause analysis
3. Assign bug resolution to the responsible owner (`apps/web` -> Codex; `services/api` -> Claude Code).
4. Update `docs/qa/` with incident summary and updated acceptance tests preventing regression.

