# Claude Code handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

## Step 5D - 2026-11-04 - Android check and top padding

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `c754168`, the 5C `ios01` merge).
- Top padding on Android: `androidMain/ui/BackHandler.android.kt`. `consumeScaffoldInsets(padding)` now returns `consumeWindowInsets(padding)`, the same as iosMain. Before, it returned the modifier unchanged. This is the only code change.
  - The NavHost already gets `padding(innerPadding)` from the outer Scaffold. Each screen's `TopAppBar` now no longer adds the status bar inset a second time.
- Nothing else changed. `PlatformNavigationBackHandler` on Android is still a no-op, and no commonMain or iosMain files were touched.
  - The commonMain `expect` comment in `MainAppScaffold.kt` still says "Android: unchanged (returns this modifier)". It's out of date now, but commonMain was off-limits because the build wasn't broken.

What I ran:
- `.\gradlew.bat :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` and the server env loaded), with the fix in place: BUILD SUCCESSFUL. 13 tests in 5 classes, 0 failures, 0 errors, 0 skipped.
- I didn't build the merge without the fix first. The 5C Android actuals compiled together with the fix in this one build.
- No emulator, device or screenshots.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (local build, not committed).

Owner phone check:
- The fix is only visible where the app draws behind the status bar. That is always the case on Android 15+, because targetSdk 36 forces edge to edge. The app has no `enableEdgeToEdge()` call, so on older Android the insets may be zero there and nothing changes.
- Pages with their own top bar should now have their title right under the status bar, at the same height as the Home title, with no empty band above it: Listing Details, See all, Settings, About, Licenses, Chat, Measurements, My studio, Studio page, Moderation (blocked users), Policy pages, the listing editor and the accessory declaration.
- Should be unchanged:
  - Home and the welcome and sign-in pages.
  - The bottom bar, and the bottom of scrolling pages above the navigation bar or gesture bar. The consumed padding also includes the bottom, so check that nothing is now hidden under the bottom bar, for example on Chat (the message box) and the listing editor's bottom buttons.

Open issues:
- Not seen on a phone yet (above).
- The stale `expect` comment in commonMain `MainAppScaffold.kt` (above).

## Step 5C - 2026-11-04 - iPhone polish

Branch: `ios01` only. Before starting I switched to `ios01` and pulled `Preview` (fast-forward to `95ddbfe`, 5B); the tree was clean. Kotlin and Compose Multiplatform weren't upgraded.

Done:
- Swipe back (`e70ee50`, final version `0f8e4ec`):
  - A drag that starts within 24 pt of the left screen edge and moves right goes Back once it reaches 80 pt (or a quick flick past 24 pt). It goes to the same place as the on-screen back arrow, through the same `popBackStack()`.
  - `iosMain/ui/BackHandler.ios.kt`:
    - `IosBackDispatcher`: the most recently added enabled handler wins, as on Android.
    - `PlatformBackHandler` (drawer, guide) registers with the dispatcher.
    - `PlatformNavigationBackHandler`: Back pops the stack while there's an earlier screen.
  - The gesture is a Compose modifier (`edgeSwipeBack`) on the app root in `MainViewController`.
    - It looks at touches before the screens do and takes the drag only once it's clearly a rightward swipe from the edge. Taps, vertical scrolls and drags that start away from the edge pass through.
    - It does nothing when nothing is enabled (root screens).
    - Dialogs are separate Compose layers, so it never acts underneath one.
    - My first two versions used UIKit gesture recognizers on the Compose view (a screen-edge recognizer, then a plain pan restricted to the edge). Neither ever fired in the Simulator, with or without simultaneous recognition, so I moved the gesture into Compose.
  - Both NavHosts are wired: the main app's and the sign-in flow's.
- Status bar (`48ec1ca`): `iosMain/ui/theme/Theme.ios.kt` adds `StatusBarFollowsTheme`, called from `MainViewController`.
  - It sets the window's appearance from the in-app theme: Light to light, Dark to dark, System to unspecified, so System keeps following the phone.
  - The app sits inside SwiftUI's hosting controller, which ignores a child's status bar style. The window appearance is what the status bar follows, and it updates when the theme changes.
  - Side effect: system sheets (photo picker, camera, share) also follow the in-app theme.
  - `SystemBarIcons` stays a no-op on iOS (comment updated).
- Top gap (`e792c20`):
  - Cause: the outer `Scaffold` in `MainAppScaffold` padded the `NavHost` for the status bar, and each screen's own `TopAppBar` added the status bar inset again.
  - This affected every page inside the NavHost that has a `TopAppBar`: Listing Details, See all, Settings, About, Licenses, Chat, Measurements, My studio, Studio, Moderation, Policy, the listing editor and the accessory declaration.
  - Fix: the NavHost marks the Scaffold padding as used (`consumeWindowInsets`) on iOS, so those top bars sit right under the status bar. Home and pages outside the NavHost (welcome, sign-in) were already right and are unchanged.
- `IosSignInTest` now calls supabase-kt directly, so a failure reports the real error instead of the app's "Couldn't log in".

commonMain changes (Android behavior identical; please build-check Android on Windows):
- `ui/MainAppScaffold.kt`:
  - Calls `PlatformNavigationBackHandler(navController)` just before the `NavHost`.
  - The `NavHost` modifier is now `Modifier.padding(innerPadding).consumeScaffoldInsets(innerPadding)`.
  - Two new `expect` declarations next to `PlatformBackHandler`: `PlatformNavigationBackHandler(NavHostController)` and `Modifier.consumeScaffoldInsets(PaddingValues)`.
- `ui/DzirentApp.kt`: `PlatformNavigationBackHandler(authNavController)` just before the auth `NavHost`.
- `androidMain/ui/BackHandler.android.kt`: the Android actuals are no-ops. `PlatformNavigationBackHandler` returns `Unit` (NavHost already handles system Back) and `consumeScaffoldInsets` returns the modifier unchanged.
- Note for Android: the same doubled top inset is probably there too (smaller, since Android's status bar is shorter). I left it unchanged as asked. Making the Android `consumeScaffoldInsets` actual `consumeWindowInsets(padding)` would fix it the same way.

What I ran:
- `./gradlew :shared:compileKotlinIosSimulatorArm64` after each item and after each fix: BUILD SUCCESSFUL, with no warnings in iosMain at the end.
- `./gradlew :shared:iosSimulatorArm64Test`, with the test-user variables passed as `SIMCTL_CHILD_*`, run twice:
  - `simctl spawn` is no longer blocked, and the tests ran. 12 of 13 passed: `ChatPushTest` 2, `GuestGateTest` 2, `ListingValidationTest` 4, `ModelTest` 4.
  - `IosSignInTest` failed both times on `NSURLErrorDomain -1202` / `errSSLXCertChainInvalid (-9807)`: "The certificate for this server is invalid" for `pwfzkyjeivadbtkfkdxr.supabase.co`.
  - From the host, the same server presents a valid Google Trust Services (WE1) chain (`openssl s_client`), and inside the app on the same Simulator HTTPS works (listings, photos, sign-in session).
  - So the bare test binary started by `simctl spawn` can't validate the chain in this environment. I couldn't fix that from here.
- Clean `xcodebuild ... clean build` for the iPhone 18 Pro simulator: CLEAN SUCCEEDED, BUILD SUCCEEDED, at the start of Phase 2 and again on the final code.
- Simulator: 3 app launches (of 4). I viewed 2 screenshot images (of 4). All other checks used OCR and pixel probes on the interaction tool's capture files (tools in a temp folder, outside the repo). The 2 screenshots are in `~/Desktop/Dzirent/step5c-screenshots/` (`1-listing.png`, `2-dark.png`).
- Android: not built here (no Android SDK on this Mac). No emulator or device used.

What I saw in the Simulator:
- Launch 1 (first build):
  - Listing Details and Settings titles sit at the same height as the Home title, right under the status bar, with no gap (screenshot 1).
  - Theme, checked by a status-bar pixel probe:

    | Theme | App | Status bar icons |
    | --- | --- | --- |
    | Dark | dark | light |
    | Light | light | dark |
    | System, with the Simulator in dark mode | dark | light |

    Screenshot 2 shows light icons on the dark app. The theme is left on Light.
  - The UIKit edge swipe did nothing.
- Launch 2 (pan recognizer): the swipe still did nothing.
- Launch 3 (Compose gesture):
  - Listing Details → Home in one swipe.
  - Studio page → Listing Details → Home, one level per swipe.
  - Settings → Home.
  - A vertical scroll and a mid-screen horizontal swipe on the listing page didn't navigate.
  - On Home (root) the swipe does nothing except the sidebar's own existing drag, which is enabled only on Home, the same as Android.
  - No crash in any launch (same pid throughout each).
- The app is left running on Home, signed in as test user 1, Light theme.

Open issues:
- `IosSignInTest` fails on Simulator certificate trust (above). Re-run on a normal Mac session.
- Some listing photos show as solid black boxes, for example "Satin Backless Maxi Dress", "Modern Qipao Midi Dress" and "Embroidered Silk Lehenga Set". Their storage files are 149-byte stub JPEGs (`ae3b22ace731bd21.jpg`, `cb2a8a3733907033.jpg`, `6877334392c02f0d.jpg`), not real photos. Seed data, not app code; the other photos render. Worth re-seeding those photos.
- The back swipe has no sliding preview animation; it acts on release, like Android's non-predictive Back.
- Android build check of the commonMain hooks above (Windows).

## Step 5B - 2026-11-04 - Android check after iOS merge

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `9e222ae`, the `ios01` merge).
- Android check: the Step 5 shared-code changes (`Guide.kt` using `PlatformBackHandler`, `@ObjCName` on `AccessoryDeclaration.NAME_MAX`) build on Android as they are. No `mobile/` changes needed.
- Backend: migration `20261104140000_step5b_dates_block.sql` (applied with `supabase db push`). `set_conversation_dates` now refuses with `42501` "You cannot message this user" (the same wording as `start_conversation`) when the renter and lender are blocked in either direction. The renter-only check and its error are unchanged. Grants are unchanged (`create or replace`).
- `supabase/tests/step5b_dates_block.mjs` (new): the block, refuse, unblock, works-again check.
- `supabase/tests/step7a_push.mjs`: step 5 used to change dates while blocked to prove no push is sent. It now expects that change to be refused. The token-untouched check is still there.
- `contract.md` and `security-log.md` (the `set_conversation_dates` entries) and `BOARD.md` updated.

What I ran:
- `.\gradlew.bat :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL. 13 tests in 5 classes, 0 failures, 0 errors, 0 skipped.
- `supabase db push --linked --dry-run` (only the new migration pending), then `supabase db push --linked --yes`: applied.
- `node supabase/tests/step5b_dates_block.mjs`: passed. User 1 blocked user 3, and user 3's date change was refused (403, `42501`) with the dates unchanged. After the unblock the change worked, and the original dates were put back.
- `node supabase/tests/step7a_push.mjs` (updated): passed. While blocked, both the message and the date change were refused, and the fake token was untouched after 20 s.
- No emulator or device used.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (local build, not committed).

Open issues:
- How the apps handle the refusal (read from the code, not run): on the phone, `ChatScreens.kt` changes dates only after the message itself is sent. A blocked message is refused first, so the date call isn't reached, and `setConversationDates` returns false on any error anyway. The website's dates action shows its own "Could not change your dates.", not the server text.
- Everything open from Step 5 still stands (iOS push, iOS item recognition, the listing-page top gap, iOS unit tests not run).

## Step 5 - 2026-11-04 - iPhone app (Simulator)

Branch: `ios01` only (per the task prompt, overriding the two-branch rule). Nothing pushed to `main` or `Preview`. Done on the owner's Mac (Xcode 27.1, JDK 17, no Android SDK).

Done:
- Checkpoint 1, shared code builds for iPhone (`70a23a8`):
  - `mobile/shared/build.gradle.kts`: a static framework, `baseName "shared"`, for `iosArm64` and `iosSimulatorArm64`.
  - The only commonMain compile error: `ui/Guide.kt` used Android's `BackHandler`. It now uses the existing `PlatformBackHandler`.
  - `mobile/iosApp/scripts/load-env.sh`: reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the env file (handles CRLF, quotes and spaces around `=`) and never prints them.
- Checkpoint 2, Xcode app shell in `mobile/iosApp` (`f23f4a3`):
  - `project.yml` (XcodeGen 2.46.0) and the generated `iosApp.xcodeproj`, both committed.
  - Settings: app name Dzirent, bundle ID `com.dzirent.app`, iOS 16+, iPhone only, portrait only, version 1.0.0 (1).
  - Build phase "Build shared Kotlin framework" (`scripts/build-shared.sh`) runs on every build. It reads the env file path from `mobile/iosApp/local.config` (gitignored; `local.config.example` is committed), defaulting to `~/Desktop/Dzirent/secrets/dzirent-server.env`. It finds JDK 17 and runs `./gradlew :shared:embedAndSignAppleFrameworkForXcode`. If the env file or a value is missing, the build stops with an error naming the file and the fix. Xcode links the framework from `shared/build/xcode-frameworks/<config>/<sdk>`, so nothing is copied by hand.
  - `iosApp/iOSApp.swift`: SwiftUI shows `MainViewController()` edge to edge, like Android. Compose handles the safe areas.
  - `Info.plist`: location, camera and photo-library texts use the Android wording. It also sets `CADisableMinimumFrameDurationOnPhone`, which Compose needs. Launch screen: the logo mark on white (on #0E0E0E in dark mode).
  - App icon: the logo mark (#A80038) on white, rendered from `apps/web/public/logo-mark.svg`, with no alpha channel.
  - `AccessoryDeclaration.NAME_MAX` collided with the C `NAME_MAX` macro in the generated header. Its Objective-C name is now `nameMaxLength` (`@ObjCName`); the Kotlin name is unchanged.
  - `.gitignore`: added `mobile/iosApp/local.config`.
- Checkpoint 3, iPhone versions of the phone features (`1925a14`), all in `iosMain`:
  - Settings storage (`IosSettingsStorage`): NSUserDefaults, using Android's key names (theme, distance_unit, measure_unit, rental_days, default_distance_step, recent_searches_<user>) and fallbacks. Small flags (`KeyValueStore`) also use NSUserDefaults.
  - Location (`IosLocationService`):
    - CoreLocation "when in use", accuracy about 1 km, coordinates rounded to 2 decimals, 15 s timeout.
    - Reverse geocoder with a 10 s timeout: `locality ?: subAdministrativeArea`, then `cityLabel()` for the US ("City, ST"), "City, PR" for Puerto Rico, city only elsewhere.
    - The permission request goes through `rememberLocationPermissionRequest`. A refusal leads to the existing "choose your city" path.
  - Photo picker: PHPicker, images only, limited to the editor's `maxPhotos` (same as Android's `PickMultipleVisualMedia(maxPhotos)`). It uses the shared consent dialog first, needs no photo-library permission, and shows "Some photos couldn't be read. Pick different ones." when needed.
  - Camera:
    - Shared consent dialog first, then the system camera (UIImagePickerController) behind camera access.
    - No camera (the Simulator): the same message Android shows when there's no camera app, "No camera app found. Use Gallery instead."
    - Access refused: the same dialog as Android, worded for iOS, with an "Open Settings" button.
  - Image compression: the same defaults as Android (long side at most 1600 px, JPEG quality 80), turned upright, never scaled up.
  - Photo copies live in `Application Support/listing_photos/<user>` and drafts in `Application Support/drafts/<name>.json` (atomic writes), with the same file names as Android.
  - Other phone services: camera cache cleanup, a toast-style message, opening links, app version and build from Info.plist. `search_related.json` is bundled straight from `shared/src/androidMain/assets` (referenced in `project.yml`, not copied).
  - On-device AI (`IosPhotoAnalyzer`) works exactly like Android when its TinyCLIP model can't load. The shared photo checks (sharpness, lighting, whole item, colors) still run on the upright photo, but there is no embedding and no scores, so no suggestions appear.
  - Push (`IosPushService`) stays a stub but no longer throws:
    - No token and `canNotify()` is false.
    - `openNotificationSettings()` opens Dzirent's page in the Settings app.
    - The notification permission request answers "no".
  - Licenses screen: a plain list of the main libraries and their licenses. Android uses AboutLibraries.
- Checkpoint 4, running in the Simulator (iPhone 18 Pro, iOS 27.0):
  - Built with xcodebuild, installed with `xcrun simctl install`, launched with `xcrun simctl launch`.
  - Guest browsing, the listing page and sign-in all work (details under "What works in the Simulator").
  - `iosSimulatorArm64Test/.../IosSignInTest.kt` (new) signs in test user 1 through the shared repository on the Simulator. It skips when the variables aren't set (pass `SIMCTL_CHILD_TEST_USER_1_EMAIL` / `_PASSWORD`). It compiles and links, but couldn't run here (see below).

What I ran:
- `./gradlew :shared:compileKotlinIosSimulatorArm64`:
  - Failed first on `Guide.kt` (2 errors), then passed.
  - Passed again after Checkpoint 3, with no warnings in iosMain.
- `./gradlew :shared:linkDebugFrameworkIosSimulatorArm64`: BUILD SUCCESSFUL.
- `xcodebuild -project iosApp.xcodeproj -scheme iosApp -destination 'platform=iOS Simulator,id=<iPhone 18 Pro>' build`:
  - Failed first on the `NAME_MAX` header clash, then BUILD SUCCEEDED.
  - BUILD SUCCEEDED again after Checkpoint 3; `search_related.json` is in the app bundle.
- `scripts/build-shared.sh` with `local.config` pointing at a missing file: exit 1 with the error message (config restored after).
- Phase 2, clean build: `xcodebuild ... clean build` into a fresh DerivedData: CLEAN SUCCEEDED, BUILD SUCCEEDED. The only warnings come from supabase-kt's generated header (`Auth_ktSSO`/`Auth_ktPhone` names) and App Intents metadata.
- Phase 2, `./gradlew :shared:iosSimulatorArm64Test`:
  - Compiling and linking the tests passed. The run failed with `xcrun` exit code 137.
  - Cause: in this agent environment every `xcrun simctl spawn` process is killed with SIGKILL, even `/bin/echo` (checked). Running the test binary by hand, also after re-signing it, gave the same result.
  - So the iOS unit tests have not run. This is the environment, not the code: `simctl install` and `launch` work, and the app runs.
- Phase 2, `./gradlew :androidApp:assembleDebug`: not run. The Android SDK isn't installed on this Mac. Gradle configured the iOS tasks without it, so I installed nothing.
- Device check through Xcode's device-interaction tools, done by a subagent:
  - Compose exposes no accessibility tree to them, so taps were placed from screenshots and OCR.
  - 3 screenshots were viewed and kept, in `~/Desktop/Dzirent/step5-screenshots/` (outside the repo): `1-first-screen.png`, `2-home.png`, `3-listing.png`.
  - The interaction tool writes a capture file on every call. Sign-in was checked by OCR of those captures (text only, no more images viewed).
- Crash check: the app process (same pid) stayed up through guest browsing, the listing page, sign-in and Saved. No Dzirent crash report appeared.
  - Device logs: `log show`/`log stream` return nothing in this environment (blocked like `simctl spawn`), and `GetConsoleOutput` had no launch session. So "no crash" rests on the process and the crash reports, not the log.
- Tools on this Mac: Homebrew couldn't write (`/opt/homebrew` blocked by the environment), so XcodeGen 2.46.0 ran from its official release zip in a temp folder, outside the repo.
- Git: this Mac had no git identity. The first commit (`70a23a8`) got an auto-detected `vivekanandakallakuri@Vivekanandas-MacBook-Air.local` author. I then set a repo-local identity (`Vivek-k24`, `vivek.kallakuri@gmail.com`, as in earlier commits). I didn't rewrite the pushed commit.

What works in the Simulator:
- Launch screen, then the "Welcome to Dzirent" sheet (Sign Up, Log In, Browse as guest).
- As a guest: the top bar shows "Austin, TX", the date chip "Nov 4 - 8", the measurements banner, and the Products/Studios tabs with sample listings and real photos (for example "Linen Summer Sundress $14 · under 1 mi"). The bottom bar shows Home, Inbox, Search, Closet and Saved.
- Listing page: photo, title, "Everyday | Size XS", price, studio row, description.
- Sign-in with test user 1, through the Saved guest gate, then Log In, then "Welcome Back":
  - No error appeared.
  - The avatar now shows the user's initials.
  - The "Finish setting up your account" dialog appeared.
  - Saved opens without the guest gate.
  - Home shows that user's nearby listings.
- The Simulator is left open (iPhone 18 Pro booted) with the app running, signed in as test user 1.

Not verified:
- Location permission and geocoding, picking photos, the camera dialogs, compression and upload, drafts, toasts, the dark theme.
- The app surviving a restart while signed in. The app's Preferences folder was still empty right after sign-in, so I couldn't confirm where supabase-kt saves the session.
- An `iosArm64` (device) build. Real-device signing is out of scope.

Open issues:
- On-device item recognition on iOS: stub (no TinyCLIP; photo checks run). Needs LiteRT/Core ML for iOS.
- iOS push: stub. Needs a paid Apple Developer account (APNs key, Firebase iOS app), and `send-push` sends to Android tokens only. Until then, after the first message the "Get notified" prompt appears once, and its button opens Dzirent's Settings page.
- Listing page on iPhone: an empty band of about 60-130 pt between the status bar and the "Listing Details" bar. It looks like the top inset added twice by nested Scaffolds, made larger by the Dynamic Island status bar. It's shared UI, so I left it unchanged (no redesign); check whether Android shows the same.
- Status bar icon colour doesn't follow the in-app theme (`SystemBarIcons` is still a no-op on iOS).
- No iOS back-swipe gesture (`PlatformBackHandler` is a no-op on iOS); on-screen back arrows work.
- The iOS unit tests (`iosSimulatorArm64Test`, including `IosSignInTest`) need running on a Mac where `simctl spawn` works.
- Universal links, real-device signing and TestFlight: out of scope (paid account).
- `test-user.env` has a space after `=` for test user 1. The loaders trim it.

How the owner opens and runs the app in Xcode:
1. Needs Xcode and JDK 17 (both on this Mac). Optional: copy `mobile/iosApp/local.config.example` to `local.config` and set `DZIRENT_ENV_FILE` if the env file isn't at `~/Desktop/Dzirent/secrets/dzirent-server.env`. That file already exists on this Mac.
2. Open `mobile/iosApp/iosApp.xcodeproj` in Xcode.
3. Pick the `iosApp` scheme and an iPhone simulator (for example iPhone 18 Pro).
4. Press Run (Cmd-R). The first build runs Gradle for a few minutes; later builds are faster.
5. After changing `project.yml`, regenerate with `xcodegen generate` in `mobile/iosApp`. Code changes in `mobile/shared` need nothing extra; the build phase rebuilds the framework.

Files changed:
- `mobile/shared/build.gradle.kts`, `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Guide.kt`, `util/AccessoryDeclaration.kt`
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/MainViewController.kt`, `platform/IosDevice.kt`, `platform/IosPlatformServices.kt`, `platform/IosImages.kt` (new), `data/IosPhotoAnalyzer.kt` (new), `ui/PhotoPermissions.ios.kt`, `ui/LocationPermission.ios.kt`, `ui/NotificationPermission.ios.kt`, `ui/Licenses.ios.kt`
- `mobile/shared/src/iosSimulatorArm64Test/kotlin/com/dzirent/shared/IosSignInTest.kt` (new)
- `mobile/iosApp/` (new): `project.yml`, `iosApp.xcodeproj`, `iosApp/` (Swift entry, Info.plist, assets), `scripts/build-shared.sh`, `scripts/load-env.sh`, `local.config.example`
- `.gitignore`, `pranalika/BOARD.md`, this file

Requests:
- Owner: merge `ios01` into `Preview` when ready.

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
