# Codex launch: rental collection discovery

Work in `H:\DziRent\worktrees\codex-web` on new branch `codex/rental-collections`, from the exact
coordination baseline supplied in the launch message. Inspect Git status first. Preserve dirty work;
use a new sibling worktree if necessary, never reset or replace another branch. Read ancestor/repo
AGENTS.md, the engineering brief, ADR 0004 and this folder's README. This new user instruction
supersedes the original hero/category-bar/white-background/unit-test requirements.

Complete this workflow end to end: browse All collections -> sidebar selection/search/sort/view ->
click a product photograph -> correct detail page -> refresh/share that link. You own the exclusive
Codex file set in README. Claude simultaneously owns Studios across frontend/API/database; do not edit
its routes, components, mock handlers, migrations, contract files or generated client types.

Implement:

1. Remove homepage marketing/editorial/offer slides. Replace horizontal category bars/mega-menus with
   two navigation links: All collections `/` and Explore Studios `/studios`. Use normal route links
   with an active indicator. Keep the sticky brand/search/account/bag/lender controls usable.
2. Put all eight categories/five subcategories in a left filter tree. Sidebar is open by default on
   desktop, can collapse and reopen; parent chevrons expand children with aria-expanded. Selection
   must really filter and update URL; Back/Forward/reload must restore it. Preserve the existing
   repeated-category and single-subcategory API behavior: use real buttons for single leaf selection,
   never checkboxes pretending that multiple unsupported leaves are selected. Mobile gets a usable,
   keyboard-accessible panel/drawer with no page overflow. Don't duplicate a category mega-menu/pill bar.
3. Preserve date, size, color, brand and other working filters, removable chips/clear and grid/list.
   Newest first is the initial catalog order; send `sort=newest` explicitly, preserving all sort choices
   and existing API meanings. Keep filters useful for renting and avoid retail promotional clutter.
4. Apply the shared neutral palette: page #f1f1ee, approved supporting surfaces/borders in README,
   dark readable text, accessible contrasts and visible focus rings. Existing local fonts/photos remain.
   Product images stay 3:4. Do not add a new component/carousel/theme dependency.
5. Always show exact top text `DEMO ONLY. NOT A REAL BUSINESS.` on all routes in either runtime mode.
   Place `Only in Texas` near the catalog introduction. Remove city/metro-facing copy/choices from
   your changed shell, product/card and listing-form flows. Header location becomes delivery ZIP,
   not wardrobe city. Do not make ZIP filter the statewide inventory or invent transit times/coverage
   from the tiny old demo map. Until the real service exists, report estimate unavailable. Internal
   legacy fields can be retained for wire compatibility, but document that full address migration is pending.
6. Reproduce the reported seeded-photo -> Outfit not found failures and fix the cause in owned routing/
   PDP/client paths. Check all published seed links and reloads, not only the first/available garment.
   Unavailable published outfits still have readable details. Genuine missing/archived records can 404.
   If the root cause is Claude-owned mock/API code, publish the precise failing URL/cause in the issue
   and coordinate the smallest explicit handoff instead of editing that file concurrently.

Do not implement Azure infrastructure, a new identity provider, real shipping/payment, native apps,
or a new lender/renter identity model in this task. Keep the current demo clearly labeled. Real auth
remains a shared module for all workflows in its later service-connected milestone.

Verification budget: no unit tests, no full legacy matrix. Run `pnpm check` once (now static/media/
contract/fixture checks), one production build, and one bounded E2E invocation. Add at most two E2E
scenarios in `tests/workflows/collections.spec.ts`: filter-tree/URL/sort/history and every-card PDP/deep
link. Run `pnpm exec playwright test --config tests/workflows/playwright.config.ts` (Chromium desktop
and mobile only, zero retries, three-minute browser budget). If a failure needs a fix, rerun only that
scenario/check. Reuse existing green results for unchanged code. No coverage targets or large new suites.

Push the branch and open one coherent PR to main. Run the existing CI pipeline and, with existing
authorized Vercel access, publish a unique explicit demo preview for the exact pushed SHA. Never change
production aliases/protection/DNS, relax Git deployment guards, or auto-merge. Claude's `/studios` route
will arrive in its own PR; disclose that pending route in your individual preview. No placeholder Studio
page or duplicate Studio implementation. If preview access is missing, report the concrete blocker.

Maintain only `docs/agents/codex.md` and your issue/PR status: base SHA, pushed SHA, owned files,
actual checks, preview URL, blockers, handoff needed, ready-for-AG status. Don't edit shared ownership/
root/CI files; request the integrator. Stop when the candidate is reviewable. The user launches AG later.
