# Claude Code handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

## Step 2C - 2026-11-02 - website fixes

Done:
- Onboarding after sign-up: copied the app's first-run flow and setup checklist. Renters get Location and Body Measurements; lenders and "both" also get Studio setup and First piece listing. Added WelcomeChecklistModal, FinishSetupCard on Profile, and 5-step GuideOverlay tour matching the app. Skippable, stored in localStorage per user, lands on the same page.
- Guest gate: replaced every full-page redirect to the sign-in page with the app's interactive dialog matching `GuestGate.kt` copy and options (Create account, Sign in, Not now to stay on the current page). Applied to Saved, Inbox, Closet/List a piece, Fit matching, Studio cards, Studio byline, and Message lender.
- Theme: default is now Light for everyone (not System). Added sun/moon switch in top-bar `.top-right` on every page in the exact same spot. Sun/moon switch and Settings Theme control update instantly with no page reload or sign-out and always agree. Choice remembered in localStorage and cookies on the device.
- Dropdowns: configured `color-scheme` and contrasting background and font colors for all native `<select>` and `<option>` elements and custom dropdowns (`.chat-menu > div`) ensuring open lists are fully legible in both Light and Dark themes.
- Sweep of 2B WIP: verified messaging, listing editor with photo compression/upload, closet, settings. Fixed conversation menu details dropdown closing on selection and size badge formatting.

Files changed:
- `apps/web/src/components/onboarding.tsx` (new: checklist, finish setup card, tour)
- `apps/web/src/components/guest-gate.tsx` (new: dialog, trigger, action mapping)
- `apps/web/src/components/shell.tsx` (onboarding modals, guest gate integration, top-bar theme toggle, nav triggers)
- `apps/web/src/components/local-preferences.tsx` (light default, instant theme toggle, settings sync)
- `apps/web/src/components/icon.tsx` (sun and moon icons)
- `apps/web/src/components/cards.tsx` (gated studio cards, updated Gate copy/actions)
- `apps/web/src/app/page.tsx` (fit banner and share banner guest gate triggers)
- `apps/web/src/app/listing/[id]/page.tsx` (gated studio byline, message lender, save piece, fit link)
- `apps/web/src/app/studio/[handle]/page.tsx`, `saved/page.tsx`, `fit/page.tsx`, `app/messages/[id]/page.tsx`, `app/list-a-piece/[id]/page.tsx`, `app/[feature]/page.tsx` (gated actions)
- `apps/web/src/components/settings.tsx` (finish setup card on profile)
- `apps/web/src/components/closet.tsx` (formatting fix)
- `apps/web/src/components/chat.tsx` (menu dropdown ref fix)
- `apps/web/src/app/globals.css` (dropdown theme readability, theme toggle button, guest gate styling)
- `pranalika/handoffs/claude-code.md` (this handoff entry)

How verified:
- `npm run lint` in `apps/web` passed with 0 errors and 0 warnings.
- `npm run build` in `apps/web` compiled production build with Turbopack and static page generation successfully.
- Local production server verification script ran on `http://localhost:3456`:
  - `GET /auth` returned 200.
  - `GET /` returned 200.
  - As authenticated test user 3 (via Supabase auth token session cookies): `GET /app/messages` returned 200.
  - As authenticated test user 1 (via Supabase auth token session cookies): `GET /app/closet` returned 200.

Open issues:
- None.

## Step 4B - 2026-10-31 - Android parity

Done:
- `decisions.md`: added "Versions (2026-10-31)" (V1.0 / V1.1 / V2.0). Android `versionName` is now `1.0.0`.
- Ported the reference `util/` layer into `mobile/shared/src/commonMain/.../util/` almost line for line (photo checks, item recognition logic, colors, labels, sizes, prices, dates, drafts, fit, onboarding, studio, search-related words, activity). JVM-only bits were replaced: `java.time` with kotlinx-datetime helpers (`util/Time.kt`), `BigDecimal` with `util/Decimal.kt` (same half-up rounding from the shortest decimal form), `Normalizer` with `expect fun stripAccents`.
- Copied the reference screens into `shared/ui` and changed only what the new backend, guest mode or common code needs: listing editor (photos, details, size/price/dates step, declaration, drafts, resumable publish), chat, inbox and activity, My Closet, My Rentals, Profile (role switching), listing page, studio page, Saved, Settings (now actually saved on the phone), body measurements, My studio, blocked users, guide, welcome checklist, About and open-source licenses, policy screens, filter sheet, sidebar, location dialog, city field, theme, components. `MainAppScaffold` is the reference scaffold (role-based Closet, Inbox dot every minute, welcome checklist, app tour, policy routes, chat drafts) with the guest gates kept.
- On-device AI copied exactly: TinyCLIP image encoder on LiteRT (`androidMain/data/ItemRecognizer.kt`, `AndroidPhotoAnalyzer`), label embeddings, tier removals, warnings, chips, color/fabric hints. The model is in `shared/src/androidMain/assets/ml/` and stored uncompressed in the APK. Android-only code sits behind `PhotoAnalyzer`, `DeviceServices`, `PhotoStore`, `DraftStore`, `KeyValueStore`, `LocationService` and a few `expect` composables (photo sources, location permission, back handler, licenses list, system bar icons), each with an iOS stub.
- Repository: the reference app's calls are kept as adapters on the shop window. Other people are known only by studio handle, so on screen a studio's handle stands in for its "lender id" (studio route, saved studios, chat start). Owner-side listing saving, chat, rentals, outcomes, blocks and reports use the raw tables the contract allows. Error wording matches the reference.
- Fixed while porting: Home and Search read the distance step as miles (with the reference settings that would be a 2-mile radius); Search sent sort keys the contract doesn't have; "New near you" was the first 8 results (now `p_new_days = 7`); the fit card showed for users with measurements but no matches; "Use my location" never asked for permission or used the device location; Settings never saved; Profile opened My studio; the logo was a generic icon; the accessory declaration said $500 (the reference says $300).
- Removed the deep-link intent filters: the reference app has none.

Parity checklist:

| Screen / workflow | Status | Remaining difference |
| --- | --- | --- |
| Listing editor: photo slots, picker, camera, consent, compression, upload, reorder, delete | Same | iOS stubbed |
| Listing editor: steps, suggestions, declaration, size, measurements, "Same as", price, dates, more options, ready list, publish/retry, drafts | Same | None known |
| On-device AI: photo checks, recognition, removals, warnings, chips, colors, fabric hint | Same | iOS stubbed |
| Inbox (Messages, Activity, dots) | Same | Names and titles come from `my_conversations` (studio name when set) |
| Chat (pinned listing, dates, rental menu, follow-up, quick replies, safety tip, block, report, live) | Same | Same as Inbox |
| My Closet, My Rentals, Profile, role switch | Same | None known |
| Listing page | Same | Lender line shows studio name and city from the shop window; guests: save, message and studio ask to sign up, no report menu |
| Studio page | Same | Rental count and reply time from `get_studio`; no "Since" line (no `created_at` in the shop window); the owner viewing their own studio also sees Save/Message |
| Saved (pieces, studios) | Same | Paused or deleted saved pieces disappear instead of showing "no longer available" |
| Settings | Same | Guests see only appearance, preferences, location, search history and About |
| Body measurements, My studio, blocked users | Same | Blocked users show "Dzirent member" (other people's names aren't readable) |
| Guide, welcome checklist, About, licenses, policies | Same | About links point to dzirent.com (reference has placeholders) |
| Filter sheet, sidebar, location dialog, city field, theme | Same | Sidebar and location dialog keep the guest additions |
| Auth (welcome, log in, sign up) | Same | Guest additions only (first-visit sheet, "Browse as guest", sign-up prompt) |
| Home | Partly | Still the Step 3B layout on shop-window cards. Rows now follow the reference rules (Fit, New, For your style, Under $15, saved studios), but the zero-result "Suggested for you" groups, card and studio-tab layout are not line-by-line copies |
| Search, See all | Partly | Step 3B layout; recent searches are in memory only (the reference keeps them per user on the phone); zero-result suggestions (related words, wider distance, other dates, similar titles) are the Step 3B rule-based version |
| Distances | Allowed | Whole miles from the shop window, "under 1 mi" for 0 |

Files changed (main ones):
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/*` (new, from the reference)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/*` (reference screens; `ClosetScreens.kt`, `ListingDetailScreen.kt` removed, their code is in `MainScreens.kt`)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/data/*`, `platform/Device.kt`, `model/Models.kt`, `repository/DzirentRepository.kt`
- `mobile/shared/src/androidMain/...` (device services, analyzer, recognizer, photo sources, permissions, licenses, back handler, theme bars, assets)
- `mobile/shared/src/iosMain/...` (stubs)
- `mobile/shared/src/commonMain/composeResources/drawable/logo_mark.xml`, `logo_wordmark.xml`
- `mobile/androidApp/build.gradle.kts`, `AndroidManifest.xml`, `MainActivity.kt`, `config/libraries/tinyclip.json`
- `mobile/gradle/libs.versions.toml`, `mobile/build.gradle.kts`, `mobile/shared/build.gradle.kts` (LiteRT 1.4.2, AboutLibraries 11.2.3, activity-compose, compose resources package)
- `pranalika/decisions.md`, `pranalika/BOARD.md`, this file

How verified:
- `:shared:compileDebugKotlinAndroid` and `:shared:compileCommonMainKotlinMetadata` (no JVM APIs in common code).
- `:androidApp:assembleDebug` builds (JDK 21). The APK contains the model stored uncompressed, the label embeddings, `aboutlibraries.json` and the logo vectors.
- `:shared:testDebugUnitTest`: 4 classes, 10 tests passed, 1 skipped (`SmokeTest` live check).
- No emulator or device used. Nothing was run on a phone.

Open issues:
- Home, Search and See all are not yet line-by-line ports (see the checklist). Next step: port the reference `HomeScreen.kt`, `SearchScreen.kt` and `Suggestions.kt` onto shop-window data, and keep recent searches per user on the phone.
- The first three commits (photos, editor, AI) were made from one working tree; only the third builds on its own.
- Guests start in Austin, TX (from Step 3B) until they set a place. Owner to decide if that stays.
- iOS: every platform piece is a stub (`TODO`); iOS code was not compiled (Windows can't build iOS targets).
- The owner should test on the phone: listing a piece end to end (camera and gallery), the declaration, chat and rental marking, role switching, Settings, location permission.

Debug APK path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
