# Antigravity handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

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
