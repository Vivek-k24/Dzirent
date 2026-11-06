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
| Done by: Codex (2A), Claude Code (2B, 2C), Antigravity (2D, 2E, 2F) | |
| 2A Environment wiring, guest mode, browse, search, listing detail | Done |
| 2B Sign-up gates, fit matching, studio pages, onboarding | Done |
| 2C Website fixes (guest gates, welcome modal, measurements, studio) | Done |
| 2D Website layout redesign, light default theme, guest gate fixes | Done |
| 2E Desktop docked filter panel, account menu, remove home piece count | Done |
| 2F Move My closet to top bar, vertical divider, account menu cleanup | Done |

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
| On-device item recognition (TinyCLIP) on iOS (stub, same as Android without the model) | To do |
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
| Done by: Claude Code (8A) | |
| 8A Vision service `vision` on Cloud Run (Marqo-FashionSigLIP, CPU PyTorch, `us-west1`, min 0 / max 1, no unauthenticated access); service accounts `vision-runtime` (no roles) and `vision-invoker` (invoker on `vision` only) | Done |
| 8A Database: pgvector, `photo_scans`, `listing_scans`, `policy_item_types`, `app_settings` (all three flags off), `request_scan`, duplicate-photo check, publish gate (blocks only while `vision_required` is on) | Done |
| 8A `scan-listing` Edge Function deployed with secrets `SCAN_LISTING_SECRET`, `VISION_URL`, `VISION_INVOKER_KEY_BASE64` | Done |
| Owner: put photos in `H:\DziRent\vision-test\should-accept` and `should-reject` (both were empty), then re-run `services/vision/eval/run_eval.py` | To do |
| Apps and website: run `request_scan` when photos change; show the verdict, reason, photo warnings and suggestions; insert new listings as paused before `vision_required` is turned on | To do |
| Admin review of `review` verdicts (`admin_decision`) | To do |
