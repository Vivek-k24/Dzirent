# Antigravity handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

## P1A part 2 - 2026-11-06 - website legal pages

- What was done:
  - Centralized legal configuration (`apps/web/src/content/legal/config.ts`):
    - Encapsulates every fill-in key from `pranalika/legal-placeholders.md` (company name, registered address, DMCA agent details, dispute resolution, governing law, taxes, response times, versions).
    - Sets `legalDraft: true`, `TERMS_VERSION: "1.0.0"`, and `PRIVACY_VERSION: "1.0.0"`.
    - Every missing placeholder renders in the UI as a highlighted `[To be completed: <label>]` badge with a tooltip, avoiding invented legal claims.
  - Reusable layout & components (`apps/web/src/components/legal-layout.tsx`):
    - `LegalDraftBanner`: Renders `"Draft. These terms are being finalized."` across all legal pages while `legalDraft` is active.
    - Breadcrumbs: `Home > Legal & Help > <Page Title>`.
    - Jump-link Table of Contents sticky sidebar on desktop, clean top navigation on mobile.
    - Responsive 2-column legal grid, readable typography, dark/light theme support.
  - Seven public legal and help pages created:
    1. `/privacy` (written from `pranalika/compliance.md` sections 1–6): Data inventory, 2-decimal location rounding to ~1 km, photo EXIF stripping and 768-vector image fingerprints, private body measurements, first-party cookie table, outside services disclosure, no ads/tracking/selling, retention, cascade deletion on account removal, display name fallback, user privacy rights, 18+ policy, RLS database security.
    2. `/terms`: Marketplace discovery role, age eligibility (18+), listing rules, content licensing, zero tolerance abuse policy, in-person meetings, deposits for high-value pieces, lender tax obligations, copyright, disclaimers, liability cap, governing law/venue/disputes placeholders, termination, and contact.
    3. `/community-guidelines`: Allowed categories (Career, Occasion, Cultural, Everyday Special, Outerwear, Approved Accessories), prohibited items (Everyday basics, intimates, footwear, headwear, smartwatches, fakes, soiled garments), photo standards (clean light background, hanger/mannequin, no faces, no watermarks), photo scanning workflow (Marqo-FashionSigLIP, outcomes: Allowed, Not allowed, Under review), in-person etiquette, reporting & enforcement.
    4. `/copyright`: DMCA takedown notice requirements (1–6), designated DMCA agent block with placeholders, counter-notice procedure and 10–14 business day statutory waiting period, repeat infringer policy.
    5. `/safety`: In-person meetup tips (public, daylight, tell a friend), joint garment inspection checklist, keeping communication in-app, deposit recommendations for high-value items, stain/damage direct settlement, reporting & blocking, emergency 911 guidance.
    6. `/delete-account`: Public Google Play requirement, step-by-step app & web deletion instructions, support contact for locked accounts, immediate deletion vs retained records (signed declarations, 30-day logs), active rental prerequisite, and shared chat cascade warning.
    7. `/support`: Contact directory (`support@`, `privacy@`, `security@`, `copyright@`), response time placeholder, quick links to all legal pages, FAQ, accessibility inquiry contact.
  - Footer on every page updated in `apps/web/src/components/shell.tsx`:
    - Exactly 8 links: Privacy, Terms, Community guidelines, Copyright, Safety, Delete account, Support, About.
  - Sitemap created at `apps/web/src/app/sitemap.ts`:
    - Covers `/`, `/about`, `/privacy`, `/terms`, `/community-guidelines`, `/copyright`, `/safety`, `/delete-account`, `/support`, `/studios`.
- Files changed:
  - `apps/web/src/content/legal/config.ts`
  - `apps/web/src/components/legal-layout.tsx`
  - `apps/web/src/app/privacy/page.tsx`
  - `apps/web/src/app/terms/page.tsx`
  - `apps/web/src/app/community-guidelines/page.tsx`
  - `apps/web/src/app/copyright/page.tsx`
  - `apps/web/src/app/safety/page.tsx`
  - `apps/web/src/app/delete-account/page.tsx`
  - `apps/web/src/app/support/page.tsx`
  - `apps/web/src/app/sitemap.ts`
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/shell.tsx`
  - `pranalika/BOARD.md`
  - `pranalika/handoffs/antigravity.md`
- Commands run & verified:
  - `npm run lint` (ESLint 9 / next lint): passed clean (0 errors, 0 warnings).
  - `npm run build` (Next.js 16.4.3 Turbopack): passed clean, all 21 static/dynamic pages compiled.
  - `npx next start -p 3004`: verified all 7 legal routes returned HTTP 200, draft banner rendered, TOC rendered, all footer links rendered.
  - Verified `sitemap.xml` returned HTTP 200 with all 8 public footer routes.
- Placeholders still open:
  - The business legal details in `apps/web/src/content/legal/config.ts` (and `pranalika/legal-placeholders.md`) to be filled by Owner/Attorney: `COMPANY_LEGAL_NAME`, `COMPANY_ENTITY_TYPE`, `COMPANY_STATE_OF_FORMATION`, `REGISTERED_ADDRESS`, `GOVERNING_LAW_STATE`, `VENUE`, `DISPUTE_PROCESS`, `LIABILITY_CAP`, `DMCA_AGENT_*`, `LENDER_TAX_STATEMENT`, `SALES_TAX_STATEMENT`, etc. Once provided, filling them in `config.ts` automatically updates all legal pages without changing page copy.
- Open issues:
  - None.
- Requests:
  - None.

## Photo fix - 2026-11-04

- Which photos were broken:
  - Discovered 4 sample listings with 149-byte placeholder files (< 10 KB) in the Supabase Storage bucket `listing-photos`:
    1. "Satin Backless Maxi Dress" (`32c885a9-a286-4fc4-a77e-2bae9fa0141b`): 149 bytes (`ae3b22ace731bd21.jpg`)
    2. "Modern Qipao Midi Dress" (`80a55094-9699-4b7f-a55f-f3094c3dc526`): 149 bytes (`cb2a8a3733907033.jpg`)
    3. "Embroidered Silk Lehenga Set" (`a7417052-55ff-4cb8-b49d-054a69a6e719`): 149 bytes (`6877334392c02f0d.jpg`)
    4. "Vintage Denim Jumpsuit" (`ed999629-5802-4a8b-abb5-67d35710f02c`): 149 bytes (`728aedb86c077494.jpg`)
  - All other sample listings on `dzirent-server` already had valid photos (> 41 KB).

- What was replaced:
  - Generated original realistic commercial fashion catalog product photos (both front and back views) using the built-in image generator:
    - 3:4 vertical portrait aspect ratio, garments displayed on clean wooden hangers or headless mannequins against plain light studio backgrounds, no people, no faces, no logos, no text, matching each listing's title, style, and color.
  - Compressed all 8 new images to JPEG quality 80 into `supabase/seed/images/<slug>/`:
    - `satin-backless-maxi-dress`: `front.jpg` (56,339 bytes), `back.jpg` (63,646 bytes)
    - `modern-qipao-midi-dress`: `front.jpg` (49,846 bytes), `back.jpg` (54,461 bytes)
    - `embroidered-silk-lehenga-set`: `front.jpg` (151,007 bytes), `back.jpg` (137,475 bytes)
    - `vintage-denim-jumpsuit`: `front.jpg` (106,873 bytes), `back.jpg` (102,356 bytes)
  - Authenticated as Maya Lin (User 2, owner of the 4 listings) and uploaded ONLY the replacement photos through the normal Storage and REST APIs, deleting the old 149-byte files and inserting records for `front` (slot 0) and `back` (slot 1). Left all other working listings untouched.

- What was actually run & verified:
  - Verified local files in `supabase/seed/images`: all files are between 41 KB and 151 KB (all > 10 KB, well under 400 KB limit).
  - Verified guest `rpc/browse_listings`: returns 13 listings; every cover photo fetched with HTTP 200 and content-length > 10 KB.
  - Verified guest `rpc/get_listing`: queried all listings; every photo across all listings fetched with HTTP 200 and content-length > 10 KB.

- Open issues:
  - None.

## Step 2F - 2026-11-03 - My closet in the top bar

- What was done:
  - Desktop top bar:
    - Added "My closet" button (`top-closet-btn`) as the first icon on the right side of the desktop top bar, using the existing `hanger` icon from `components/icon.tsx`.
    - Configured hover label (`title="My closet"`) and accessible name (`aria-label="My closet"`).
    - Wrapped with `GatedActionTrigger` (`action="list"`, `href="/app/closet"`), ensuring unauthenticated guests receive the standard sign-up modal like Inbox and Saved.
    - Added a thin vertical divider (`top-divider`) between "List a piece" and "Inbox", styled with `width: 1px; height: 20px; background: var(--line);` matching the site's border color in both light (`#e6e6e6`) and dark (`#383838`) themes.
    - Established new right-side top bar order: My closet (`hanger`), List a piece (`+`), vertical divider, Inbox (`mail`), Saved (`bookmark`), Account (`user`), Theme switch (`ThemeToggle`).
  - Account menu:
    - Removed "My closet" from both authenticated and guest dropdown views. Retained "Profile & settings" and "Sign out" for authenticated users, and "Sign in / sign up" for guests.
  - Phones & narrow viewports:
    - Preserved phone top-bar row layout without change by hiding `.top-closet-btn` and `.top-divider` on screens <= 760px (`display: none !important`).
    - Verified "My closet" remains in the mobile slide-in drawer (`.modal.drawer`) so it is fully reachable on phones.
  - Onboarding & documentation:
    - Updated onboarding tour selector for the Closet step to include `.top-closet-btn`.
    - Updated `pranalika/BOARD.md` marking Step 2F Done.

- Files changed:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/onboarding.tsx`
  - `apps/web/src/components/shell.tsx`
  - `pranalika/BOARD.md`
  - `pranalika/handoffs/antigravity.md`

- Commands run & verified:
  - `$env:PATH = "H:\DziRent\Dzirent_dev\.tools\node-v22.23.3-win-x64;" + $env:PATH`
  - `npm ci` in `apps/web` (Node 22): passed clean.
  - `npm run lint` in `apps/web`: passed clean (0 errors, 0 warnings).
  - `npm run build` in `apps/web`: passed clean (all static and dynamic routes compiled).
  - Started Next.js production server on port 3003 with `H:\DziRent\secrets\dzirent-server.env` variables.
  - Automated verification script:
    - Verified top-bar icon sequence: My closet -> List a piece -> Divider -> Inbox -> Saved -> Account -> Theme.
    - Verified "My closet" hover title and aria-label.
    - Verified account dropdown does not contain "My closet".
    - Verified mobile drawer contains "My closet".
    - Verified CSS divider styling with `var(--line)` and mobile display:none rules.
    - Verified HTTP 200 response on `/`.

- Open issues:
  - None.

## Step 2E - 2026-11-03 - docked filter panel

- What was done:
  - Desktop docked filter panel (>= 1280px):
    - Added `<aside className={"desktop-docked-panel " + (desktopFilterOpen ? "open" : "closed")} aria-label="Filters">` docked inside `<div className={"site-body" + (desktopFilterOpen ? " filter-open" : "")}>` adjacent to `<main id="main">`.
    - Left panel holds filters only: "All categories" heading, close button, Category, Size, Distance, Min/Max price, Style, Garment, Accessory, "Show pieces" submit, and "Reset" link.
    - Excluded from the panel all top-bar items: Sign in / sign up, Inbox, Saved pieces, List a piece, How Dzirent works, Theme switch, date chip, location picker.
    - Not a modal: no backdrop or dimming overlay; the page behind remains scrollable and clickable. Main content dynamically shifts alongside it.
    - Sticky below the header (`top: 130px`) and self-scrolling (`height: calc(100vh - 145px); overflow-y: auto`).
    - Hamburger button toggles the docked panel on desktop (>= 1280px). Defaults to open on the Discover page (`/`), and remembers the user's open/closed choice in `localStorage["dzirent-desktop-filter-panel"]`.
  - Account icon dropdown menu:
    - Replaced the direct Account icon link with an accessible dropdown menu (`.account-dropdown-menu`) triggered by clicking the Account button (`aria-haspopup="menu"`, `aria-expanded`).
    - Includes click-outside dismissal and route-change closure.
    - When authenticated: displays user name with subline, "Profile & settings" (`/app/settings`), "My closet" (`/app/closet`), and "Sign out" (server action button).
    - When guest: displays "Welcome to Dzirent" greeting, "Sign in / sign up" (`/auth?mode=signin`), and "My closet" (wrapped in `GatedActionTrigger` with `action="list"`).
  - Mobile & narrow screens (< 1280px):
    - Preserved existing slide-in drawer (`.modal.drawer`) with all navigation links (Profile/Sign in, Inbox, Saved pieces, List a piece, My closet, How it works, Rental guidelines, Theme toggle, Sign out, and filter form).
    - Hidden on desktop via `@media(min-width: 1280px) { .modal.drawer { display: none !important; } }`.
    - Hamburger button opens drawer modal on mobile (< 1280px).
  - Discover home page:
    - Removed `<span className="result-count">{cards.length} pieces to explore</span>` from `apps/web/src/app/page.tsx`.
    - Retained result counts where required: search query results (`isSearching === true`), studio pages, Saved, and My closet.
  - Board & documentation:
    - Updated `pranalika/BOARD.md` marking Step 2E Done.

- Files changed:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/components/shell.tsx`
  - `pranalika/BOARD.md`
  - `pranalika/handoffs/antigravity.md`

- Commands run & verified:
  - `$env:PATH = "H:\DziRent\Dzirent_dev\.tools\node-v22.23.3-win-x64;" + $env:PATH`
  - `npm run lint` in `apps/web`: passed with 0 errors and 0 warnings.
  - `npm run build` in `apps/web`: passed with 0 errors (all routes generated).
  - Loaded `H:\DziRent\secrets\dzirent-server.env` and started Next.js production server on port 3002.
  - HTTP checks via Node script:
    - Confirmed Discover page (`/`) HTML does not contain "pieces to explore".
    - Confirmed `.desktop-docked-panel` is present in HTML next to `main#main`.
    - Confirmed `.account-menu-wrapper` is present in header HTML.
    - Confirmed `.desktop-docked-panel` contains only filters and none of the top-bar navigation items.
    - Confirmed search queries (`/?q=linen`) preserve result indicators.
    - Confirmed HTTP 200 response on `/`.

- Open issues:
  - None.

## Step 2D - 2026-11-03 - website layout redesign

- Step 0 recovery findings & actions:
  - Fetched origin: local branch was 3 commits behind `origin/Preview` with staged changes in `apps/web/src/components/local-preferences.tsx` and `shell.tsx`.
  - Verified with `git diff --cached origin/Preview` that staged files had no changes beyond what already existed on `origin/Preview` (commit `dd6f82e`).
  - Discarded stale staged files with `git restore --staged --worktree apps/web/src/components/local-preferences.tsx apps/web/src/components/shell.tsx`.
  - Rebased onto `origin/Preview` (`git pull --rebase origin Preview`), reaching clean working tree at commit `dd6f82e`.
  - Inspected `git log --oneline origin/Preview..origin/main`: verified all 5 commits were standard PR merges.

- What was done:
  - Documentation & decisions:
    - Added 3 rules to `pranalika/README.md` (owner does not run local commands, never replace whole file with older version, handoffs state only what was actually run and verified).
    - Appended decision in `pranalika/decisions.md` under `## Website UI (2026-11-03)`: "The website and the apps may differ in UI. Features and workflows stay the same."
    - Updated `pranalika/BOARD.md` marking Step 2D Done.
  - Top bar redesign (desktop):
    - Row 1 left: Hamburger button (`openFilters`) and "How Dzirent works" link (`/about#how-it-works`). Removed "Made for your next occasion".
    - Row 1 center: DZIRENT logo (`/`).
    - Row 1 right: Icons only, each with hover label (`title`) and accessible name (`aria-label`): List a piece (`+`), Inbox (mail envelope icon with unread dot, slightly larger than others), Saved (`bookmark`), Account (`user`), and ThemeToggle.
    - Row 2: Pill-shaped search bar centered below the logo with date chip and dynamic `{ctx.city} · Change` button beside it.
  - Phones / mobile layout:
    - Top row keeps only hamburger, logo, Inbox (mail icon with unread dot), and Account.
    - Search pill is 100% full width below.
    - Saved, List a piece, How Dzirent works, and theme switch moved into the left sidebar.
    - Entirely removed the tab bar (`.subbar .desktop-nav` and mobile `.bottom-nav`).
  - Left sidebar (drawer):
    - Configured `.modal.drawer` to open from the LEFT (`left: 0; right: auto;`).
    - Added drawer navigation links for Saved pieces, List a piece, My closet, and How Dzirent works, plus Theme switch row and date/location controls.
    - Filter form submits to `/` and Reset links to `/`.
  - In-place search & Discover home page:
    - In `page.tsx`, typing in search pill or applying filters displays search results in place on the home page with result count and `SortDropdown`.
    - Discover view shows standard rows and explore tabs; Sort appears ONLY when displaying search results.
    - Removed small text "Pieces with a story. Ready for yours."
    - Footnote "Local closets. More possibilities." enlarged 4px on desktop (14px) and 2px on phones (9px).
    - `/search` redirects to `/?...` preserving any search query parameters.
  - Guest gate fixes:
    - Restored style reset on `GatedActionTrigger` button (`background: none`, `border: none`, `padding: 0`, `font: inherit`, `color: inherit`, `cursor: pointer`, `textAlign: inherit`) preventing default browser grey box rendering.
    - Added native `close` and `cancel` listeners on `<dialog>` in `GuestGateDialog` ensuring `onClose()` reliably executes and resets `guestGateAction` to `null` so gated buttons immediately re-open on subsequent clicks.
  - Added Lucide/Feather `mail` envelope icon in `icon.tsx`.
  - Updated `onboarding.tsx` guide selectors to match the redesigned top bar.

- Files changed:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/app/search/page.tsx`
  - `apps/web/src/components/cards.tsx`
  - `apps/web/src/components/guest-gate.tsx`
  - `apps/web/src/components/icon.tsx`
  - `apps/web/src/components/onboarding.tsx`
  - `apps/web/src/components/shell.tsx`
  - `apps/web/src/components/sort-dropdown.tsx`
  - `pranalika/README.md`
  - `pranalika/decisions.md`
  - `pranalika/BOARD.md`
  - `pranalika/handoffs/antigravity.md`

- What was actually run and verified:
  - `npm run lint` in `apps/web` with Node 22: passed with 0 errors.
  - `npm run build` in `apps/web` with Node 22: compiled successfully with Turbopack, passed TypeScript checks with 0 errors, generated all static/dynamic routes.
  - Started local Next.js server with secrets loaded from `H:\DziRent\secrets\dzirent-server.env`:
    - Verified Discover page (`/`): returns HTTP 200, contains "How Dzirent works", removes "Made for your next occasion", removes "Pieces with a story. Ready for yours.", displays "Local closets. More possibilities.", renders top bar icons (`top-list-btn`, `top-inbox-btn`, `top-saved-btn`, `top-account-btn`, ThemeToggle) with accessible names and hover labels, renders centered `search-pill`, has no `.desktop-nav` or `.bottom-nav`, and does not render `sort-form`.
    - Verified search results (`/?q=dress`): returns HTTP 200, displays search heading "A little closer to “dress”", renders `sort-form` with newest/nearest/price options, displays filter controls and matching pieces grid.
    - Verified `/search?q=dress`: correctly redirects to `/?q=dress`.

- Open issues:
  - None.

## Sample photos - 2026-11-02

- What was done:
  - Listed 12 sample listings on `dzirent-server` through the REST API as Elena Rostova (User 1) and Maya Lin (User 2).
  - Generated original realistic product photos using the built-in image generator: 3:4 vertical portrait aspect ratio, garments displayed on wooden hangers or clean headless mannequins against plain light studio backgrounds, no people, no faces, no logos, no text. Compressed to JPEG quality 80 (41 KB to 116 KB per photo, well within the 400 KB limit).
  - Generated and saved photos in `supabase/seed/images/<slug>/`:
    - `silk-halter-evening-gown`: front.jpg, back.jpg (Elena)
    - `tailored-charcoal-blazer`: front.jpg, back.jpg (Elena)
    - `emerald-velvet-cocktail-dress`: front.jpg, back.jpg (Elena)
    - `cashmere-belted-trench-coat`: front.jpg, back.jpg (Elena)
    - `pleated-wide-leg-trousers`: front.jpg, back.jpg (Elena)
    - `linen-summer-sundress`: front.jpg (Elena)
    - `minimalist-wool-day-coat`: front.jpg, back.jpg (Maya)
    - `structured-silk-work-shirt`: front.jpg (Maya)
  - Created `supabase/seed/sample_photos.mjs`: signs in as each listing's owner, removes old placeholder photos from Supabase Storage and `listing_photos` table, uploads new photos to `{listing_id}/{random}.jpg` in bucket `listing-photos`, and inserts `listing_photos` rows with positions and slots (`front` at pos 0, `back` at pos 1).
  - Executed `sample_photos.mjs`, updating sample listings on `dzirent-server`.
  - Created and ran `supabase/seed/test_sample_photos.mjs` verifying:
    1. Guest `rpc/browse_listings`: returns 12 listings, every listing returns a valid `cover_photo_path` that fetches with HTTP 200.
    2. Signed in as Elena: listings have valid photos in slots `front` (pos 0) and `back` (pos 1) displaying with HTTP 200 (5 pieces with both front & back, 1 with front).
    3. Signed in as Maya: `minimalist-wool-day-coat` has both front & back (HTTP 200), `structured-silk-work-shirt` has front (HTTP 200), remaining 4 listings retain valid placeholder cover photos (HTTP 200).

- Notes for other agents:
  - Image generation API hit quota limit on model `gemini-3.1-flash-image` (`429 RESOURCE_EXHAUSTED: You have exhausted your capacity on this model. Quota reset timestamp 2026-11-03T07:56:50Z`, in ~4.8 hours).
  - 14 images were generated and processed before exhaustion. The remaining 10 images (`linen-summer-sundress` back, `structured-silk-work-shirt` back, and front+back for `embroidered-silk-lehenga-set`, `modern-qipao-midi-dress`, `vintage-denim-jumpsuit`, `satin-backless-maxi-dress`) can be generated once the quota resets at `2026-11-03T07:56:50Z`.
  - Running `node supabase/seed/sample_photos.mjs` will automatically pick up any newly added photos in `supabase/seed/images/<slug>/` and upload them to `dzirent-server`.

## Step 4C - 2026-10-31 - Android parity finish

Done:
- Screen parity:
  - `HomeScreen.kt`: line-by-line copy of the reference screen with PullToRefreshBox, HomeTopBar (logo mark + wordmark vectors, avatar, clickable location), DateBar, HomeRowSection (Fit row highlighted with DzirentAccent), MeasurementsPromptCard, tabs (Products / Studios), zero-result "Suggested for you" groups via `suggestionItems`, and `SeeAllScreen` with `SuggestionsGrid`. Preserved guest mode gating and callbacks.
  - `SearchScreen.kt`: line-by-line copy of the reference screen with automatic focus, recent searches list, removable filter chips ("Any dates", categories, item types, sizes, etc.), filter sheet launcher, sort dropdown (Nearest, Newest, Price low/high), in-memory query filtering and sorting over loaded listings, zero-result `SuggestionsGrid` (search-related keywords, wider radius, alternate dates, similar titles), and `RecentSearchStore` backed by `SettingsStorage` on the device.
  - `SeeAllScreen`: line-by-line copy of reference with top bar navigation, grid layout, and zero-result `SuggestionsGrid`.
  - `Suggestions.kt` & `Home.kt`: ported reference suggestion builders (`buildSuggestions`, `rememberSuggestions`, `SuggestionsGrid`, `suggestionItems`) leveraging `assets/search_related.json` via `DeviceServices.searchRelated`.
- Local device storage:
  - Added recent search methods (`getRecentSearches`, `addRecentSearch`, `clearRecentSearches`) to `SettingsStorage` in `PlatformServices.kt`.
  - Implemented on Android via `AndroidSettingsStorage` using SharedPreferences `dzirent_prefs` under key `recent_searches_$userId` (newline-delimited, newest first, deduplicated, up to 10 entries), exactly matching reference `RecentSearchStore`.
  - Provided `searchRelated` asset parsing in `AndroidDevice.kt` and iOS stub in `IosDevice.kt`.
- Backend gaps & migration:
  - Applied migration `20261031030000_parity_shop_window_gaps.sql` via `supabase db push` to remote `dzirent-server`:
    - `my_blocked_users`: returns caller's blocked users with display name, studio name, studio handle, and city from `profiles`, resolving "Dzirent member" placeholder.
    - `my_saved_listings`: returns caller's saved pieces with `is_available` boolean (`false` for paused/blocked pieces, with null title/price/photos).
    - `get_studio`: returns `is_own` boolean (`v_lender.id = v_uid`) and `since` line (`'Since ' || to_char(v_lender.created_at, 'Mon YYYY')`), with Security Definer and safe search path.
- Updated UI integrations:
  - `StudioScreen.kt`: displays `page.since` line ("Since Mon YYYY"); checks `is_own` to hide Save and Message buttons for the studio's own owner.
  - `SavedScreen.kt`: updated `getSavedListings` in repository to handle `is_available = false` mapping to `listing = null` ("No longer available").
  - `DzirentRepository.kt`: updated `getMyBlockedUsers()`, `getSavedListings()`, and `getStudio()` to consume the new fields.
  - Updated `pranalika/contract.md` and `pranalika/security-log.md`.
  - Made `mobile/gradlew` executable in git (`git update-index --chmod=+x mobile/gradlew`).

Remaining differences:
- None except allowed (whole-mile distances from the shop window; iOS targets declared but stubbed on Windows).

Files changed:
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/HomeScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SearchScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MainAppScaffold.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/StudioScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Suggestions.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BrowseSession.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/Home.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/model/Models.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/Device.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/PlatformServices.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/repository/DzirentRepository.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidDevice.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidPlatformServices.kt`
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosDevice.kt`
- `mobile/gradlew` (chmod +x)
- `supabase/migrations/20261031030000_parity_shop_window_gaps.sql`
- `supabase/seed/sample_data.mjs`
- `supabase/tests/step4c_parity_test.mjs`
- `pranalika/contract.md`
- `pranalika/security-log.md`
- `pranalika/handoffs/antigravity.md`

How verified:
- `:shared:testDebugUnitTest`: passed with 0 errors (BUILD SUCCESSFUL).
- `:androidApp:assembleDebug`: built debug APK (61,916,052 bytes) in 2m 13s (BUILD SUCCESSFUL).
- API test `supabase/tests/step4c_parity_test.mjs` using live test users against `dzirent-server`:
  - User 1 blocks User 3 via `block_user(p_handle = "jordanbell")`.
  - `my_blocked_users` returns User 3 with real display name "Jordan Bell" and city "Austin, TX".
  - User 1 unblocks User 3 via `unblock_user(p_handle = "jordanbell")`.
  - `my_blocked_users` confirms User 3 is unblocked.
  - User 1 calls `get_studio(p_handle = "studiorostova")`: returns `is_own = true` and `since = "Since Oct 2026"`.
  - User 1 calls `get_studio(p_handle = "ateliermaya")`: returns `is_own = false` and `since = "Since Oct 2026"`.
  - `my_saved_listings` returns successfully.
- No emulator or device used.

Debug APK file path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`

## Step 4 - 2026-10-31 - Android app and release workflow

Done:
- Created Android application module `mobile/androidApp` inside the `mobile/` Gradle project:
  - Target/compile SDK 36, minSdk 26, `applicationId com.dzirent.app`, `versionName "2.0.0"`.
  - `MainActivity.kt` hosting the shared Compose Multiplatform `DzirentApp()` with `AndroidSettingsStorage`.
  - `AppLinks.kt` defining web links (`TERMS_URL`, `PRIVACY_URL`, `SUPPORT_EMAIL`).
  - Copied launcher icons, logo mark/wordmark, adaptive background/monochrome drawables, and `file_paths.xml` from the Android reference.
  - Configured `AndroidManifest.xml` with permissions (`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_COARSE_LOCATION`, `CAMERA`), `FileProvider`, launcher intent filters, and deep-link intent filters for `https://dzirent.com` and `dzirent://`.
- Debug build configuration:
  - Configured `applicationIdSuffix = ".debug"` and `app_name = "Dzirent Debug"` so debug builds install side-by-side with the Play Store release version.
- Release signing configuration:
  - Reads `DZIRENT_KEYSTORE`, `DZIRENT_STORE_PASSWORD`, `DZIRENT_KEY_ALIAS`, and `DZIRENT_KEY_PASSWORD` from environment variables, matching the reference workflow conventions. Never commits a keystore file.
- Version code logic:
  - Computed as `versionCode = GITHUB_RUN_NUMBER + ANDROID_VERSION_CODE_OFFSET`.
  - Local debug builds evaluate to 1.
  - Release builds fail fast with `GradleException` if `ANDROID_VERSION_CODE_OFFSET` is missing.
- Release workflow `.github/workflows/android-release.yml`:
  - Trigger: `workflow_dispatch` only (manual execution).
  - Concurrency group `android-release` to ensure serialized Play internal track deployments.
  - Sets up JDK 17, Android SDK 36 platform and build tools, and Gradle.
  - Validates `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from GitHub repository secrets and injects them into build environment.
  - Validates `ANDROID_VERSION_CODE_OFFSET` from repository variables or secrets.
  - Decodes `ANDROID_RELEASE_KEYSTORE_BASE64` into a temporary keystore and exports signing environment variables.
  - Builds `:androidApp:bundleRelease :androidApp:assembleRelease`.
  - Verifies release APK with `apksigner verify` and release AAB with `jarsigner -verify`.
  - Backs up release artifacts via `actions/upload-artifact@v4`.
  - Publishes direct-download GitHub Release with release notes.
  - Detects `PLAY_SERVICE_ACCOUNT_JSON` and uploads the release bundle to Google Play internal testing track via `r0adkll/upload-google-play@e738b9dd8f2476ea806d921b64aacd24f34515a5`.

Files changed:
- `mobile/gradle/libs.versions.toml`
- `mobile/build.gradle.kts`
- `mobile/settings.gradle.kts`
- `mobile/androidApp/build.gradle.kts`
- `mobile/androidApp/proguard-rules.pro`
- `mobile/androidApp/src/main/AndroidManifest.xml`
- `mobile/androidApp/src/main/java/com/dzirent/app/MainActivity.kt`
- `mobile/androidApp/src/main/java/com/dzirent/app/AppLinks.kt`
- `mobile/androidApp/src/main/res/drawable/ic_launcher_foreground.xml`
- `mobile/androidApp/src/main/res/drawable/ic_launcher_monochrome.xml`
- `mobile/androidApp/src/main/res/drawable/logo_mark.xml`
- `mobile/androidApp/src/main/res/drawable/logo_wordmark.xml`
- `mobile/androidApp/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `mobile/androidApp/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`
- `mobile/androidApp/src/main/res/values/ic_launcher_background.xml`
- `mobile/androidApp/src/main/res/xml/file_paths.xml`
- `.github/workflows/android-release.yml`
- `pranalika/BOARD.md`
- `pranalika/handoffs/antigravity.md`

How verified:
- Validated YAML syntax of `.github/workflows/android-release.yml` with Python `yaml.safe_load`.
- Ran `.\gradlew.bat :androidApp:assembleDebug` with JDK 21 on Windows; built `androidApp-debug.apk` (21,263,819 bytes) in 5m 17s.
- Ran `.\gradlew.bat :shared:testDebugUnitTest`; all 4 test suites (`ListingValidationTest`, `GuestGateTest`, `ModelTest`, `SmokeTest`) passed with 0 errors.
- Verified release version code guards: running `:androidApp:bundleRelease` without `ANDROID_VERSION_CODE_OFFSET` failed with `Release builds require ANDROID_VERSION_CODE_OFFSET environment variable.`, and running `:androidApp:assembleRelease` with offset and Supabase variables built successfully in 3m 53s.

Open issues:
- None.

Debug APK file path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`

Exact list of GitHub secrets and variables needed for the workflow:
- Actions Secrets:
  - `SUPABASE_URL`: Supabase project URL (`https://<project-ref>.supabase.co`).
  - `SUPABASE_PUBLISHABLE_KEY`: Supabase anon/publishable key for client-side API requests.
  - `ANDROID_RELEASE_KEYSTORE_BASE64`: Base64-encoded release `.jks` or `.keystore` signing file.
  - `ANDROID_RELEASE_STORE_PASSWORD`: Keystore store password.
  - `ANDROID_RELEASE_KEY_ALIAS`: Keystore key alias.
  - `ANDROID_RELEASE_KEY_PASSWORD`: Keystore key password.
  - `PLAY_SERVICE_ACCOUNT_JSON`: Google Play service account private key JSON for internal testing publishing.
- Actions Variables:
  - `ANDROID_VERSION_CODE_OFFSET`: Numeric offset added to `GITHUB_RUN_NUMBER` to maintain monotonic version code ordering on Google Play (e.g. `100`).
  - `PLAY_RELEASE_STATUS`: (Optional, default `completed`) Rollout status on Play internal track (`completed` or `draft`).

## Step 3B-2 - 2026-10-31 - remaining screens

Done:
- Ported all remaining screens into `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/` using Compose Multiplatform:
  - `ChatScreens.kt`: `InboxScreen` with "Messages" (with unread indicator dot) and "Activity" tabs; `ChatScreen` with live messaging and rental status flow over Supabase Realtime channel, listing preview banner, dates chip, message bubble history, block/report actions, and clean subscription disposal.
  - `ListingEditorSections.kt`: `MeasurementsSection` (cm/in unit switcher, dynamic rows, inline validation for 1-999 and label limits) and `AvailabilitySection` (inclusive date ranges with format parsing).
  - `ListingEditor.kt`: Full listing editor for creating and editing listings; details (title 3-80 chars, category, accessory item type, size label, price > 0, price details, description <= 1000 chars, styles); accessory declaration confirmation; calls repository `createListing`/`updateListing`, `saveListingMeasurements`, `saveAvailability`.
  - `ClosetScreens.kt`: `MyClosetScreen` with "My Listings" (active/paused status switch, sort options, delete confirmation using Edge Function `delete-listing`, edit action) and "My Rentals" tab (active and returned rentals with navigation to chat).
  - `StudioScreen.kt`: Studio page resolved by handle (`get_studio(handle)`); avatar, name, handle, bio, style tags, pickup area, reply time text, rental count; bookmarking (`saveStudio`/`unsaveStudio`); more menu for report/block by handle; "Message" button opening piece picker sheet; 3-column active pieces grid; guest gated actions.
  - `MyStudioScreen.kt`: Studio settings and profile editor (studio name, cleaned handle with format validation, bio, up to 5 style tags, pickup area); calls `repository.updateStudio`.
  - `SavedScreen.kt`: "Pieces" tab backed by `browse_listings(savedOnly = true)` and "Studios" tab backed by `my_saved_studios()`; remove piece via `unsaveListing` and remove studio via `unsaveStudio`.
  - `SettingsScreen.kt`: Appearance (Theme: System/Light/Dark), Preferences (Distance unit, Measurement unit), Location update, Privacy & Safety (navigation to `measurements` and `blocked`), Search history clearing, About Dzirent, Account (email display, `ChangePasswordDialog`, `DeleteAccountDialog` invoking Edge Function `delete-account`, and Sign out).
  - `BodyMeasurementsScreen.kt`: Private body measurements form (Chest/Bust, Waist, Hips, Shoulder, Height, Inseam) in cm or inches; fit profile selection; fashion style interests; privacy notes; persists to `private_profiles`.
  - `Moderation.kt`: `ReportDialog` (handles both handle-based user reporting and entity ID reporting), `BlockUserDialog`, and `BlockedUsersScreen` (loads own blocks and unblocks via `unblockUserById`).
  - `Guide.kt`: `GuideOverlay` app tour with step dots, skip, next/done, and scrim touch isolation.
  - `Suggestions.kt`: `rememberSuggestions` and `suggestionItems` for 0-result search/browse states; strictly rule-based (no AI / LLM calls).
  - `AboutScreen.kt`: Policies, terms & privacy web links, contact email, version info, and `LicensesScreen` providing a pure multiplatform catalog of open-source dependencies and licenses.
- Android-only code placed in `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/PhotoPermissions.kt`:
  - `PhotoConsentStore`, `PhotoConsentDialog`, `CameraDeniedDialog` behind Android platform context.
- Domain & Repository Additions:
  - `Models.kt`: Added `UiState`, `isValidBodyCm`, `bodyInputToCm`, `cmToBodyInput`, `StyleTags`, `cleanHandleInput`, `isValidHandle`, `suggestHandle`, `replyTimeText`, `sinceText`, `FashionStyles`, `AccessoryDeclaration`, `ClosetSort`, `sortCloset`, `validateMeasurements`, `validateListingForm`, `AppLinks`.
  - `DzirentRepository.kt`: Added `currentEmail`, `updateStudio`, `getListingDetail`, `getRentedOutListingIds`, `getConversation`, `haveIBlocked`, `unblockUserById`.
- Navigation Integration:
  - Updated `MainAppScaffold.kt` to wire all routes (`inbox`, `closet`, `saved`, `studio/{handle}`, `chat/{conversationId}`, `profile`, `settings`, `measurements`, `list`, `edit/{listingId}`, `blocked`, `about`, `licenses`), removing all placeholders.
  - Added shared `SearchHistory` singleton in `SearchScreen.kt` for synchronized search history clearing.
- Tests:
  - Added unit test `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ListingValidationTest.kt` verifying title (3-80 chars), price (> 0), measurement values (1-999), and measurement labels.
  - Built `mobile/shared` and ran `:shared:testDebugUnitTest`: all 4 test suites (`ListingValidationTest`, `GuestGateTest`, `ModelTest`, `SmokeTest`) passed with 0 errors.

Files changed:
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/model/Models.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/repository/DzirentRepository.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AboutScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AccessoryDeclarationScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BodyMeasurementsScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ChatScreens.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ClosetScreens.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Guide.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingEditor.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingEditorSections.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MainAppScaffold.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Moderation.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MyStudioScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SavedScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SearchScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SettingsScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/StudioScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Suggestions.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/ui/PhotoPermissions.kt`
- `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ListingValidationTest.kt`
- `pranalika/BOARD.md`
- `pranalika/handoffs/antigravity.md`

How verified:
- Executed `.\gradlew.bat :shared:testDebugUnitTest` using JDK 21 on Windows; all 4 test classes passed.
- Verified listing validation limits match database constraints: title 3-80 chars, price > 0, measurement values 1-999.
- Verified Edge Function invocations for `delete-listing` and `delete-account`.
- Verified handle-based moderation (`block_user`, `unblock_user`, `report_user`) and studio retrieval (`get_studio`).

Open issues:
- None.

Requests:
- Ready for Step 4 (Android app on shared code).

## Step 3B-1 - 2026-10-31 - shell and browsing screens

Done:
- Version alignment: matched Android Gradle Plugin (8.10.1) and compileSdk (36) while keeping Kotlin 2.1.0. Configured Compose Multiplatform 1.7.3, JetBrains navigation-compose 2.8.0-alpha10, JetBrains lifecycle-viewmodel-compose 2.8.4, and Coil 3 (3.0.4).
- Theme & Components in `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/`:
  - `theme/Theme.kt`: pure multiplatform `DzirentTheme`, light/dark color schemes, `DzirentAccent`, `DzirentLogoMark`, `DzirentPass`, `DzirentWarn`, `OnDzirentAccent`, `LocalDarkTheme`.
  - `LocalAppSettings.kt`: composition local providing device `AppSettings`.
  - `Components.kt`: `Avatar`, `DzirentTabRow`, `AccentDot`, `ListingPhoto` with Coil 3 `AsyncImage`, `NoPhotoPlaceholder`, `LoadingView`, `ErrorView`, `EmptyView`, `formatPrice`, `formatDistance` (with "under 1 mi" when 0), `cardSubtitle`, `LogoMark`, `LogoWordmark`.
  - `Policy.kt`: `DzirentPolicy` strings, `HowDzirentWorksDialog`, `PolicyNotice`, `HowDzirentWorksScreen`, `CommunityPolicyScreen`.
- Navigation Shell:
  - Top bar (`HomeTopBar`): avatar at left, flower mark and wordmark centered, "City, ST" / "Set location" at right.
  - Sticky date chip (`DateBar`): shows formatted range (e.g., "Oct 26 - 30"), opens `DateRangePickerDialog`.
  - Bottom bar: Home, Inbox (with news dot), raised center Search button (`DzirentAccent` circle with elevation), Closet, Saved.
  - Drawer sidebar (`SidebarContent`): profile/guest header, Settings, "All categories" with filter button, full category list.
  - `MainAppScaffold`: connects top bar, date chip, bottom bar, drawer, and `NavHost` destinations.
  - Placeholders added in navigation for 3B-2 screens (`inbox`, `closet`, `saved`, `studio/{handle}`, `chat/{id}`, `profile`, `settings`, `measurements`, `edit/{id}`).
- Auth, Onboarding & Guest Mode:
  - `GuestGate.kt`: defines `GatedAction` (`SAVE_PIECE`, `MESSAGE_LENDER`, `OPEN_STUDIO`, `LIST_PIECE`, `FIT_MATCHING`) and rule checks.
  - `AuthScreens.kt`: `WelcomeScreen`, `LoginScreen`, `SignUpScreen`, `EmailConfirmationView`, `FirstVisitBottomSheet` ("Log In", "Sign Up", "Browse as guest"), and `SignUpPromptDialog`.
  - `Welcome.kt`: `WelcomeDialog` checklist and `FinishSetupCard`.
  - `LocationSetup.kt`: `LocationSetupDialog` with `LocationService` support and US city database search fallback.
  - `CityField.kt`: debounced city search backed by repository RPC `search_cities`.
  - Guest mode rules: opens without sign-in; first-visit sheet offers sign in, sign up, or guest browsing; saving, messaging, opening a studio, listing a piece, and fit matching trigger `SignUpPromptDialog`; "Likely to fit you" row displays single prompt card inviting guest to add measurements.
- Browsing & Search:
  - `BrowseSession.kt`: state management calling `browseListings`, `fitListings`, `mySavedStudios`; parses `HomeSections`.
  - `HomeScreen.kt`: top bar, date bar, prompt card, Home rows (`FIT`, `NEW`, `UNDER_PRICE`, `SAVED_STUDIOS`), Products/Studios tabs, `StudioCard`, `ListingCard`, `SeeAllScreen`, `DateRangePickerDialog`.
  - `SearchScreen.kt`: debounced text search with trigram backend search, recent searches, removable filter chips, sorting dropdown, and `FilterSheet`.
  - `FilterSheet.kt`: category, item type (for Accessories), distance chips, price range, and size inputs.
- Listing Page:
  - `ListingDetailScreen.kt`: loads full detail via `getListing`; swipeable `PhotoCarousel` with page indicator; title, category/item type/size, price, lender studio link; description; garment measurements table formatted to active `MeasureUnit`; available date ranges; deposit note; save bookmarking; `DzirentPolicy.LISTING_NOTICE` and "Message Lender" action; guest gated actions.
- Entry Points:
  - `commonMain`: `DzirentApp()` composable with session management and theme provider.
  - `iosMain`: `MainViewController(): UIViewController = ComposeUIViewController { DzirentApp() }`.
- Repository additions:
  - Added `isListingSaved(listingId)` to `DzirentRepository`.

Files changed:
- `mobile/gradle/libs.versions.toml`
- `mobile/build.gradle.kts`
- `mobile/shared/build.gradle.kts`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/repository/DzirentRepository.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/GuestGate.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/theme/Theme.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/LocalAppSettings.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Components.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Policy.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/CityField.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/LocationSetup.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Welcome.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/AuthScreens.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BrowseSession.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/FilterSheet.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Sidebar.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/HomeScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/SearchScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/ListingDetailScreen.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/MainAppScaffold.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/DzirentApp.kt`
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/MainViewController.kt`
- `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/GuestGateTest.kt`
- `pranalika/BOARD.md`
- `pranalika/handoffs/antigravity.md`

How verified:
- Gradle build and unit tests executed via `./gradlew.bat :shared:testDebugUnitTest`:
  - `GuestGateTest`: verified `testAllGatedActionsRequireSignIn` and `testGuestPermissions` pass (0 failures, 0 errors).
  - `ModelTest`: verified models and domain logic pass.
  - `SmokeTest`: verified smoke test suite passes.
  - Compilation of all `commonMain`, `androidMain`, and unit test sources succeeded with 0 warnings.

Open issues:
- None. Step 3B-1 is complete.

Requests:
- None. Ready for Step 3B-2 (remaining screens: Inbox/Chat, Closet/Listing Editor, Saved, Studio, Profile/Settings, Body Measurements).

Library versions picked:
- AGP: `8.10.1` (aligned with reference app)
- compileSdk: `36` (aligned with reference app)
- Kotlin: `2.1.0`
- Compose Multiplatform: `1.7.3`
- Navigation Compose Multiplatform: `2.8.0-alpha10`
- Lifecycle ViewModel Compose Multiplatform: `2.8.4`
- Coil 3: `3.0.4`

## Step 3A - 2026-10-31 - shared mobile data layer and backend fixes

Done:
- Backend moderation functions: created migration `supabase/migrations/20261031020000_handle_moderation.sql` with `block_user(p_handle)`, `unblock_user(p_handle)`, `report_user(p_handle, p_reason, p_details)`. Applied to `dzirent-server` (`pwfzkyjeivadbtkfkdxr`) with `supabase db push`. All functions are signed-in only, resolve handle internally, never leak account IDs, and execute with `search_path = ''`.
- Decisions: recorded in `pranalika/decisions.md` (chat participant account IDs visible in chat rows; Android app keeps applicationId `com.dzirent.app`). Updated `contract.md` and `security-log.md`.
- Shared KMP mobile project in `mobile/`:
  - Configured Gradle wrapper (8.11.1) and version catalog (`mobile/gradle/libs.versions.toml`).
  - Single module `mobile/shared` targeting Android (`compileSdk 35`, `minSdk 26`, `namespace com.dzirent.shared`) and iOS (`iosArm64`, `iosSimulatorArm64`).
  - Build-time code generation for `SupabaseBuildConfig`: reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from environment variables, refuses placeholders in release builds.
- Data Layer & Models (`mobile/shared/src/commonMain/kotlin/com/dzirent/shared/`):
  - Ported models into `commonMain`: `Profile`, `PrivateProfile`, `StudioDetail`, `ListingCard`, `ListingDetail`, `Listing`, `ListingPhoto`, `ListingMeasurement`, `Availability`, `ConversationCard`, `Conversation`, `Message`, `Rental`, `RentalOutcome`, `Block`, `Report`, `SavedListing`, `SavedStudio`, `SavedStudioCard`, `UsCity`, `SuggestionEvent`.
  - Date and measurement utilities ported to pure multiplatform (`kotlinx.datetime.LocalDate`, `DateRange`, `FitProfile`, `BodyMeasurement`, `Categories`, `AccessoryTypes`, etc.).
  - Complete `DzirentRepository` in `commonMain`:
    - Browse, search, home rows, listing detail, studio, fit, inbox, saved studios: shop window RPCs only.
    - Owner operations: raw tables under caller RLS (`profiles`, `private_profiles`, `listings`, `listing_photos`, `listing_measurements`, `availability`, `messages`, `rentals`, `saved_listings`, `blocks`, `reports`).
    - Actions: `start_conversation`, `save_studio`, `unsave_studio`, `block_user`, `unblock_user`, `report_user`.
    - Edge function invocations: `deleteListing` -> `delete-listing`, `deleteAccount` -> `delete-account`.
    - Photo upload uses storage path `{listing_id}/{random}.jpg` (bucket `listing-photos`).
    - Zero direct cross-user raw table queries; zero client-side fit/distance computations.
- Phone-only feature interfaces in `commonMain`:
  - `LocationService`, `SettingsStorage`, `PhotoPicker`, `CameraService`, `ImageCompressor`.
  - Android implementations in `androidMain`: `AndroidLocationService`, `AndroidSettingsStorage`, `AndroidImageCompressor`, `AndroidPhotoPicker`, `AndroidCameraService`.
  - iOS stubs with compiling `TODO()` implementations in `iosMain`.
- Tests:
  - `ModelTest` in `commonTest`: unit tests for `DateRange`, UUID generation, `Roles`, `Categories`, `DzirentException`.
  - `SmokeTest` in `androidUnitTest`: skips when env vars are omitted; tests guest `browse_listings`, test user 1 `getMyListings`, test user 3 `block_user`/`unblock_user`.

Files changed:
- `supabase/migrations/20261031020000_handle_moderation.sql`
- `pranalika/decisions.md`
- `pranalika/contract.md`
- `pranalika/security-log.md`
- `pranalika/BOARD.md`
- `pranalika/handoffs/codex.md`
- `.gitignore`
- `mobile/gradle/libs.versions.toml`
- `mobile/gradle.properties`
- `mobile/settings.gradle.kts`
- `mobile/build.gradle.kts`
- `mobile/shared/build.gradle.kts`
- `mobile/shared/src/androidMain/AndroidManifest.xml`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/model/Models.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/PlatformServices.kt`
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/repository/DzirentRepository.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidPlatformServices.kt`
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosPlatformServices.kt`
- `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ModelTest.kt`
- `mobile/shared/src/androidUnitTest/kotlin/com/dzirent/shared/SmokeTest.kt`

Library versions picked:
- AGP: 8.7.3
- Kotlin: 2.1.0
- supabase-kt: 3.0.3 (auth, postgrest, storage, realtime, functions)
- Ktor: 3.0.3 (ktor-client-core, ktor-client-android, ktor-client-darwin)
- kotlinx-coroutines: 1.10.1 (core, android, test)
- kotlinx-serialization: 1.7.3
- kotlinx-datetime: 0.6.1
- androidx-datastore: 1.1.1
- play-services-location: 21.3.0
- androidx-exifinterface: 1.3.7
- junit: 4.13.2

How it was verified:
- Migration applied with `supabase db push --yes` to `dzirent-server` (`pwfzkyjeivadbtkfkdxr`).
- `./gradlew.bat :shared:testDebugUnitTest`:
  - With secrets loaded into environment: all 4 `ModelTest` cases passed; `SmokeTest` passed guest `browse_listings` returning active listing cards, test user 1 profile and owned listings, and test user 3 `block_user` and `unblock_user` on test user 1's studio handle.
  - Without secrets: `SmokeTest` automatically skipped via `Assume.assumeTrue`; all 4 `ModelTest` cases passed.
- No device, emulator, or simulator was started.
- iOS targets declared and compile checks passed without running native link on Windows.

Open issues:
- None.

Requests:
- None.

## Step 1B - 2026-10-31 - shop window functions, delete-account, sample data, tests, contract

Done:
- Shop window functions: built migration files `20261031010000_shop_window.sql` and `20261031010001_shop_window_fix.sql` and applied via `supabase db push`. Built:
  - `browse_listings`: guests and signed-in, text query (`pg_trgm`), category, item type, garment type, size, styles, date range (multirange matching over availability windows), radius (miles), price range, newness, saved only, saved studios only, sort options matching Android reference ('nearest', 'newest', 'price_low', 'price_high', and text similarity). Returns safe cards without coordinates or account IDs.
  - `get_listing`: guests and signed-in, full safe listing detail with ordered photo paths, measurements, availability windows, pricing, deposit note, city, distance in whole miles, studio name and handle.
  - `get_studio`: signed-in only, studio name, handle, bio, style tags, city, pickup area, rental count, reply time in minutes, saved state, and up to 30 active listing cards. Replaces `studio_rental_count` and `studio_reply_minutes`.
  - `fit_listings`: signed-in only, ports Android `Fit.kt` logic exactly (comparing caller's body measurements with garment measurements against category ease ranges, requiring at least 2 matching parts). Returns cards.
  - `my_conversations`: signed-in only, inbox list with other person's display/studio name without account ID, pinned listing details, cover photo, price, last message body and timestamp, and unread state. Supports optional single conversation lookup.
  - Additional functions for Android reference screens showing another user's data (item 1f):
    - `my_saved_studios`: for `SavedScreen.kt` Studios tab.
    - `save_studio` / `unsave_studio`: allows saving/unsaving studios by handle without exposing lender UUIDs.
    - `start_conversation`: allows renters to start or open a conversation cleanly, with trigger `app_private.validate_conversation` inferring lender ID.
- `delete-account` Edge Function: rebuilt in `supabase/functions/delete-account/index.ts`, configured with `verify_jwt = false` in `supabase/config.toml`, deployed to `dzirent-server` (`pwfzkyjeivadbtkfkdxr`). Verifies caller via Auth (`auth.getUser`), refuses if active rentals exist (409), cleans up all listing photo folders through Storage API, then deletes the auth user via service role key from function environment.
- Sample data script: `supabase/seed/sample_data.mjs`. Signs in as test users 1, 2, and 3 through normal API:
  - Configures Test User 1 & 2 as Austin lenders with studio details and coordinates.
  - Configures Test User 3 as Austin renter with private body measurements.
  - Generates and uploads 12 sample active listings across categories (no Accessories), each with measurements, 90-day availability, and small placeholder JPEG uploaded to `{listing_id}/{random}.jpg`.
  - Automatically cleans up previous sample listings via `delete-listing` Edge Function.
- Automated tests: `supabase/tests/step1b.mjs`. All 5 test suites pass cleanly.
- Coordination updates:
  - `pranalika/README.md`: updated ownership rules allowing any agent to update `pranalika/` on task completion; added guard for immutable `decisions.md` entries.
  - `pranalika/contract.md`: complete contract of all shop window RPCs, Edge functions, and raw tables with RLS rules.
  - `pranalika/security-log.md`: documented all new SECURITY DEFINER functions and `delete-account`.
  - `pranalika/BOARD.md`: updated Step 1 items to Done.

Files changed:
- `supabase/migrations/20261031010000_shop_window.sql`
- `supabase/migrations/20261031010001_shop_window_fix.sql`
- `supabase/functions/delete-account/index.ts`
- `supabase/config.toml`
- `supabase/seed/sample_data.mjs`
- `supabase/tests/step1b.mjs`
- `pranalika/README.md`
- `pranalika/contract.md`
- `pranalika/security-log.md`
- `pranalika/BOARD.md`
- `pranalika/handoffs/codex.md`

How it was verified:
- `supabase db push --linked`: migrations applied to `dzirent-server` (`pwfzkyjeivadbtkfkdxr`), database reports up to date.
- `supabase functions deploy delete-account`: deployed, active, version 1, `verify_jwt = false`.
- Direct endpoint checks on `delete-account`: no token -> HTTP 401 `not_signed_in`, invalid token -> HTTP 401 `not_signed_in`, GET -> HTTP 405.
- `node supabase/seed/sample_data.mjs`: successfully created 12 active listings, uploaded 12 photos to Storage, populated studio profiles and renter measurements.
- `node supabase/tests/step1b.mjs`:
  1. Guest access: `browse_listings` returns 12 cards with no coordinates or account IDs; `get_listing` returns full details with safe fields; `get_studio`, `fit_listings`, and `my_conversations` denied (HTTP 401); raw tables (`listings`, `profiles`, `conversations`, `private_profiles`) denied (HTTP 401).
  2. Test User 1: successfully created own listing, updated listing, uploaded photo, and deleted listing via `delete-listing` Edge Function.
  3. Test User 3: cannot update User 1's listing (0 rows affected); cannot read User 1's private profile; started conversation and sent message; User 1 sees it in `my_conversations` with other_name="Jordan Bell" and unread=true.
  4. Block enforcement: User 1 blocks User 3 -> User 1's listings disappear from User 3's `browse_listings`; User 1 unblocks User 3 -> User 1's listings reappear (6 listings).
  5. Fit matching: User 3 calls `fit_listings` -> returns 8 pieces matching Jordan Bell's measurements within category ease ranges.
- Standalone check on `save_studio`, `get_studio`, and `my_saved_studios`: studio saved, `is_saved` toggled true, listed in `my_saved_studios`, then unsaved.

Open issues:
- None. Step 1B is complete. Ready for Step 2 (Website foundation) and Step 3 (Shared mobile code).

Requests:
- None.
