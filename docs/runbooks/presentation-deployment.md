# Runbook: Phase 1A Presentation Deployment

**Target System:** Vercel (Web Presentation Prototype)  
**Target Domain:** `demo.dzirent.com` / Vercel preview URL  
**Milestone:** Phase 1A Presentation Web Prototype  
**Author:** Antigravity (QA Lane)  
**Authority:** `Dzirent_Engineering_Brief_and_AI_Prompts.md` §14  

---

## 1. Prerequisites and Safety Boundaries

1. **Explicit Mode:** The presentation prototype MUST run in `demo` mode (`NEXT_PUBLIC_DZIRENT_MODE=demo`).
2. **No Backend / Database Dependency:** Phase 1A uses MSW and deterministic local fixtures. No live database or backend credentials may be supplied or embedded in client bundles.
3. **No Financial Integration:** All displayed prices, bands, and summary amounts are illustrative display data. No real payment, order processing, or financial actions are authorized.
4. **No Live Credentials:** Demo authentication accepts only sample identities. Never persist live tokens or passwords in browser storage.
5. **Git Deployment Switch:** Automatic Git deployments are disabled by default in `vercel.json` (`git.deploymentEnabled=false`) to honor explicit release control. Deployments must be invoked deliberately.

---

## 2. Pre-Deployment Verification Checklist

Before deploying, run all local verification gates on the tagged release commit:

```powershell
# 1. Enforce pinned toolchain
$env:PATH = "$PWD\.tools\node-v22.23.3-win-x64;$PWD\.tools\bootstrap\Scripts;$env:PATH"

# 2. Verify static checks, types, contracts, and fixtures
pnpm check

# 3. Verify production build
pnpm build

# 4. Run independent contract tests
pnpm exec playwright test --config tests/contracts/playwright.config.ts

# 5. Run multi-browser acceptance suite
pnpm exec playwright test --config tests/e2e/playwright.config.ts
```

All commands must exit with code 0 before initiating deployment.

---

## 3. Vercel Deployment Procedure

### Step 3.1: Project Configuration
- **Framework Preset:** Next.js
- **Root Directory:** `apps/web`
- **Build Command:** `cd ../.. && pnpm --filter @dzirent/web build`
- **Install Command:** `pnpm install --frozen-lockfile`
- **Node.js Version:** `22.x`

### Step 3.2: Environment Variables
Configure the following in the Vercel Project Settings for Preview and Production environments:
- `NEXT_PUBLIC_DZIRENT_MODE`: `demo`
- `NEXT_TELEMETRY_DISABLED`: `1`

*Do NOT define `DATABASE_URL`, Clerk secret keys, or AWS secrets in the Vercel project.*

### Step 3.3: Deployment Execution
Deploy via Vercel CLI or authorized GitHub preview workflow:

```powershell
# Deploy preview build
vercel deploy --prebuilt
```

Capture the generated preview URL (e.g. `https://dzirent-preview-[hash].vercel.app`).

---

## 4. Post-Deployment Verification

Execute the independent smoke suite against the live deployment URL:

```powershell
$env:DZIRENT_SMOKE_URL = "https://dzirent-preview-[hash].vercel.app"
pnpm smoke:web
pnpm exec playwright test tests/e2e/phase1a-acceptance.spec.ts --config tests/e2e/playwright.config.ts
```

Verify:
- HTTP 200 on `/`, `/fixtures/garment-placeholder.svg`.
- Deep links refresh cleanly without routing errors (e.g., refreshing `/products/sample-garment-slug`).
- Shared filtered URLs preserve query parameters and state.
- 0 unhandled console errors and 0 failed essential network requests.
- Visible "DEMO / Simulation" labeling on all mock components.

---

## 5. Custom Domain Configuration (`demo.dzirent.com`)

1. In Vercel Project Settings -> **Domains**, add `demo.dzirent.com`.
2. Copy the exact DNS records provided by Vercel (CNAME `cname.vercel-dns.com`).
3. Log in to Squarespace DNS settings for `dzirent.com`.
4. Add the CNAME record for host `demo`:
   - Type: `CNAME`
   - Host: `demo`
   - Data: `cname.vercel-dns.com`
   - TTL: Default (3600)
5. **Preserve All Existing Records:** Do NOT modify MX, SPF, DKIM, or unrelated DNS entries.
6. Await SSL certificate issuance and verify `https://demo.dzirent.com`.

---

## 6. Release Tagging

Tag the verified commit SHA:
```powershell
git tag -a demo-v0.1.0 -m "Release: Phase 1A presentation prototype verified"
git push origin demo-v0.1.0
```
Record the deployment URL, commit SHA, and test report in `docs/qa/`.

