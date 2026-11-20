# Board

Status: `To do` / `Doing` / `Done`. The owner assigns each step to an agent. The agent that finishes an item updates its status and notes who did it.

## Step 0 - Provisions (Owner)

| Item | Status |
| --- | --- |
| Vercel: build only `main` and `Preview` (`ignoreCommand`) | Done |
| Vercel: Root Directory `apps/web`, production branch `main` | Done |
| Vercel: `dzirent.vercel.app` assigned to `Preview` | Done |
| Vercel: function region Portland | Done |
| GitHub: ruleset on `main` (PR required, no force push) | Done |
| `dzirent-server`: leaked-password protection on | Done |
| `H:\DziRent\secrets\dzirent-server.env` created | Done |
| Supabase CLI access token in `dzirent-server.env` | Done |
| Test users created in `dzirent-server` and listed in `test-user.env` | Done |

## Step 1 - Backend foundation

| Item | Status |
| --- | --- |
| Done by: Codex (1A), Antigravity (1B) | |
| 1.1 Read-only snapshot of `Dzirent_Android` project (schema, rules, functions, triggers, bucket, `delete-account` source, `us_cities` data) into `supabase/reference/` | Done |
| 1.2 Clean migrations for `dzirent-server`: same tables and workflows, security fixes, owner-only access | Done |
| 1.3 Seed: `us_cities` (32,363 rows) | Done |
| 1.3b Seed: sample listings owned by test users | Done |
| 1.4 `delete-listing` function (removes photos, then listing) | Done, deployed |
| 1.4b `delete-account` function with in-code user check | Done, deployed |
| 1.4c Shop window functions (browse, search, listing detail, studio, fit) | Done |
| 1.5 Minimal tests: owner CRUD, guest read-only, user A cannot touch user B | Done |
| 1.6 Security Advisor clean or every warning logged | Done |
| 1.7 `contract.md` written | Done |

## Step 2 - Website foundation

| Item | Status |
| --- | --- |
| Done by: Codex (2A), Claude Code (2B, 2C), Antigravity (2D, 2E, 2F, Website fixes) | |
| 2A Environment wiring, guest mode, browse, search, listing detail | Done |
| 2B Sign-up gates, fit matching, studio pages, onboarding | Done |
| 2C Website fixes (guest gates, welcome modal, measurements, studio) | Done |
| 2D Website layout redesign, light default theme, guest gate fixes | Done |
| 2E Desktop docked filter panel, account menu, remove home piece count | Done |
| 2F Move My closet to top bar, vertical divider, account menu cleanup | Done |
| Website fixes: true modal overlays with scroll locking, solid sticky header in both themes, solid dark-mode footer, settings & profile clean-up | Done |

## Step 3 - Shared mobile code

| Item | Status |
| --- | --- |
| 3A Backend moderation RPCs (`block_user`, `unblock_user`, `report_user`) | Done |
| 3A KMP shared module setup (`mobile/shared`, Android + iOS targets, catalog) | Done |
| 3A Common models ported (`commonMain`) | Done |
| 3A `DzirentRepository` rewritten against contract | Done |
| 3A Phone-only interfaces (`commonMain`) + Android implementations + iOS compiling stubs | Done |
| 3A Unit & smoke tests passing | Done |
| Done by: Antigravity (3A, 3B-1, 3B-2) | |
| 3B-1 Shell, theme, components, welcome and sign-in, guest mode, location, home, search, filters, sidebar, listing page | Done |
| 3B-2 All remaining screens | Done |

## Step 4 - Android on shared code

| Item | Status |
| --- | --- |
| Done by: Antigravity | |
| 4.1 Android app module `mobile/androidApp` (`applicationId com.dzirent.app`, compileSdk 36, targetSdk 36, minSdk 26, versionName 2.0.0 (1.0.0 since 4B), hosts shared `DzirentApp()`) | Done |
| 4.2 Manifest permissions, deep links (`AppLinks`; deep links removed in 4B, the reference has none), launcher icons & resources copied from reference | Done |
| 4.3 Debug configuration (`applicationIdSuffix ".debug"`, app name "Dzirent Debug") | Done |
| 4.4 Release signing configuration using environment variables | Done |
| 4.5 Version code calculation (`GITHUB_RUN_NUMBER + ANDROID_VERSION_CODE_OFFSET`, release failure check) | Done |
| 4.6 Manual release workflow `.github/workflows/android-release.yml` (`workflow_dispatch`, Play internal testing upload) | Done |

## Step 4B - Android parity with the reference (V1.0)

| Item | Status |
| --- | --- |
| Done by: Claude Code | |
| Versions decision (V1.0 / V1.1 / V2.0), versionName 1.0.0 | Done |
| a. Listing editor photos (slots, picker, camera, compression, upload, reorder, delete) | Done |
| b. Listing editor (create/edit flow, declarations, availability) | Done |
| c. On-device AI (photo checks, TinyCLIP recognition, suggestions, removals) | Done |
| d. Chat, inbox, activity | Done |
| e. Closet, rentals, studio, saved, settings, measurements, moderation, guide, about | Done |
| f. Filter sheet, sidebar, location dialog, theme, browse rules, manifest | Done |
| f. Home, Search, See all as line-by-line ports | To do |

## Step 5 - iOS

| Item | Status |
| --- | --- |
| Done by: Claude Code (branch `ios01`; 5B on `Preview`) | |
| 5.1 Shared code builds for iPhone (static `shared` framework, `iosArm64` + `iosSimulatorArm64`) | Done |
| 5.2 Xcode app `mobile/iosApp` (XcodeGen `project.yml` + committed `.xcodeproj`, Gradle build phase, icon, launch screen, permission texts) | Done |
| 5.3 iPhone phone features: settings, location, photo picker, camera, compression, photo storage and drafts | Done |
| 5.4 Runs in the iOS Simulator: guest home with photos, listing page, sign-in with test user 1 | Done |
| On-device item recognition (TinyCLIP) on iOS (stub, same as Android without the model) | Not needed: removed in 8B, suggestions come from the server photo check on both phones |
| iOS push (needs a paid Apple Developer account) | To do |
| Owner: merge `ios01` into `Preview` | Done (PR #94) |
| 5B Android check after the iOS merge (debug APK builds, shared unit tests pass) and date changes refused between blocked users | Done |
| 5C iPhone polish (Claude Code, `ios01`): swipe back from the left edge, status bar follows the in-app theme, no gap under the status bar on top-bar pages | Done |
| Owner: Android build check of the 5C `commonMain` hooks (see the 5C handoff), then merge `ios01` into `Preview` | Done (PR #95; build check in 5D) |
| 5D Android check after the 5C merge (debug APK builds, shared unit tests pass) and no doubled top padding on Android top-bar pages (Claude Code) | Done |
| Owner: phone check of the 5D top padding (see the 5D handoff) | To do |
| `iosSimulatorArm64Test` sign-in test fails on Simulator TLS trust in the agent environment (12 of 13 pass) | To do |

## Step 6 - Switchover

All three clients build and pass owner testing on `dzirent-server`. Then the `Dzirent_Android` repo and project are retired.

## Step 7 - Notifications (V1.1)

| Item | Status |
| --- | --- |
| Done by: Claude Code (7A) | |
| 7A Android push through Firebase: new messages, new chats, date changes; Settings > Notifications; `send-push` deployed | Done |
| Owner: GitHub secret `GOOGLE_SERVICES_JSON_BASE64` for the release workflow | To do |
| Owner: phone test of push (see the 7A handoff) | To do |

## Step 8 - Photo scanning

| Item | Status |
| --- | --- |
| Done by: Claude Code (8A, 8B) | |
| 8A Vision service `vision` on Cloud Run (Marqo-FashionSigLIP, CPU PyTorch, `us-west1`, min 0 / max 1, no unauthenticated access); service accounts `vision-runtime` (no roles) and `vision-invoker` (invoker on `vision` only) | Done |
| 8A Database: pgvector, `photo_scans`, `listing_scans`, `policy_item_types`, `app_settings` (all three flags off), `request_scan`, duplicate-photo check, publish gate (blocks only while `vision_required` is on) | Done |
| 8A `scan-listing` Edge Function deployed with secrets `SCAN_LISTING_SECRET`, `VISION_URL`, `VISION_INVOKER_KEY_BASE64` | Done |
| Owner: put photos in `H:\DziRent\vision-test\should-accept` and `should-reject` (both were empty), then re-run `services/vision/eval/run_eval.py` | To do |
| 8B Policy: hoodies and sweatshirts not allowed; lingerie, underwear and swimwear stay not allowed; costume jewelry allowed with the accessory declaration (`policy_item_types` and `services/vision/app/policy.json` in sync); vision service redeployed (revision `vision-00004-7rb`) | Done |
| 8B Database: changing the photos of an active listing re-checks it automatically; while `vision_required` is on, a result that isn't allowed pauses the listing with `auto_paused_reason` (cleared on republish); `request_scan` returns the latest check when it covers the current photos; `listing_scans` on Realtime; `verification_required` description fixed | Done |
| 8B Mobile apps (shared code): new listings start as paused drafts, `request_scan` after the photos step, "Checking your photos…" while the lender types, server suggestions fill empty fields only (kept/cleared logged), rejected and review banners, per-photo server warnings, publish follows the database gate when `vision_required` is on, My closet shows `auto_paused_reason` | Done |
| 8B On-phone TinyCLIP recognition removed (model, label embeddings, LiteRT and its `libtensorflowlite_jni.so`); on-phone blur and lighting checks kept | Done |
| 8B Root README: product rules, "Open-source software and models" | Done |
| Owner: phone test of the 8B listing flow (see the 8B handoff) | To do |
| Mac: iOS build check of the 8B shared-code changes (see the 8B handoff) | Done (Claude Code, Mac iOS session 2026-11-07, `ios01`) |
| Website: run `request_scan` after the photos, show the verdict, reason, photo warnings and suggestions, show `auto_paused_reason`; insert new listings as paused before `vision_required` is turned on | Done (Antigravity) |
| Admin review of `review` verdicts (`admin_decision`) | To do |

## Handoff plan

Phases from the coordinator's handoff plan. `compliance.md` section 8 maps every gap found to one of them.

| Item | Status |
| --- | --- |
| Done by: Claude Code (P1A part 1, P1B part 1, P2A, P2B part 1, plain-language legal pages, P2C, P3A, P3B, P4B, P5A, P5C), Antigravity (P1A part 2, P1A fix-up, P1B part 2, website catch-up, website fixes, P2B part 2) | |

| P1A part 1: data inventory and `compliance.md`; legal fill-ins in `legal-placeholders.md` | Done |
| P1A part 2: website legal pages (privacy policy, terms, community rules and prohibited items, copyright/DMCA, safety tips, delete-account page, support/contact), fill-ins in one config | Done |
| P1A fix-up: legal page corrections (zero fallbacks, log placeholders, cache disclosure, worn photos allowed, real photo check scope, support@ only, Everyday category) | Done |
| Owner and attorney: fill `legal-placeholders.md` (company, addresses, DMCA agent, law and disputes, taxes, age wording, retention periods) | To do |
| Owner: `gcloud auth login` on this PC, so agents can read Cloud Logging retention and the billing kill switch (P1A part 1 couldn't) | Done (2026-11-07, during P2A); the retention and kill-switch checks themselves are still to do |
| P1B FAQ and help center; in-app Help links; terms acceptance recorded with version and date on all three platforms; explicit consent before saving body measurements | Done |
| P1B part 1 (backend and apps): `legal_documents`, `legal_acceptances`, `accept_legal`, `needs_legal_acceptance`; measurements consent (`give_`/`withdraw_measurements_consent`, refused without it; test users' measurements cleared); sign-up terms tick with links; "We've updated our terms" step; consent dialog and Settings control; 8-character passwords; Settings > Help & legal | Done |
| Website (P1B part 2): record terms acceptance at sign-up (`accept_legal('web')`) and check `needs_legal_acceptance`; measurements consent step and withdrawal; 8-character passwords; `/help` page and footer/sitemap | Done |
| Owner: phone test of P1B part 1 (see the P1B part 1 handoff) | To do |
| Mac: iOS build check of the P1B part 1 shared-code changes | Done (Claude Code, Mac iOS session 2026-11-07, `ios01`) |
| P2A Text filter on listings, profiles and chat (database); nudity check and "hooded garment goes to review" (vision service) | Done (Claude Code) |
| P2A text filter: LDNOOBW English list (CC BY 4.0) and allowlist in `app_private`, whole-word matching after normalizing; language refused in listings, profiles, chat and reports; contact details refused in listings and profiles only; `check_text` for sign-up; apps and website show refusals under the field or chat box | Done |
| P2A photos: `Marqo/nsfw-image-detection-384` (Apache 2.0) in the vision service (nudity rejected, uncertain to review), hooded garments to review, worn never penalized; revision `vision-00005-9cg` | Done |
| Owner: phone test of P2A (see the P2A handoff) | To do |
| Mac: iOS build check of the P2A shared-code changes | Done (Claude Code, Mac iOS session 2026-11-07, `ios01`) |
| Owner: decide on list words left blocked that are also fashion or Spanish words ("lolita", "negro"), and whether report details should allow quoting abuse (see the P2A handoff) | Report details: decided in P2B (unfiltered). The two words: to do |
| P2B Admin dashboard: reports, photo reviews, takedowns, suspend/ban, listings, feature flags, simple metrics; every admin action logged | Done |
| P2B part 1 (backend, Claude Code): admins with two-step sign-in (`admin_users`, `is_admin`, `require_admin`), append-only admin log, report evidence snapshots kept after account deletion, report details unfiltered, suspensions and listing holds, 23 admin functions, `admin-actions` Edge Function (ban, unban, photo files), `set_flag`, seed script; apps: review banner shows the check's reason, suspension notice | Done |
| Owner: seed script ran and seeded admin (`accounts found: 1, added: 1`); enroll TOTP authenticator on the admin website (`/admin`) | To do |
| P2B part 2 (website): admin pages on top of the P2B part 1 functions, TOTP enrollment and sign-in | Done |
| Plain-language legal pages (Claude Code): cookies in three categories, providers as a plain list, scrambled passwords, no technical names, regions, model names or scores on any public page; report evidence, staff access and 2-year report retention disclosed; delete-account page corrected (no reviews, avatars or phone numbers, which Dzirent never had) | Done |
| Owner: the website build needs Node 22 (`package.json` engines); this PC has Node 18 with npm 6, which can't read the lockfile. Install Node 22 LTS or keep a portable copy for agents | To do |

| Owner: phone test of P2B part 1 (see the P2B part 1 handoff) | To do |
| Mac: iOS build check of the P2B part 1 shared-code changes | Done (Claude Code, Mac iOS session 2026-11-07, `ios01`) |
| Attorney: report and evidence retention period (placeholder 730 days in `app_private.settings`) | To do |
| P2C Age gate: store age signals on Android and iPhone, state list table, 18+ on the website (Texas SB 2420, Utah) | Done on Android and website (Claude Code); iPhone done in the Mac iOS session (Claude Code, `ios01`), real minor/adult signals untested until the paid Apple account |
| P2C (Claude Code): `age_checks` and `record_age_check` (no birthdate), a store "minor" blocks every write by the account and pauses its listings, admins see the age check in user lookup; Android asks Google Play Age Signals 0.0.4 on sign-in and daily, blocked screen (Delete my account, Sign out); website records the 18+ tick; public pages name no service provider, new password and age wording; `preview_label` flag and the red "Preview only" header label; overlay dialogs for Block, Report and the sign-in page | Done |
| Mac: wire Apple's Declared Age Range into the `IosAgeSignals` stub (see the P2C handoff), and build-check the P2C shared-code changes | Done (Claude Code, Mac iOS session 2026-11-07, `ios01`) |
| Mac iOS session (Claude Code, `ios01`, 2026-11-07): iOS build of 8B, P1B, P2A, P2B, P2C (no fixes needed); `PrivacyInfo.xcprivacy`; photo library text removed; Simulator check of terms, photo check, text filter, measurements consent, Help & legal; Declared Age Range (iOS 26.2+) | Done; owner merges `ios01` into `Preview` |
| Mac: `:shared:iosSimulatorArm64Test` couldn't run (`simctl spawn` of any process exits 137 on this Mac) | To do |
| Paid Apple account: Declared Age Range capability on the App ID, then drop the simulator-only condition on `CODE_SIGN_ENTITLEMENTS` (see the Mac iOS session handoff) | To do |
| Owner: phone test of P2C on Android (see the P2C handoff); check the "Preview only" label and the new dialogs on the website in both themes and on a phone | To do |
| P3A Download my data on all three platforms | Done on website and Android (Claude Code); iPhone opens the website until a Mac session adds a native save |
| P3A (Claude Code): `export-my-data` Edge Function and `export_my_data()` (one JSON file of everything Dzirent holds about the caller, other people only by name and handle, once a day, `data_exports`); website Settings > Privacy & safety > Download my data; Android Settings row with the system save picker; iPhone row opens the website; privacy and help text; welcome popups never open on policy and help pages; page titles "<Page> \| Dzirent"; website blocked page for age-blocked accounts (`age_blocked()`) | Done |
| Mac: native "Download my data" save on iPhone (`IosDataExport`, see the P3A handoff), and build-check the P3A shared-code changes | To do |
| Owner: phone test of P3A on Android (see the P3A handoff); check the website's Download my data, the blocked page and the page titles | To do |
| P3B Cleanup and retention jobs: abandoned drafts, orphan photos, old scans, log retention; sample listings removed from production | Jobs done, all counting only (Claude Code); log retention and sample removal still open (below) |
| P3B (Claude Code): nine nightly cleanup jobs (pg_cron; files through `cleanup-files` and the Storage API), retention settings in `app_private.settings`, `job_runs`, one Flags-page switch per job (all count-only), "Cleanup jobs" card on the admin overview, privacy retention section; `remove_sample_data.mjs` written, not run; README rule 15 (copy each new debug APK to OneDrive) | Done |
| Owner: decide when to switch each cleanup job to deleting (admin Flags page, `cleanup_<job>`); check the admin overview's Cleanup jobs card after the first nightly runs | To do |
| Owner: say when to remove the 12 sample listings (`node supabase/seed/remove_sample_data.mjs --yes`, run by an agent) | To do |
| Attorney: declaration retention period (placeholder 7 years) and report retention (placeholder 730 days) | To do |
| P4A Website accessibility to WCAG 2.1 AA (automated checker in the build plus a manual pass) | Done (Antigravity) |
| P4B App accessibility: screen reader labels, touch targets, large text, contrast in both themes (iPhone part on the Mac) | Android done (Claude Code); iPhone VoiceOver check on the Mac |
| P4B (Claude Code): headings on every screen and dialog title and section header, errors and photo-check progress announced, listing cards read as one item, row photos and avatars decorative, labelled closet switch and Edit/Delete/Remove buttons, selectable sidebar categories, 48 dp targets (photo remove, date chips, categories), buttons grow with large text, theme contrast fixes (outline, dark accent), Lint accessibility checks as errors (shared module included), two Lint errors fixed (Android 8 crash in MainActivity, Fragment version for the save picker) | Done |
| Owner: TalkBack and largest-font test of P4B on Android (list in the P4B handoff) | To do |
| Mac: VoiceOver pass of the shared screens with VoiceOver actually on (P4B handoff), and build-check the P4B shared-code changes | To do |
| P5A Security hardening: database rule audit, rate limits, bot check on sign-up, website security headers, input checks on every server function, dependency and secret scanning | Done (Claude Code); bot check researched, stays off until P8C |
| P5A (Claude Code): database audit (nothing to fix; 11 foreign-key indexes added), current terms enforced in the database, rate limits (messages, chats, reports, listings, photo checks), upload rules (JPEG/PNG/WebP, 10 MB, `{listing_id}/{random}.jpg`), input checks in all 7 Edge Functions, website security headers, GitHub alerts/Dependabot/CodeQL, 30-day inactivity sign-out, admin code every 24 hours, phone sessions in the Keystore/Keychain and Android backup off, chat filter removed, privacy policy sentence | Done |
| Mac: build-check the P5A shared code, especially `IosSecureStore.kt` (Keychain) and that a signed-in iPhone stays signed in after the update (see the P5A handoff) | To do |
| Owner: phone test of P5A on Android (see the P5A handoff); check the website's headers, sign-in, live chat, uploads and admin area on Preview after the deploy | To do |
| Owner: root `README.md` still says the text filter covers chat (see Requests in the P5A handoff) | Done (P5C, Claude Code) |
| P5C Share listings and studios: share button on all three platforms, rich link previews with the studio handle, app links (Android now, iPhone with the paid Apple account) | Done on website and Android (Claude Code); iPhone share sheet written, needs the Mac build; iPhone universal links with the paid Apple account (P8B) |
| P5C (Claude Code): link previews (listing and studio Open Graph/X tags, 1200 × 630 preview images, "no longer available" page), Share on listing and studio pages (website share menu or Copy link; Android and iPhone system share sheet), Android verified app links (`assetlinks.json` for the debug app), opened links go to the listing or studio; Dependabot version updates target `Preview`; root README text filter line; iPhone Keychain cleared on a fresh install | Done |
| Mac: build-check P5C on iPhone: `IosDevice.share` (UIActivityViewController) and the Keychain first-launch marker in `IosSecureStore.kt` (see the P5C handoff) | To do |
| Owner: phone test of P5C (see the P5C handoff), after the website with `/.well-known/assetlinks.json` is live on dzirent.com (it is served from `main`) | To do |
| P8A: add the release package and Play signing fingerprint to `assetlinks.json` | To do |
| P5B Logs and monitoring: error tracking, uptime checks, alerts, backup restore drill, incident plan | To do |
| P6A ID verification (Didit) on all three platforms; flag off, keys blank | Done in C6 (Claude Code): Android (native SDK) and website live with the keys set and the flag off; iPhone opens Didit's hosted page until the Mac session |
| P6B Payments backend: Stripe Connect test mode, deposits, "confirm rental" step, sales tax hook off | To do |
| P6C Payment screens on all three, rental reminders, email templates; email service key blank | To do |
| P7A Automated tests on every PR in GitHub Actions; one Mac session for all iPhone checks | To do |
| P7B Handoff package: architecture, runbooks, account inventory, guide for the business owner | To do |
| P8A Google Play: organization account, new package, upload key, store forms, first upload, release pipeline | To do |
| P8B Apple: organization enrollment, App Store Connect, privacy labels, age rating, push key, TestFlight, submission | To do |
| P8C Go-live: flags on, email confirmation on, monitoring live, launch checklist | To do |
| P8C: sign-up bot check (hCaptcha recommended, see `security-log.md` "Bot check"; all three clients send the token before it's switched on) | To do |
| P8C: official App Store and Google Play badges on the About page, once each listing is live | To do |
| P8C: first-sign-in wording for brand-new users | To do |

## Code completion

| Item | Status |
| --- | --- |
| Done by: Claude Code (C1, C2, S1, S1b, C3, C4, C5, C6, F1) | |
| C1 Error and warning codes (one catalog, generated Kotlin/TypeScript, every database refusal and Edge Function error coded), price per day, background job outbox with retries and dead-letter list, client read retries, stray root doc removed | Done (Claude Code) |
| C2 Test foundation: local backend in Docker (migrations from scratch + local seed, stubs for push and vision, functions served locally), pgTAP suite (9 files), integration scripts local by default with one runner, vision model tests marked, CI on every pull request (`.github/workflows/ci.yml`), `pranalika/testing.md` | Done (Claude Code) |
| S1 Security updates: vision service on Pillow 13.0.0, torch 2.14.1 (CPU), transformers 5.20.2, FastAPI 0.162.0 / Starlette 1.7.0, open_clip 3.3.0 (no verdict changed on 92 photos and 12 listings in a local Linux image); website minimatch 11.0.3 through an npm override; 5 code scanning alerts dismissed ("used in tests"); `security-log.md` "GitHub security alerts (S1)" | Done (Claude Code); deployed in S1b |
| Owner: `gcloud auth login` on this PC, then an agent redeploys `vision` with the S1 packages and runs the eval | Done: owner signed in; S1b deployed `vision-00006-sxv` (`s1.1`), eval unchanged on 92 photos and 12 listings |
| S1b: Pygments 2.21.0 and the CI vision job's separate pin dropped; `.venv/` kept out of Cloud Build and Docker uploads; `contracts/generate.mjs` escapes backslashes and control characters for Kotlin and Markdown (CodeQL #9 fixed on PR #103, generated files unchanged) | Done (Claude Code) |
| Owner: merge `Preview` into `main` (PR #103): the 82 Dependabot alerts are on `main` and close with the merge | To do |
| Request from S1: seed and test scripts stop putting the email in sign-in errors (`supabase/`) | Done in C5 (Claude Code) |
| C3 Rental lifecycle: request, accept or decline (48-hour expiry), pickup and return with private condition photos (at least 2 by the lender), completed; writes only through database functions with `rental_events`; price snapshot; no double booking (exclusion constraint, back-to-back allowed); rental pushes and daily reminders with a Rental reminders switch; rental reports; condition photo retention (count-only cleanup); payment states present but unused (`payments_enabled` off). Apps and website: Request to rent, rental card, My rentals, Settings > Notifications; admin user lookup and report detail show the timeline and photos. Live: migration applied, 4 Edge Functions redeployed | Done (Claude Code) |
| Owner: phone test of C3 (see the C3 handoff) | To do |
| Mac: build-check the C3 shared code on iPhone (`RentalViews.kt`, `Rentals.kt`, `rememberPhotoSources` for condition photos), see the C3 handoff | To do |
| Owner and attorney: condition photo retention (placeholder 365 days after the rental ends); whether the privacy text change needs a version bump (gap G34) | To do |
| C4 Payments backend (Stripe Connect, switched off, keys blank): Express onboarding, destination charges with a fee setting, deposit holds (place, release, capture, renew), claims with admin decisions, refunds by the cancellation rule, a signed and idempotent webhook, money steps through the outbox with idempotency keys; tested against stripe-mock (pinned) in CI. C3 follow-ups: automatic cancel 2 days after the start, no-window listings always available, `rental_cancelled` / `rental_expired` pushes, `admin_end_rental`. Settings: every business number typed, ranged and logged; admin Payments, Settings and Integrations pages. Live: 2 migrations applied, 8 Edge Functions deployed, `payments_enabled` off | Done (Claude Code) |
| Business owner and attorney: confirm the payment settings in `legal-placeholders.md` section 10 (fee, claim window, refund cutoff and late refund, sales tax, charges to a saved card) and write them into the Terms before payments go live | To do |
| Request from C4: the apps' and website's date pickers treat "no availability windows" as always open (one line each in `Rentals.kt` and `rentals.ts`), see the C4 handoff | Done in C5 (Claude Code) |
| Owner: the day real Stripe keys arrive, follow the runbook in `contract.md` section 7 (test mode first) | To do |
| C5 Payment screens on Android and the website (hidden while `payments_enabled` is off): My studio payouts (Stripe onboarding in the browser, status on return), the listing deposit amount, the rental card's payment states and actions (Pay through Stripe's own payment sheet / Payment Element on a pay page with its own CSP, the deposit hold at pickup, claims, accept or dispute, receipts), the lender's payout notice; pinned Stripe Android SDK 21.29.2 and `@stripe/stripe-js` 9.17.0. Payment deadline setting (24 h) with the automatic cancel. Transactional emails through the outbox and `send-email` (provider-neutral, key blank: every email skipped), templates, Auth email templates (local only), `Email me about rentals`. C4 follow-ups: no-window date pickers, the request answer time from the server, `tools/gen-code-reference.py` with a freshness check, every Edge Function redeployed, the S1 request. Live: migration applied, 15 Edge Functions deployed, `payments_enabled` off | Done (Claude Code) |
| Mac: the iPhone payment sheet (Stripe iOS SDK PaymentSheet behind `rememberPaymentSheetLauncher`, `ui/PaymentSheet.ios.kt`) and a build check of the C5 common code, see the C5 handoff | To do |
| Owner: phone test of C5 with payments off (nothing changes; Settings > Notifications has `Email me about rentals`), see the C5 handoff | To do |
| Owner and agent: the Stripe test-mode rehearsal (`pranalika/stripe-rehearsal.md`) once test keys exist | To do |
| Owner: an email provider account and the `dzirent.com` DNS records, then the email runbook (`contract.md` section 9) | To do |
| Business owner and attorney: confirm `payment_deadline_hours` (24 h), the email record retention (30 days) and the email sender (`legal-placeholders.md` sections 10-11) | To do |
| C6 ID verification with Didit, live: available to anyone from Settings while the Didit keys are set, `verification_required` (the gate on chats, messages and publishing, `DZ-E6001`) off. `identity_verifications` (owner reads the status only; legal name private; no images, birthdate or document data), the Verified badge in the shop window (cards, listing and studio pages, chat headers), attempts (3, a setting), the ID's 18+ result outranking store signals (a minor is declined and blocked), duplicate faces to admin review, `didit-start` / `didit-webhook` (X-Signature on the raw body, body timestamp, application id, event id once) / `didit-sync` through the outbox, 10-minute reconciliation, Didit deletion at account deletion, admin ID verification queue (approve, reject, reset attempts; logged), Settings > ID verification with the keeps/never-keeps note, website `/verify/done`, Android Didit SDK 4.9.1, privacy page. Live: both C6 migrations applied (the follow-up turns on RLS for the two closed Didit tables and C3's `rental_reminders`; pgTAP now checks every table), all 18 Edge Functions deployed on the 196-code catalog, the Didit key, webhook secret and job secret set. Live test passed 2026-11-15 (the owner's ID on a test account: verified, 18+, attempts 1, the badge in the shop window; the first starts got `DZ-E6006` until the key's Sessions access was set to Read + Write) | Done (Claude Code) |
| Owner: the one live verification on the preview site (steps in the C6 handoff), then an agent confirms it read-only | Done 2026-11-15: verified once the Didit key's Sessions access was Read + Write; confirmed read-only by Claude Code, see the C6 handoff |
| Owner: delete the unused `DIDIT_WORKFLOW_ID` line in `providers.env`; before deleting the live-test account (Elena Rostova), check that the Didit key's People (users) access is Read + Write, see the C6 handoff | To do |
| Mac: Didit's iOS SDK behind `rememberIdVerificationLauncher` (the iPhone opens Didit's hosted page until then) and a build check of the C6 common code, see the C6 handoff | To do |
| Owner and attorney: the consent screen's company name, biometric consent, retention, and the Terms before `verification_required` is switched on (`legal-placeholders.md` section 12) | To do |
| F1 Owner test fixes (Claude Code): listing drafts save unfinished (no size, price or details) on the website and apps, each step and Publish ask for their own fields with field-level codes `DZ-E2070`-`E2085`, an unfinished row goes live only through Publish (never the closet switch); every website call and app call gives up after 30 s with `DZ-E9002` and the form's button comes back; inactive step indicator steps have the normal cursor; your own studio shows Edit studio (no Save, Report, Block or Studio options), your own listing Edit only; database refuses a self-block or self-report written to the tables (`DZ-E3021`, `DZ-E5017`); dark-mode chips, pills, badges and the photo counter on theme tokens (every pair 5.2:1 or more); website measurements consent buttons fixed (sent as GET, answered "Page not found."); vision `opentelemetry-api` 1.45.2 (Dependabot alert 83; verdicts unchanged on 92 photos, not redeployed: the alert closes with the merge). Live: the F1 migration applied after CI (run 43737167391), Security Advisor unchanged | Done (Claude Code) |
| Owner: phone and website test of F1 (see the F1 handoff) | To do |
| Mac: build-check the F1 shared code on iPhone (see the F1 handoff) | To do |
| C7 | To do |
| C8 | To do |
| Mac: build-check the C1 shared-code changes on iPhone (`ErrorCatalog.kt`, `ReadRetry.kt`, the Ktor `HttpRequestRetry` in `createDzirentSupabaseClient`, price per day), see the C1 handoff | To do |
| Owner: phone test of C1 (see the C1 handoff) | To do |
| Owner: make the CI checks required on `main` and `Preview` (branch rules), once a few runs are green | To do |

## Vision data

| Item | Status |
| --- | --- |
| D1 | Replaced by D1b (Antigravity; its list came from a wrong root, "title") |
| D1b Clothing types rebuilt from Wikidata: every root and launch QID checked by label and description, a bounded crawl (4 levels, 2 for banned kinds), classification by the item itself. Stopped at the size gate (2,713 rows) | Done (Claude Code) |
| D1c Cut A+B (nine non-rentable branches and "fashion accessory" cut out of clothing): 1,731 types (57 launch; 645 allowed, 167 not allowed, 919 review), `review.csv` with `needs_owner`, `vocabulary.json` (812 types for the scanner); the tooling now in `data/vision/`, CI job `vision-data` | Done (Claude Code) |
| Owner: open `data/vision/taxonomy/review.csv` in Excel; check only the rows where needs_owner is yes (dzirent_category and allowed; 113 rows since D2b: the 57 launch types, the 33-type keep list and the 23 allowed costumes); save as CSV; tell the coordinator | To do |
| D2 Vocabulary cleanup first (instance-of drop: brand, trademark, product model or line, fictional object or clothing, archaeological artefact; generic entries; the watch root; the 45-type keep list with needs_owner = yes): 1,745 types, 102 needs_owner, 845 in `vocabulary.json`. Then the Commons downloader `data/vision/images/fetch_commons.py` (CC0, CC BY, CC BY-SA, public domain only): 4,678 photos for 92 of the 102 needs_owner rows (1.72 GB, on this PC only); `manifest.csv` and `CREDITS.md` committed | Done (Claude Code); the other types wait for the coordinator |
| D3 Label-check page `data/vision/images/review_server.py` (http://127.0.0.1:8765): keep, drop or not sure per photo, keys and progress bars, decisions appended to `labels.csv` | Done (Claude Code) |
| Coordinator: decide the full download (not allowed 40 a type, other allowed 12 a type: 7,043 more photos by the dry run) and the open questions in the D2+D3 handoff | Done: the D2b prompt ordered the full run and answered the questions |
| D2b Owner policy (costumes rent; protective, military and sportswear don't): costume root (2 levels) and space suit root (1 level) as Occasion & Party / garment type costume, keep list 45 → 33, instance-of exceptions (Harrington jacket, Perfecto, Kariyushi shirt), drop list (7 brand-named watches, keep = no): 1,767 types, 113 needs_owner, 852 in `vocabulary.json`. `fetch_commons.py`: `--prune` (338 photos, 94.3 MB), Commons search for needs_owner types under 40, manifest `source` column. `review_server.py`: `--launch-only`, search tag, finished-type line. Photos: 8,056 (3.04 GB, this PC only), needs_owner 113 types 7,347, none at zero; `manifest.csv` and `CREDITS.md` committed | Done (Claude Code); the full run finished in D2c |
| Next session: resume the full run in foreground pieces of about 9 minutes (Claude Code's memory guard stops idle background runs); then commit `manifest.csv`, `CREDITS.md` and the owner's `labels.csv` with its counts | Done in D2c |
| Coordinator: the D2b open questions (garment type `costume` isn't a database value yet, search precision, the keep-list calls; the nine space suit models were settled in D2c) | To do |
| Owner: check the 57 launch types on the label-check page, started from a plain PowerShell window with the command in the D2b handoff (`--launch-only`); look closely at photos tagged "search" | Done: 4,146 decisions on 3,959 photos (56 types complete, undergarment 35 of 80), committed as saved |
| D2c+D4 (Claude Code): full download in 10 foreground pieces (`fetch_commons.py --max-minutes`): 13,744 photos for 729 types (5.09 GB, this PC only), 114 types at zero. Space suit keeps only itself (`specs.ONLY_ITSELF_ROOTS`): the nine particular suits dropped with their 628 photos; 1,758 types, 104 needs_owner, 843 in `vocabulary.json`. `auto_filter.py`: grayscale, sepia, page scans, unreadable; 1,757 auto_drop, `auto_filter.csv`; `labels.csv` merged with a `source` column (the owner's 4,146 rows unchanged, 1,253 auto rows). 10,515 photos kept. `split.py`: `split.json`, 8,483 train, 2,032 test (locked: never for the gallery or the linear layer), 219 thin types | Done (Claude Code) |
| Coordinator: the D2c+D4 open questions (hat, hoodie and jeans dropped whole and cap one by one, all 80 each, so these not-allowed launch types have no training photos; undergarment half checked; launch types thin after the owner's drops; the auto-filter's known misses) | Answered by the D2d prompt (the four undone, Openverse for the thin types); the auto-filter's misses still open |
| D2d (Claude Code): hat, hoodie, jeans and cap back to filter-only (`auto_filter.py --forget-owner`; 328 owner rows removed, every other one byte-identical; kept 0 → 69, 77, 78, 79). `fetch_commons.py` checks every saved photo decodes; `--verify` removed 2 of 13,744 (parka cut short, Ulster broken on Commons). `fetch_openverse.py` (cc0, by, by-sa, pdm; up to 80 kept-or-undecided per type; `openverse.csv`; Openverse part of `CREDITS.md`) written and tested, **not run**: anonymous is 20 a minute and 200 a day, the 27 short launch types need up to 666 calls. `review_server.py --types-with-new`. 13,742 photos, 10,818 kept: 8,725 train, 2,093 test | Done (Claude Code); Openverse waits for the key |
| Owner: register Openverse once with the one-line PowerShell command in the D2d handoff (it saves the key to `H:\DziRent\secrets\providers.env` without showing it), then click the link in the verification email sent to support@dzirent.com; tell the coordinator | Done (the key worked in D2e: 100 a minute, 10,000 a day) |
| Next session (after the key): `fetch_openverse.py --max-minutes 8.5` in foreground pieces, then `auto_filter.py` and `split.py`; commit `manifest.csv`, `CREDITS.md`, `openverse.csv`, `auto_filter.csv`, `labels.csv`, `split.json`; report per-type counts and the types still under 20 | Done in D2e |
| Owner: check photos with `review_server.py --types-with-new` (command in the D2d handoff): first cap, hat, hoodie, jeans and undergarment; the 653 types after them have never been checked. For a not-allowed type, keep = this photo clearly shows the banned item | Done for cap, hat, hoodie, jeans and undergarment (352 rows, committed in D2e) |
| D2e+D4b (Claude Code): the owner's 352 label rows committed as saved. Openverse run once with the registered key (100 a minute, 10,000 a day): 122 API calls, 1,451 downloads from source sites, 1,358 photos for 28 launch types (`openverse.csv`, Openverse part of `CREDITS.md`); iNaturalist excluded after 45 parrot and fish photos (removed). `fetch_openverse.py` runs one run in pieces (`run_state.json`) and follows the headers' limits. `split.py` sticky (a committed photo keeps its side; D4's rule would have moved 39), owner photos train only, `oversample` per type. `ingest_own.py` (owner photos, no metadata, train only) written and tested, **not run** (see the owner row below). `augment.py` (Albumentations 2.0.8, MIT; in memory, train only, `--preview`). 15,100 photos, 11,967 kept: 9,639 train, 2,328 test. Under 20 kept: débutante dress 7, achkan 4, Nehru jacket 8, Anarkali Salwar Suit 8 | Done (Claude Code); owner photos wait for the owner |
| Owner: say whether the 32 photos in `H:\DziRent\vision-own` (Sherwani 17, kurta 15) are photos you took. They look saved from a web image search (named `images (N).jfif`, thumbnail sizes, no camera data), so they weren't added as license "owner". If you took them, say so and an agent runs `ingest_own.py`; if not, replace them with your own | To do |
| Owner: check the new Openverse photos with `review_server.py --types-with-new --launch-only` (command in the D2e+D4b handoff): 28 launch types, tagged "openverse". For a not-allowed type, keep = this photo clearly shows the banned item | To do |
| Coordinator: the D2e+D4b open questions (the 4 types still under 20, loose search names like "formal" and "trench", Openverse photos with people in them, the sticky split replacing D4's rule, oversampling for 555 types) | To do |
| V1a Color reader (Claude Code): GrabCut garment mask (OpenCV 4.14.0.94, no new model), light correction from a neutral background on the daylight locus, CIELAB clusters named from the xkcd survey's 949 names (CC0) and mapped to the apps' 15 values only, the model's "a photo of a <name> garment" prompts as a second opinion (`color_confidence`); "Checking your photos…" goes as soon as the result is in (website and apps). Sample listings: colors right 12 of 12 (old 8), sample photos 22 of 22 (old 13); verdicts, reasons, categories and non-color title words identical on all 92 photos and 12 listings. Not deployed: gcloud sign-in expired | Done (Claude Code); deployed 2026-11-19 inside `v1b.1` (`vision-00007-6s4`) |
| Owner: `gcloud auth login` on this PC, then an agent redeploys `vision` with V1a (the S1 command in the V1a handoff) and confirms `/health` (`v1a.1`) and the warm scan time | Done 2026-11-19: the owner signed in the account that owns project `dzirent`; V1a went live inside V1b's `v1b.1` (see the V1b handoff) |
| Owner: decide whether the apps' color list should grow (ivory/cream, gold, teal, khaki and the other names in the V1a handoff) | To do |
| Owner: phone and website test of the "Checking your photos…" fix (see the V1a handoff) | To do |
| V1b (Claude Code): backup bucket `gs://dzirent-vision-data-dzirent` (private, us-west1; 15,100 photos, 5.32 GB, the same as this PC, plus `manifest.csv`, `labels.csv`, `split.json` and the pins; `vision-runtime` reads). `data/vision/embed/build_pins.py` with the service's own model code: 843 text pins (`vocabulary.npz`, committed) and 8,094 gallery pins (train only, in the bucket, fetched by Cloud Build). Model-agreement check: 1,945 Openverse and search photos whose type isn't in their top 3 text pins are auto drops; 10,022 kept, 8,094 train, 1,928 test; 10 launch types under 20. Service `v1b.1`: type from text and gallery pins (agreement, confidence), the banned gate (rejected whatever the type), allowed only for a confidently agreed allowed type; `thresholds.json` from the train split (`banned_min` 0.60, `type_min_confidence` 0.70); new response fields; garment type `costume` (migration, `policy.json`); `vision_finish_scan` keeps the new fields. Locked test split: type top-1 51 %, 35 of 1,214 allowed photos allowed, **0 banned leaks** (`services/vision/eval/report-v1b.md`). Deployed `vision-00007-6s4`; CI green (run 44661969529) | Done (Claude Code); its migration was applied to `dzirent-server` in V2 |
| Owner: say whether an agent should apply the V1b migration (`20261119120000_v1b_costume_and_scan_type.sql`) to `dzirent-server`, so live scans keep the new type fields and `costume` is a database value there | Done 2026-11-20: applied in V2 (Part 0); two fresh live scans through `scan-listing` stored the type fields (see the V2 handoff) |
| Coordinator: the V1b open questions (allowed is rare at 2.9 %; name-only text pins score better than `also_called`; the model-agreement rule's 63 % loss on confirmed photos and the types it emptied; text in photos; suggestions vs `type`; gate false rejections; test photos lost) | To do |
| V2 (Claude Code): V1b migration applied to `dzirent-server`. Text pins from English names and English aliases (vocabulary `02fcb7ac…`); the model-agreement check loosened to "a pin of the photo's own mapping in its top 5": 930 of V1b's 1,945 drops kept again, 10,952 kept (8,827 train, 2,125 test, no photo changed sides), launch types under 20: 5. Linear head `linear.npz` (logistic regression, train split only, 6,655 augmented copies for the 549 types under 20 kept, L2 1e-6 by 5-fold cross-fitting, out-of-fold top-1 58 %). Service `v2.1`: final score 0.6 text + 0.1 gallery + 0.3 linear, agreement on the Dzirent mapping, two-tier gate (`banned_hard` 0.91 rejected, `banned_min` 0.10 review), six "text or poster" not-clothing policy rows (review, never allowed; migration written, not applied), thresholds from the train split. Locked test split (`report-v2.md`): 304 of 1,378 allowed-type photos allowed (V1b 35 of 1,214), mapping top-1 75 %, gate false rejections 8 (V1b 44), **1 banned leak** (an owner-kept "hat" group photo read as a boubou); `should-accept` 15 allowed, 17 review. CI green (run 44813657094); deployed `vision-00008-m4m` | Done (Claude Code); the leak and the V2 migration are open (rows below) |
| Owner: say whether an agent should apply the V2 migration (`20261120120000_v2_text_or_poster_policy.sql`, six not-clothing policy rows) to `dzirent-server`; scans don't need it | To do |
| Coordinator: the V2 open questions (the one banned leak and the cost of `type_min_confidence` 0.80; the gate's lower tier as the main review reason; the hood rule; the 930 restored photos, about 4 in 10 wrong in a sample; `vision_finish_scan` without `mapping`; suggestions vs `type`; text or poster unmeasured; thin types; the head's size) | To do |
| Vision data block (D1-D4, V1a, V1b, V2) | Closed 2026-11-20 with V2; the owner and coordinator rows above that are still To do carry over |
