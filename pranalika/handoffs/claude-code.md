# Claude Code handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

## Step 7A - 2026-11-03 - Android push notifications

Done:
- Backend (migration `20261104035948_step7a_push_notifications.sql`, applied with `supabase db push`):
  - `device_tokens` (token unique, user, platform, created and last-seen times) and `notification_settings` (Messages default on, "Show message text" default off). Owner-only RLS, explicit grants (new tables get no Data API grants by default since 2026-10-30), both removed with the account.
  - `register_push_token(p_token, p_platform)` (moves a token to whoever signed in on that phone last) and `unregister_push_token(p_token)`.
  - Triggers on `messages` (new message: the other participant), `conversations` insert (new chat: the lender) and requested-date changes (the other participant) call `app_private.queue_push`. It skips blocked pairs (either direction), recipients with Messages off or no registered phone, and words the push: "New message from <name>" (text only if "Show message text" is on), "New chat from <name>" (listing and dates), "New dates from <name>" ("Nov 5 - 8 · listing"). Text that looks like a phone number, email or street address, map link or coordinates is left out entirely. A push problem never blocks the message or chat itself.
  - `pg_net` (in `extensions`) posts to `send-push` with the shared secret. The migration generates the secret inside the database (Vault `send_push_secret`) and stores the function address (Vault `send_push_url`).
- `send-push` Edge Function, deployed: checks `x-send-push-secret` against `SEND_PUSH_SECRET` (constant time), gets a Google access token from the server key (`FIREBASE_SERVICE_ACCOUNT_BASE64`), sends high-priority FCM HTTP v1 data messages (chat ID, per-chat tag `chat_<id>`, TTL one day) to the recipient's Android tokens, and deletes tokens Firebase reports as unregistered or invalid. Logs counts only.
- Secrets: `SEND_PUSH_SECRET` (copied from Vault) and `FIREBASE_SERVICE_ACCOUNT_BASE64` (from the server key file) set with `supabase secrets set --env-file` through a temporary file in my scratch folder, deleted right after. Nothing printed or committed.
- Android: Firebase Messaging (BoM 34.19.0) in `androidApp` only. Gradle reads `google-services.json` from the path in `GOOGLE_SERVICES_JSON` and turns it into the string resources the google-services plugin would generate, using the Firebase app of each build type's application ID (`com.dzirent.app`, `com.dzirent.app.debug`). The file is never copied into the repo; `.gitignore` lists it. Release builds fail without it; a debug build without it builds with push off.
  - Token registered on sign-in and every app start while signed in, and on token refresh (`onNewToken`, using the one shared client `DzirentRepository.shared`). Sign-out and account deletion unregister and delete the token and clear shown notifications.
  - The app builds each notification from the data message in a "Messages" channel: one per chat (the tag), nothing for another account signed in on the phone, nothing while that chat is on screen (and opening a chat clears its notification). The lock-screen public version has the title only. A tap opens the chat.
  - Permission: asked only after the user's first message sent on the phone, after "Get notified when they reply". Declining is final; Settings > Notifications turns it on (system question once on Android 13+, then the phone's notification settings).
  - Settings > Notifications (signed in): Messages and "Show message text", saved to `notification_settings`.
  - iOS: `PushService` interface in common code with an iOS stub (`TODO`) only. `send-push` sends to Android tokens only.
- Release workflow writes `google-services.json` from the new GitHub secret `GOOGLE_SERVICES_JSON_BASE64` before building and sets `GOOGLE_SERVICES_JSON`.
- `decisions.md` (Notifications), `contract.md`, `security-log.md`, `BOARD.md` updated.
- Fixed while building: the Preview branch did not compile (Step 4C commit `fe61cfb`): `BlockedProfile` didn't exist (now `Profile`), `BrowseSession` called the repository's member extension `toListing()` from outside (now `with(repository)`) and `PrivateProfile()` without its `userId`, and `Home.kt` duplicated `Listing.availabilityWindows()` from `Fit.kt` (copy removed). Minimal edits only.
- Before starting: the uncommitted changes were one extra trailing blank line in `supabase/seed/list_listings.mjs` and `sample_photos.mjs`; identical to `origin/Preview` ignoring whitespace, so discarded.

Files changed:
- `supabase/migrations/20261104035948_step7a_push_notifications.sql` (new), `supabase/functions/send-push/index.ts` (new), `supabase/config.toml`, `supabase/tests/step7a_push.mjs` (new)
- `mobile/gradle/libs.versions.toml`, `mobile/androidApp/build.gradle.kts`, `mobile/androidApp/src/main/AndroidManifest.xml`, `mobile/androidApp/src/main/java/com/dzirent/app/MainActivity.kt`
- `mobile/androidApp/src/main/java/com/dzirent/app/push/FirebasePush.kt`, `ChatNotifications.kt`, `DzirentMessagingService.kt` (new), `mobile/androidApp/src/main/res/drawable/ic_notification.xml` (new, logo mark in white)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/Push.kt` (new), `platform/Device.kt`, `ui/Notifications.kt` (new), `ui/DzirentApp.kt`, `ui/MainAppScaffold.kt`, `ui/ChatScreens.kt`, `ui/SettingsScreen.kt`, `repository/DzirentRepository.kt`, `model/Models.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidDevice.kt`, `ui/NotificationPermission.android.kt` (new)
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosDevice.kt`, `IosPlatformServices.kt`, `ui/NotificationPermission.ios.kt` (new)
- `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ChatPushTest.kt` (new)
- Step 4C compile fixes: `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BrowseSession.kt`, `util/Home.kt`, `repository/DzirentRepository.kt`
- `.github/workflows/android-release.yml`, `.gitignore`
- `pranalika/decisions.md`, `pranalika/contract.md`, `pranalika/security-log.md`, `pranalika/BOARD.md`, this file

What I ran:
- `google-services.json` lists both `com.dzirent.app` and `com.dzirent.app.debug` (checked package names only).
- Baseline `:androidApp:assembleDebug` on `dc9ca25`: failed with the Step 4C errors above. After the fixes `:shared:compileDebugKotlinAndroid` passed.
- `supabase db push --dry-run` (only the new migration pending), then `supabase db push --linked --yes`: applied.
- Read-only queries (`supabase db query --linked`): both Vault entries exist (secret 64 characters), `pg_net` 0.20.4, the three triggers exist, `device_tokens`/`notification_settings` grants have no `anon`, `push_dates_label` gives "Nov 5 - 8" and "Oct 30 - Nov 2", `push_safe_text` hides "(512) 555-0199" and "123 Main St" and keeps "Is this available Nov 5 - 8?".
- `supabase secrets set --env-file ...` (temporary file, deleted): 2 secrets set; `supabase secrets list` shows both names.
- `supabase functions deploy send-push --use-api --no-verify-jwt`: deployed.
- `node supabase/tests/step7a_push.mjs`: all passed.
  - `send-push` with a wrong secret: 401.
  - Test user 1's settings upsert (Messages on, text hidden) through the API.
  - Fake token registered for test user 1; user 1 reads it, user 3 reads none.
  - Test user 3 sent a message in their chat with user 1; the fake token was gone within the 60 s wait.
  - User 1 blocked user 3: user 3's message refused (403); user 3 changed the chat dates (allowed while blocked); after 20 s the second fake token was still there.
  - Unblocked; `unregister_push_token` removed the second token; no block left.
- `net._http_response` (read-only) for the test window: exactly one request, the message push: HTTP 200 `{"sent":0,"failed":1,"removed":1,"errors":["INVALID_ARGUMENT"]}`, so `send-push` ran, got a Google access token, reached Firebase, got the invalid-token reply and removed the token. Nothing was sent during the blocked step; the request queue is empty.
- Security Advisor: the only new finding is `register_push_token` (signed-in users can run an elevated function), logged with the reason.
- `:androidApp:assembleDebug :shared:testDebugUnitTest --continue` with `GOOGLE_SERVICES_JSON` set (JDK 21): BUILD SUCCESSFUL. Unit tests: 5 classes, 13 tests, 0 failures (`ChatPushTest` 2 new; `SmokeTest` ran live because the test-user variables were loaded).
- After marking the deprecated Firebase token calls (below), `:androidApp:assembleDebug` again: BUILD SUCCESSFUL, no warnings in the push code.
- `aapt2` on the debug APK: package `com.dzirent.app.debug`; manifest has `POST_NOTIFICATIONS`, `DzirentMessagingService` with `MESSAGING_EVENT`, and the Firebase default channel and icon; the Firebase string resources are present and `google_app_id` is the debug app's (compared in a script, not printed).
- No emulator or device used.

Not verified (needs the owner's phone):
- A real notification arriving, its wording on screen, the lock-screen version, the first-message prompt and system dialog, Settings toggles, tap-to-open, no notification while the chat is open, nothing after sign-out.
- The release workflow (needs the new secret below) and any iOS build.

Open issues:
- The owner must add the GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (base64 of `H:\DziRent\secrets\google-services.json`) before the next run of the Android release workflow; without it the workflow stops with an error.
- firebase-messaging 25.1 deprecated `getToken`, `deleteToken` and `onNewToken` in favour of registering with the Firebase installation ID. Firebase's HTTP v1 send docs still describe only token targeting, which `send-push` uses, so the app keeps the token calls (warnings suppressed with a comment). Move both sides when the installation ID route is documented.
- Phone test for the owner: sign in on the phone, send a first message (prompt appears once), have another account message you with the app in the background (notification, text hidden), turn on "Show message text" (text appears), open that chat (its notification clears, no new one while open), tap a notification (opens the chat), turn Messages off (nothing arrives), sign out (nothing arrives).
- Test data left on `dzirent-server`: one message "Step 7A push test" in the chat between test user 3 (renter) and test user 1 (lender). That chat had no requested dates and now shows Dec 14 - 16 from the blocked-step test; dates can't be cleared through the API, so I left them (no one-off SQL).
- `set_conversation_dates` does not check blocks, so a blocked renter can still change a chat's dates (no push is sent). Not changed here.
- The text filter is a heuristic: it errs toward hiding text (some ordinary messages with long numbers or street-like words lose their preview), and unusual address formats may not be caught.
- "New chat" fires when a renter opens a chat from a listing, before they type anything, as the task asked. With the per-chat tag, their first message replaces it.
- The migration stores the production function address in Vault. A local `supabase start` stack would call production with its own random secret and get 401 (harmless).
- Step 4C's handoff (Antigravity) says both builds passed, but the committed tree did not compile; fixed above.

Debug APK path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`

New GitHub secret:
- `GOOGLE_SERVICES_JSON_BASE64`

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
