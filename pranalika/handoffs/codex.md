# Codex handoff

Add one entry per session, newest at the top.

## 2026-10-31 - Step 3A: shared mobile data layer and backend fixes (by Antigravity covering Codex)

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

## 2026-10-31 - Step 1B: shop window functions, delete-account, sample data, tests, contract (by Antigravity covering Codex)

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

## 2026-10-30 - Step 1A completion: credentials and approved deployment

Done:
- Owner explicitly approved deploying the prepared `delete-listing` Edge Function.
  Deployed the unchanged committed source only to `dzirent-server`
  (`pwfzkyjeivadbtkfkdxr`): ACTIVE, version 1. Gateway JWT verification remains
  disabled as reviewed; the handler verifies the caller through Auth itself.
- Updated the backend README and resolved the earlier deployment blocker below.
- Loaded the corrected credentials into environment variables. CLI is linked only
  to `dzirent-server`. Refreshed the old public schema and only us_cities data with
  native pg_dump over its session pooler; the explicit source verification
  transaction reported read-only = on. Exported Storage policies and external
  Auth/event/Realtime dependencies with a READ ONLY psql script.
- Downloaded `delete-account` through CLI with explicit old project-ref into an
  ignored temporary directory; its source matches the existing snapshot. Root
  CLI link remained the new project. No old db push, db pull, repair, or writes.
  No connected tools were used to read the old project after the new restriction.
- No new migrations or data changes were needed. Step 1B was not started.

Files changed:
- `supabase/README.md`, `supabase/reference/schema.sql`,
  `supabase/reference/us_cities.sql`, `supabase/reference/snapshot_extras.sql`,
  and `pranalika/handoffs/codex.md`.

How it was verified:
- Retrieved the deployed function and confirmed its source exactly matches the
  approved committed source. Remote metadata: ACTIVE, version 1, verify_jwt false.
- Live POST with only the publishable key and no bearer token: HTTP 401,
  handler error `not_signed_in`.
- Live POST with an invalid bearer token: HTTP 401, handler error `not_signed_in`.
  No authenticated deletion or user/listing/file creation was performed.
- Linked `supabase db push --linked --yes`: remote database is up to date.
  Guest REST checks passed again: HTTP 401 on listings/profiles/us_cities and 11
  Austin city RPC results. Direct target DB query confirmed 32,363 cities.
- Parsed native city export and compared complete rowsets with the applied data
  migration: exactly equal, 32,363 rows. Native schema snapshot contains 20 tables
  and the Storage policies, Auth/event triggers and Realtime memberships exactly
  once; schema snapshot contains no row data.
- Independent local review found no schema drift: all 20 tables, 103 constraints,
  23 secondary indexes, 19 original function bodies and all source triggers,
  policies and publication memberships match the previous structural catalog.

Open issues:
- Both credential issues and the approved deployment are resolved.
- Live owner/cross-owner Storage deletion remains outside this small test scope;
  the four local handler checks from Step 1A remain the positive-path verification.

Requests:
- Coordinator: record the intentional Advisor exceptions listed in the original
  entry below in `pranalika/security-log.md`. No further owner action is needed
  for Step 1A.

## 2026-10-30 - Step 1A: dzirent-server schema

Done:
- Pulled `Preview` before work. Applied five migration files to `dzirent-server`
  (`pwfzkyjeivadbtkfkdxr`) using `supabase db push --db-url` and environment-loaded
  database credentials. All 20 public tables have RLS; no guest raw-table grants.
- Snapshotted the live old project's full public structure, policies, functions,
  triggers, indexes, checks, ACLs and Storage policies. Saved unchanged deployed
  `delete-account` source and only the 32,363 `us_cities` rows. No other application
  rows were read/exported. Direct old DB authentication failed, so read-only
  connected catalog/data queries supplied the snapshot. Never linked the CLI to
  the old project, and never ran old-project push/pull/repair/writes.
- Ported required workflows and RPCs with empty search paths and qualified names.
  `is_blocked` is an unexposed `app_private` policy helper. Other helpers/trigger
  functions have no anon/authenticated EXECUTE. Existing `rls_auto_enable` was
  preserved, its search path set empty, and client EXECUTE revoked.
- Owner-only profiles/listings/children; participant access for chats/messages/
  rentals; immutable declarations and append-only events/reports. A private
  conversation trigger validates the lender/listing without exposing the row.
- Created public `listing-photos` bucket with owner-only modifications under
  `{listing_id}/{random}.{ext}`. Guarded listing DELETE requires Storage API file
  cleanup first; a parent lock serializes metadata writes with deletion. Prepared
  an authenticated, caller-RLS `delete-listing` handler with retryable cleanup.

Files changed:
- `supabase/config.toml`, `supabase/.gitignore`, `supabase/README.md`.
- Five SQL migrations in `supabase/migrations/`.
- `supabase/reference/schema.sql`, `catalog.json`, `functions.sql`, `us_cities.sql`,
  and `reference/functions/delete-account/index.ts`.
- `supabase/functions/delete-listing/index.ts` and its README.
- `supabase/tests/guest_rest.py`, `supabase/tests/delete_listing.test.mjs`.
- This handoff only; unrelated existing web/tool/Claude changes are excluded.

How it was verified:
- First CLI push applied all five migrations. Second push: remote is up to date,
  zero pending migrations.
- Guest REST with only `SUPABASE_PUBLISHABLE_KEY`, no Authorization/user token:
  listings, profiles and us_cities each returned HTTP 401; `search_cities` with
  `Austin` returned 11 city results.
- Catalog query: exactly 32,363 cities, 20 public tables, all 20 RLS-enabled.
  All 18 public/private functions have empty search paths. Only search_cities
  allows anon EXECUTE; client EXECUTE is absent from all trigger functions.
- Four local deletion-handler checks passed: missing auth, foreign owner, 1001
  photos removed in batches before row deletion, and cleanup failure preserves
  the listing. No users, passwords, sample listings, devices or emulators created.
- Security Advisor results and intentional exceptions are recorded below.
- Gitleaks scanned supabase and this handoff with redacted output: no leaks found.
  `git diff --check` passed.

Open issues:
- Resolved in the follow-up: the new access token was loaded from the authorized
  secrets file, and CLI linking to `dzirent-server` succeeded. Earlier pushes used
  explicit target DB URLs; the linked push also reports up to date. The repo was
  never linked to the old project.
- Resolved in the follow-up above: the owner approved deployment after the initial
  automatic approval rejection. `delete-listing` is now deployed. It verifies the
  bearer token with `auth.getUser` and uses no service-role key. Raw DELETE while
  files remain is safely refused by the database guard.
- No owner-account Storage test was requested/run. The cleanup handler has local
  mocked checks; live owner/cross-owner CRUD remains for the later test step.
- Reference `delete-account` is snapshot-only. Future account deletion must clean
  listing-ID folders before deleting the auth user; the database guard prevents
  orphaning files through cascading deletes.
- Deferred to Step 1B, not installed: `listings_nearby`,
  `search_listings_similar`, `studio_rental_count`, `studio_reply_minutes`.
  Existing client cross-owner joins/photo paths need later client work.

Requests:
- CLI authentication and new-project linking are resolved.
- Coordinator: copy the following intentional Advisor findings into your owned
  `pranalika/security-log.md`. It was not edited because this session may commit
  only `supabase/` and this handoff.
  - INFO `rls_enabled_no_policy`: us_cities intentionally has no raw-table grants
    or policies; only the bounded city RPC can read it.
    [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
  - WARN `anon_security_definer_function_executable`: search_cities is the explicit
    guest exception; it returns only public city reference data with an empty
    search path and bounded prefix search.
    [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
  - WARN `authenticated_security_definer_function_executable`, five intentional
    RPCs: search_cities (raw cities denied), my_block_peer_ids (only caller's block
    relationships, including reverse blocks), record_accessory_declaration and
    record_listing_declaration (immutable audit inserts, caller ownership checks),
    set_conversation_dates (renter-only update through the validated RPC, no raw
    conversation UPDATE grant). Every account RPC rejects null auth.uid().
    [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Step 1B was not started.

<!--
## YYYY-MM-DD - short title
Done:
Files changed:
How it was verified:
Open issues:
Requests:
-->
