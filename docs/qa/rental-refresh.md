# Rental Refresh Integration Review & QA Report

**Report Version:** 1.0.0  
**Date:** 2026-10-19 (America/Chicago)  
**Author:** Antigravity (Independent Verification & Architectural Alignment Lane)  
**Task / Scope:** Independent Integration Review of PR #17, PR #18, and PR #19  
**Branch:** `antigravity/rental-refresh-qa`  
**Workspace:** `H:\DziRent\worktrees\antigravity-qa`  

---

## 1. Candidate Source Commits & Combined Integration Head

| PR / Candidate | Component | Head Commit SHA | Status |
|---|---|---|---|
| **PR #17** | Parallel Workflow Foundation | `ffd4b96e4a24a741f0597faf514533f0c20bd33b` | Verified match with source head |
| **PR #18** | Rental Collections & Sidebar | `5cde0b8947fd82d6565d028e9f802b3ea767389e` | Verified match with source head |
| **PR #19** | Lender Studios Workflow & API | `e9c265809afc14a0e3ab812f50bb70d48541cefb` | Verified match with source head |

- **Initial Merge Combined SHA:** `cea8f35f5bc99d707fca8f7d6a29df3b538fb737` (merged cleanly with 0 merge conflicts)
- **QA Integration Tested Candidate SHA:** `1e588e449ac527418529acd08213b29f474e214a` (incorporating test locator and contract smoke alignment)

---

## 2. Executive Summary & Merge Verdict

> [!IMPORTANT]
> **Integration Verdict: READY TO MERGE.**  
> Dzirent PRs #17, #18, and #19 integrate cleanly without functional regressions, architectural drift, or broken workflows. All 4 target workflows have been independently verified against production builds and disposable PostgreSQL databases.
> 
> **Recommended Integration Sequence:**
> 1. Merge **PR #17** (`codex/parallel-workflow-foundation` @ `ffd4b96`)
> 2. Merge **PR #18** (`codex/rental-collections` @ `5cde0b8`)
> 3. Merge **PR #19** (`claude/studio-workflow` @ `e9c2658`)
> 4. Merge **QA Integration PR** (`antigravity/rental-refresh-qa`) containing the test alignment fixes.

---

## 3. Workflow Verification Evidence

### Workflow 1: Collections Catalog, Sidebar, Filters, Sort, and All-40-PDP Reliability
- **Header & Navigation:** Header displays exactly two primary links: `All collections` (`/`) and `Explore Studios` (`/studios`).
- **Sidebar & Mobile Drawer:** Collapsible category tree with 8 parent collections and 5 subcategories per collection (40 leaves total); multi-category selection supported; subcategory drilldown functions via URL search parameters; small viewport renders accessible mobile drawer with focus trap and Esc dismissal.
- **Sorting & View Toggle:** Initial sort is explicit `newest` (`sort=newest`); switching to `featured` or `price_asc` physically reorders product cards in the DOM; grid/list toggle modifies `.product-grid` CSS display properties between `grid` and `flex`.
- **Statewide Delivery ZIP:** ZIP input dialog validates 5-digit Texas zip code (`78701`), confirms delivery estimate is unavailable, and does not filter statewide inventory or leak city filters.
- **PDP & Encoded Link Handling:** All 40 canonical published garments iterate photo/title links to canonical PDP (`/products/[slug]`), reload with 200 status, display 3:4 portrait photo, size, and disclaimers. Encoded shared links (`/products/%64...`) decode correctly without false 404s; genuine unknown slugs return HTTP 404 with "Outfit not found" heading.

### Workflow 2: Lender Studio Management, Settings, Public Directory, and Carousels
- **Studio Settings (`/lender/studio`):** Accessible via "Studio settings" link on lender dashboard; persists display name, bio, and visibility to `PUT /api/v1/me/studio` with optimistic version tracking (incrementing version from 1 → 2 → 3); server-assigned stable handle `sample-lender` survives renames.
- **Public Directory (`/studios`):** Renders public Studios with display name, Texas location, actual published outfit count (`40 published outfits`), and rotating carousel. Empty-product Studios, private Studios, and inactive accounts are cleanly excluded from the directory.
- **Carousel Functionality:** Native React/CSS carousel visits all 40 published garments across all four 12-item API pages; desktop displays 3 outfits per window, mobile displays 2; previews strictly contain portrait photo, title, and listed size (no price, retail, or rating overlays); clicking preview or wardrobe item navigates to canonical PDP.
- **Reduced Motion & Controls:** Previous/Next buttons function correctly; auto-rotation pauses on hover and keyboard focus, and is completely disabled when `prefers-reduced-motion: reduce` is configured.
- **Public Profile (`/studios/[handle]`):** Shows public owner profile and paginated wardrobe (loads initial 24, "Load more outfits" button loads remaining 16 outfits to reach 40). Missing or private studio handles return 200 with "Studio not available" notice.

### Workflow 3: Cross-Lane Visual & Interaction Integration
- **Banner Consistency:** Exact `DEMO ONLY. NOT A REAL BUSINESS.` banner appears across all views (`/`, `/studios`, `/studios/[handle]`, `/lender/studio`, PDP, and 404 pages).
- **Texas Copy:** Catalog introduction and Studio cards display `Only in Texas` / `Texas`. City and metro selection UI is completely removed from presentation surfaces.
- **Theme & Color Palette:** Background `#f1f1ee` verified on `body`; surface colors (`#ecece7`, `#eeeeeb`, `#f4f4f1`, `#f8f5ef`) and borders (`#dfdcd7`, `#c6c4bf`) render consistently between Codex collection components and Claude Studio modules.
- **No Page Horizontal Overflow:** `noOverflow` assertion verified on desktop and mobile viewports (`document.documentElement.scrollWidth <= window.innerWidth + 1`).

### Workflow 4: API & Database Behavior (Real PostgreSQL)
- **Persistence & Stable Handle:** Verified against PostgreSQL `dzirent_qa_test`: `PUT /api/v1/me/studio` creates and updates Studio records with server-assigned handle, increments version, and persists committed values observed by independent reader clients and direct SQL queries.
- **Optimistic Concurrency (Version Conflicts):** Stale `expected_version` returns HTTP 409 `stale_version` with `details: [{field: "expected_version", current_version}]`.
- **Identity & Owner Isolation:** Derived exclusively from verified principal token (`mock:other-lender`). Attempts to forge caller-supplied `lender_profile_id`, `id`, or `user_id` are rejected with HTTP 422. Non-lenders receive HTTP 403 `lender_required`; unauthenticated requests receive HTTP 401 `unauthenticated`.
- **Cross-Owner Access Denial:** Cross-owner item access returns non-enumerating HTTP 404.
- **Public Visibility & Filtering:** Drafts and archived listings never leak into public Studio counts or product lists; published-but-unavailable outfits are counted and listed.
- **Pagination:** `GET /api/v1/studios/{handle}/products` correctly paginates all 40 garments across pages with stable newest-first sort order. Page boundary overflow returns empty list; invalid pagination arguments return HTTP 422 `validation_error`.
- **Contract & Validator:** Contract `0.1.0-candidate.2` verified. The approved `validate_foundation.py` validator update includes `put` operations, successfully validating `PUT /me/studio`.

---

## 4. Test Execution Records

### 4.1 Static Analysis, Contracts, and Fixtures (`pnpm check`)
- **Command:** `$env:PATH = "$PWD\.tools\node-v22.23.3-win-x64;$PWD\.tools\bootstrap\Scripts;$env:PATH"; pnpm check`
- **Results:** **PASS (Exit 0)**
  - ESLint: clean across `apps/web`, `packages`, `scripts`
  - TypeScript: 0 type errors in `packages/client` and `apps/web` (with generated Next.js route types)
  - `media:check`: 40 unique local JPEGs, canonical IDs, licenses, checksums, and 2 OFL fonts verified
  - Ruff: clean formatting (36 files) and linting
  - Mypy: Success (0 issues across 20 source files in strict mode)
  - `contracts:check`: OpenAPI matches FastAPI declarations; TypeScript client generated without drift
  - `fixtures:check`: 8 roots, 40 leaves, 40 garments; 26 operations with schema-valid examples verified

### 4.2 Production Application Build (`pnpm build`)
- **Command:** `$env:PATH = "$PWD\.tools\node-v22.23.3-win-x64;$PWD\.tools\bootstrap\Scripts;$env:PATH"; pnpm build`
- **Results:** **PASS (Exit 0)**
  - Turbopack optimized build compiled in 4.7s
  - All 11 static and dynamic routes generated successfully: `/`, `/_not-found`, `/auth/[role]/[action]`, `/cart`, `/checkout/preview`, `/credits`, `/icon.svg`, `/lender/dashboard`, `/lender/signup`, `/lender/studio`, `/products/[slug]`, `/studios`, `/studios/[handle]`

### 4.3 Chromium Desktop & Mobile Workflow Suite
- **Command:** `$env:PATH = "$PWD\.tools\node-v22.23.3-win-x64;$PWD\.tools\bootstrap\Scripts;$env:PATH"; pnpm exec playwright test --config tests/workflows/playwright.config.ts`
- **Execution Time:** **1.4 minutes** (well within the 3-minute budget; 0 retries)
- **Results:** **10 passed / 0 failed / 0 skipped**
  1. `[desktop] storefront-smoke.spec.ts`: catalog photo opens PDP, preserves deep link, exposes rental choices (PASS)
  2. `[desktop] collections.spec.ts`: collection tree, rental filters, statewide ZIP, newest order, history (PASS)
  3. `[desktop] studios.spec.ts`: lender edits Studio, public directory and profile reflect changes (PASS)
  4. `[desktop] studios.spec.ts`: Studio preview rotates through every published outfit across API pages and opens PDP (PASS)
  5. `[desktop] collections.spec.ts`: all 40 published photo/title links resolve to PDP, reload, encoded shared link (PASS)
  6. `[mobile] collections.spec.ts`: collection tree, rental filters, statewide ZIP, newest order, history (PASS)
  7. `[mobile] collections.spec.ts`: all 40 published photo/title links resolve to PDP, reload, encoded shared link (PASS)
  8. `[mobile] storefront-smoke.spec.ts`: catalog photo opens PDP, preserves deep link, exposes rental choices (PASS)
  9. `[mobile] studios.spec.ts`: lender edits Studio, public directory and profile reflect changes (PASS)
  10. `[mobile] studios.spec.ts`: Studio preview rotates through every published outfit across API pages and opens PDP (PASS)

### 4.4 PostgreSQL Real Database Integration
- **Command:** `$env:DZIRENT_TEST_DATABASE_URL = "postgresql+psycopg://dzirent:local-disposable-only@127.0.0.1:5432/dzirent_qa_test"; $env:DZIRENT_REQUIRE_DB_TESTS = "1"; uv run --directory services/api --frozen --python 3.12.15 pytest -q tests/test_listings.py::test_create_persists_and_server_assigns_identity tests/test_listings.py::test_cross_owner_access_is_non_enumerating_404 tests/workflows`
- **Execution Time:** **3.70s**
- **Results:** **6 passed / 0 failed / 0 skipped**
  1. `test_listings.py::test_create_persists_and_server_assigns_identity`: (PASS)
  2. `test_listings.py::test_cross_owner_access_is_non_enumerating_404`: (PASS)
  3. `test_studios.py::test_owner_settings_persist_with_stable_handle_and_versioning`: (PASS)
  4. `test_studios.py::test_studio_ownership_comes_from_the_verified_identity`: (PASS)
  5. `test_studios.py::test_public_directory_hides_private_empty_and_inactive_studios`: (PASS)
  6. `test_studios.py::test_studio_products_paginate_every_published_outfit`: (PASS)

### 4.5 Independent Contract Smoke Check
- **Command:** `pnpm exec playwright test tests/contracts/api-smoke.spec.ts --config tests/contracts/playwright.config.ts`
- **Execution Time:** **4.0s**
- **Results:** **5 passed / 0 failed / 0 skipped** (Contract version `0.1.0-candidate.2` verified, live 200, fail-closed ready 503, catalog routing, 404 handling).

---

## 5. Scope Alignment & Checks Not Run

Per the current two-workflow instructions (`docs/parallel-rental-refresh/README.md` and `foundation.yml`), the following legacy/unit checks were intentionally not run:
1. **Full Legacy Browser Matrix (`tests/e2e`):** The legacy multi-browser matrix (WebKit, Firefox, legacy responsive widths) was omitted to observe the strict 3-minute execution budget and avoid obsolete foundation shell assertions.
2. **Full API Test Suite (258 cases):** Omitted in favor of the selected PostgreSQL workflow integration cases specified by `foundation.yml`.
3. **Unit Tests (`pnpm test:web` / unfiltered pytest):** Excluded per repository instructions.

---

## 6. Discovered Issues & Resolutions

1. **Integration Strict-Mode Locator Ambiguity (`tests/workflows/studios.spec.ts:50`):**
   - **Root Cause:** When Claude authored `studios.spec.ts` in isolation, the only `Explore Studios` link on `/lender/studio` was in `#main-content`. When Codex's header navigation (`apps/web/src/components/navigation.tsx`) was merged, a second `Explore Studios` link appeared in the header.
   - **Fix:** Scoped locator to `page.locator("#main-content").getByRole("link", { name: "Explore Studios" })`.
   - **Verification:** Verified passing on desktop and mobile in 10.7s.

2. **Contract Smoke Version Mismatch (`tests/contracts/api-smoke.spec.ts:12`):**
   - **Root Cause:** Expected `0.1.0-candidate.1` from earlier milestone instead of the approved additive `0.1.0-candidate.2`.
   - **Fix:** Updated expectation to `0.1.0-candidate.2`.
   - **Verification:** Verified passing in 4.0s.

---

## 7. Remaining Defects and Owner Routing

- **Blocking Defects:** None.
- **Major Defects:** None.
- **Minor Defects:** None.
- **Architectural Boundary Adherence:**
  - Next.js acts purely as presentation with zero duplicate database models or business authorization logic.
  - All Studio data is retrieved via canonical `/api/v1` routes.
  - MSW browser simulation remains cleanly decoupled from real PostgreSQL database testing.
