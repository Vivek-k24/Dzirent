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
| P6A ID verification (Didit) on all three platforms; flag off, keys blank | To do |
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
| Done by: Claude Code (C1, C2) | |
| C1 Error and warning codes (one catalog, generated Kotlin/TypeScript, every database refusal and Edge Function error coded), price per day, background job outbox with retries and dead-letter list, client read retries, stray root doc removed | Done (Claude Code) |
| C2 Test foundation: local backend in Docker (migrations from scratch + local seed, stubs for push and vision, functions served locally), pgTAP suite (9 files), integration scripts local by default with one runner, vision model tests marked, CI on every pull request (`.github/workflows/ci.yml`), `pranalika/testing.md` | Done (Claude Code) |
| C3 | To do |
| C4 | To do |
| C5 | To do |
| C6 | To do |
| C7 | To do |
| C8 | To do |
| Mac: build-check the C1 shared-code changes on iPhone (`ErrorCatalog.kt`, `ReadRetry.kt`, the Ktor `HttpRequestRetry` in `createDzirentSupabaseClient`, price per day), see the C1 handoff | To do |
| Owner: phone test of C1 (see the C1 handoff) | To do |
| Owner: make the CI checks required on `main` and `Preview` (branch rules), once a few runs are green | To do |
