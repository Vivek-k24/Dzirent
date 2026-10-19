# Rental refresh: parallel workflow handoff

Two external coding sessions: Codex and Claude Code. Antigravity is deferred until both candidates
are ready. These are assignments, not a claim that either external session has been started.

Source main: `a63acc0e9d55d79a918775a57d09bcec63cd3726`. Start both from the coordination PR's
merged main SHA supplied in the launch message. Fetch once, record that full SHA, then work on the
separate branches below. Do not reset dirty work or reuse old Phase 1 heads as the baseline.

| Owner | Branch / existing isolated checkout | Runtime | Workflow |
| --- | --- | --- | --- |
| Codex | `codex/rental-collections` / `H:\DziRent\worktrees\codex-web` | web 3000 | Rental catalog shell, sidebar, theme, and card-to-PDP reliability |
| Claude Code | `claude/studio-workflow` / `H:\DziRent\worktrees\claude-api` | web 3200, API 8200; own disposable PostgreSQL `*_test` | Manage your Studio -> public Studio -> rotating owned outfit previews -> PDP |

Reuse a clean assigned checkout by creating the new branch from the agreed SHA. If the old branch has
uncommitted/user work, preserve it and create a new sibling worktree; report the actual path. Inspect
ancestor AGENTS.md before editing. Do not create nested repositories inside another checkout.

## Shared presentation contract

- Header navigation is two real links: All collections `/` (default) and Explore Studios `/studios`.
- No hero/offer/editorial slides. Keep search, bag, account/lender access, sort and useful rental filters.
- Desktop category sidebar starts open and can collapse. Parent chevrons expose subcategories;
  use genuine buttons/checkboxes and URL-backed selection. Retain the current API's repeated category
  and single subcategory semantics; do not introduce unsupported multi-leaf controls.
- On small screens use an accessible filter drawer/panel without covering the catalog on first load.
- Newest first is the initial All collections sort; send `sort=newest` explicitly. Keep the current sort
  choices. Do not require an API-default change or alter existing sort meanings.
- Page background `#f1f1ee`; use `#ecece7`, `#eeeeeb`, `#f4f4f1`, `#f8f5ef` for surfaces and
  `#dfdcd7`, `#c6c4bf`, `#adaba7` for borders/support. Use dark readable text and visible focus rings.
- Always show exact top banner: `DEMO ONLY. NOT A REAL BUSINESS.` on every route, regardless of API mode.
  Show `Only in Texas` near the catalog introduction. No city/metro selection or city-based Studios.
- Studios are lender profiles, not brands or a random grouping of products. Each Studio card contains
  its name, actual published count, link to the Studio, and a rotating preview of its own published
  products. Outfit preview content is portrait image + title + listed size; no price/rating/retail overlays.
  Do not duplicate a carousel item to fake inventory. One existing seeded Studio is an acceptable initial
  directory: preserve all 40 original product IDs, ownership and licensed photographs.
- Full Studio page shows public profile and that owner's published garments. Public data excludes
  addresses, email, auth subjects, private drafts and inactive owners. No invented followers, response
  rates, testimonials, verification badges or working messaging/follow features.
- Carousel visits every published outfit, including later API pages. Pause/resume + manual controls,
  pause on hover/focus, reduced-motion fallback, reserved 3:4 layout and meaningful alt text.
- Both lanes retain explicit demo/connected separation. No new auth bypass, live credential entry,
  cloud provisioning, payment, fabricated delivery estimate or claim of hosted database persistence.

## Exclusive file ownership

**Codex:** `apps/web/src/components/{shell,navigation,catalog,filters,product-card,product-detail,
location-dialog,listing-form}.tsx`, `apps/web/src/app/{page.tsx,globals.css}`, `apps/web/src/proxy.ts`,
`apps/web/src/lib/{store,use-catalog}.ts`, `packages/client/src/{catalog-state,types}.ts`,
`packages/design-tokens/**`, `tests/workflows/collections.spec.ts`, `docs/agents/codex.md`.
No Studio imports or route stubs are needed: the agreed header link can target `/studios` before
Claude's branch is integrated. Declare that pending cross-lane route in the individual preview report.

**Claude:** new `apps/web/src/app/studios/**`, new `apps/web/src/app/lender/studio/**`, new
`apps/web/src/components/studios/**` including scoped CSS modules, existing
`apps/web/src/components/lender-dashboard.tsx` only to add the Studio-settings entry, existing
`apps/web/src/mocks/handlers.ts` and new `apps/web/src/mocks/studios/**`, API source/schema/migrations,
`contracts/**`, `fixtures/catalog/**`, generated `packages/client/src/generated/api.ts` through the
generator only, `services/api/tests/workflows/test_studios.py`, `tests/workflows/studios.spec.ts`,
`docs/agents/claude.md`. Generated canonical fixture changes must preserve existing catalog fields/IDs.

**Integrator:** `.github/**`, root manifests/lockfiles/scripts, this folder, architecture/ownership,
`docs/PROJECT_STATUS.md`, `tests/workflows/{playwright.config.ts,storefront-smoke.spec.ts}` and
`services/api/tests/workflows/README.md`. Request dependency/root/CI changes rather than editing them.

Do not edit outside your set without a recorded handoff. If PDP diagnosis needs a Claude-owned mock
handler fix, report the exact root cause and ask that owner to apply the small change. Neither lane
edits another lane's log. Use issue/PR status and your own log rather than a shared lockbook file.

## Verification and delivery budget

No unit tests. Do not run `pnpm test:web`, unfiltered pytest, `pnpm smoke:web`, or the legacy full
`tests/e2e` matrix. `pnpm check` is now static/media/contract/fixture validation, not a unit-test command.

- Once per candidate: frozen install if needed, relevant static checks, one build, one bounded workflow
  test invocation. Reuse green results for an unchanged SHA. After a failure, fix and rerun only that
  affected check; no repeated exhaustive sweeps or screenshot dumps.
- Codex adds at most two E2E scenarios in `collections.spec.ts`: sidebar/URL/sort/history/mobile and
  every published card's photo/title -> PDP/direct reload (iterate all 40 within the scenario).
- Claude adds at most four real PostgreSQL/API integration cases and two E2E scenarios in its owned
  files: profile persistence/ownership, public visibility/counts/pagination, and Studio editing/directory/
  carousel/PDP navigation. Test zero/one/many products without inventing production inventory.
- Routine CI: existing storefront smoke + the two owned files, Chromium 1440/390 only, no retries,
  global browser execution budget 3 minutes. API tests select two baseline persistence/ownership cases
  plus the Studio workflow directory. No entire 258-case API run on every push.
- Keep static contract/fixture alignment and frozen dependency/audit checks. No new test framework.
- Push one coherent workflow branch, open PR to main, record SHA/checks/preview URL/blockers in your
  log and issue. Never push main, force-push, auto-promote production, or merge the other lane.
- Both branch previews can be published deliberately using existing authorized Vercel access. Each
  must retain its unique URL and exact SHA. Missing cloud deployment access does not justify making
  new services, changing deployment protection or calling an unbuilt branch deployed.
- Claude distinguishes browser demo E2E from real PostgreSQL API integration. Missing hosted auth/API
  is an explicit boundary; do not call separate tests proof of a connected browser-to-DB journey.

Antigravity receives both final PR/head SHAs later from the user. It will align the old hero/category
assertions and perform independent combined QA; do not launch or preempt that work now.

Assignments: [Codex issue #15](https://github.com/Vivek-k24/Dzirent/issues/15) and [Claude Code issue #16](https://github.com/Vivek-k24/Dzirent/issues/16).

Agent launch documents: [Codex](codex.md), [Claude Code](claude-code.md).
