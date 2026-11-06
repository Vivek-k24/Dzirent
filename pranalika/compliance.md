# Compliance

Data inventory, outside services, store disclosure drafts and the gap list for Dzirent, as built on `Preview` at `62f50b5` (2026-11-06).

How this was made: every row comes from code, migrations or config read in the repo, from read-only queries on `dzirent-server` (schema, constraints, policies, row counts, setting values, log field names), the hosted Auth settings (Management API, read only), the Android release dependency tree, and the merged Android manifest. Nothing was changed. Where something could not be checked it says **unconfirmed**. This is an engineering inventory, not legal advice: the attorney decides how each law applies.

Who-can-see words used below:
- **Guest**: anyone, no account.
- **Signed-in**: any signed-in user.
- **Owner**: the person the data is about (or the listing's lender).
- **Other party**: the other person in a chat or rental.
- **Server**: database functions, Edge Functions and Dzirent staff through the Supabase dashboard (secret key). There is no admin app yet.

"Kept for": nothing in the database is deleted on a schedule. There is no `pg_cron` and no cleanup job, so "until deleted" means until the user, a listing deletion or an account deletion removes it. Supabase backups of deleted rows: plan and backup retention **unconfirmed**.

Account deletion (`supabase/functions/delete-account/index.ts`): refused (HTTP 409) while the user has an `active` rental. Otherwise it removes the photo folders of all the user's listings through the Storage API, then deletes the Auth user (`auth.admin.deleteUser`). Foreign keys then remove or keep rows as listed in the last column (checked with `pg_constraint` on the live database).

## 1. Data inventory

### 1.1 Account and sign-in (Supabase Auth)

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Email address | Sign-up form (web `apps/web/src/app/actions.ts` `authenticate`; mobile `DzirentRepository.signUp`) | `auth.users.email`, `auth.identities.email` / `identity_data`; also copied into `accessory_declarations.email` | Sign-in, password reset | Owner, Server | Required | Until deletion | Deleted from Auth. **The copy in `accessory_declarations` is kept** |
| Password | Sign-up form | `auth.users.encrypted_password` (hash, by Supabase Auth) | Sign-in | Server (hash only) | Required | Until deletion | Deleted |
| Sign-up metadata: display name, role, adult confirmation, city, approx lat/lng | Sign-up form; city and coordinates from the browse location (web cookie, already rounded) or a picked city (mobile: city centre from `us_cities`) | `auth.users.raw_user_meta_data` (keys seen live: `display_name`, `role`, `adult_confirmed`, `city`, `approx_lat`, `approx_lng`, plus Supabase's own `email`, `email_verified`, `phone_verified`, `sub`) | Creates the profile (`handle_new_user` trigger) | Server | Name and role required; city optional | Until deletion. It is not updated when the profile changes later | Deleted |
| Email verified flags, sign-in times | Supabase Auth | `auth.users` (`email_confirmed_at`, `last_sign_in_at`, `created_at`) | Auth bookkeeping | Server | Automatic | Until deletion | Deleted |
| Sessions: IP address, user agent, times | Every sign-in and token refresh | `auth.sessions` (`ip`, `user_agent`, `created_at`, `refreshed_at`), `auth.refresh_tokens` (52 sessions and 123 refresh tokens for 5 users on 2026-11-06) | Keep users signed in | Server | Automatic | Until sign-out or expiry. Hosted `sessions_timebox` and `sessions_inactivity_timeout` are 0 (no forced end) | Deleted |
| Session ID | Supabase JWT claim | Copied into `accessory_declarations.session_id`, `listing_declarations.session_id` | Audit of a declaration | Owner, Server | Automatic | Until deleted | **Kept** in the declarations |
| Auth audit events: action, user ID, email, user agent | Supabase Auth | Supabase log stream `auth_audit_logs` only. Not in Postgres: hosted `audit_log_disable_postgres = true`, `auth.audit_log_entries` has 0 rows | Security audit | Server | Automatic | Supabase log retention (see 1.12) | Kept until the logs expire |
| "I understand Dzirent only connects people" tick | Sign-up form (web `policy` checkbox, mobile `AuthScreens.kt`) | **Not stored anywhere** | Required to sign up in the apps | - | Required in the apps | - | - |

### 1.2 Profile and studio (`profiles`)

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Display name | Sign-up | `profiles.display_name` | Shown in chats and push titles; used as the studio name when there is none | Owner; Other party (chat); **Guest** too when the lender has no studio name (shop window `studio_name` falls back to the display name) | Required | Until deleted | Deleted |
| Role (renter, lender, both) | Sign-up, Settings | `profiles.role` | Lets lenders list | Owner, Server | Required (default `renter`) | Until deleted | Deleted |
| Adult confirmation | Sign-up tick | `profiles.adult_confirmed` (default false) | 18+ attestation | Owner, Server | Required in the apps; not enforced by the database (see 4) | Until deleted | Deleted |
| City ("City, ST") | Location setup or sign-up | `profiles.city`; copied to `listings.city` | "City, ST" in the top bar and on listings | Owner; Guest sees the listing's city | Optional (needed to list) | Until deleted | Deleted |
| Approximate coordinates | See 1.4 | `profiles.approx_lat`, `approx_lng` | Distance in whole miles | Owner, Server. Never returned to anyone else | Optional (needed to list) | Until changed or deleted | Deleted |
| Studio name, handle | Studio editor | `profiles.studio_name`, `studio_handle` | Identifies the studio | Guest (cards, listing page) | Optional (lenders) | Until deleted | Deleted |
| Studio bio, style tags, pickup area | Studio editor | `profiles.studio_bio` (200), `style_tags` (5 of 12, includes "Plus size", "Petite", "Maternity"), `pickup_area` (60) | Studio page | Signed-in (`get_studio`) | Optional | Until deleted | Deleted |
| Account creation month | Automatic | `profiles.created_at` | "Since Mon YYYY" on the studio page | Signed-in (month and year only) | Automatic | Until deleted | Deleted |
| Rental count, typical reply time | Computed from `rentals` and `messages` | Not stored (computed in `get_studio`) | Studio page | Signed-in | - | - | - |

### 1.3 Private profile (`private_profiles`)

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Body measurements: chest, waist, hips, shoulder, height, inseam (cm) | Measurements screen (web `measurements-editor.tsx`, mobile `BodyMeasurementsScreen.kt`) | `private_profiles.*_cm` | "Likely to fit you" (`fit_listings` reads them on the server) | Owner only; Server | Optional. No separate consent step today | Until deleted | Deleted |
| Fit profile (man or woman) | Measurements screen | `private_profiles.fit_profile` | Picks the fit rules | Owner, Server | Optional | Until deleted | Deleted |
| Style interests (9 cultural and Western styles) | Measurements screen, saved with the measurements (web `workflow-mutations.ts` action `measurements`, mobile `BodyMeasurementsScreen.kt`) | `private_profiles.style_interests` | Home rows ("for your style") and search suggestions | Owner, Server | Optional | Until deleted | Deleted |
| Activity last seen | `mark_activity_seen` | `private_profiles.activity_seen_at` | Notification dot | Owner | Automatic | Until deleted | Deleted |

### 1.4 Location

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Device location, Android | Google Play services fused location, `PRIORITY_BALANCED_POWER_ACCURACY`, permission `ACCESS_COARSE_LOCATION` only (`AndroidLocationService.currentPlace`) | Rounded on the phone to 2 decimals (`roundCoord`), then `profiles.approx_lat/lng` (signed in) or memory for this visit only (guest, `LocationSetup.kt`) | Distance | Owner, Server | Optional (a city can be picked instead) | See profile | Deleted |
| Device location, iPhone | Core Location, "when in use", `kCLLocationAccuracyKilometer`, one fix (`IosLocationService`) | Rounded on the phone to 2 decimals, then as Android | Distance | Owner, Server | Optional | See profile | Deleted |
| Browser location, website | `navigator.geolocation`, `enableHighAccuracy: false` (`shell.tsx`) | Sent unrounded to the Vercel route `/api/preferences`, rounded there to 2 decimals, then cookie `dzirent-location` (1 year) and, when signed in, `profiles.approx_lat/lng` | Distance | Owner, Server | Optional | Cookie 1 year; profile until changed | Profile deleted; cookie stays in the browser until it expires |
| Picked city | City search (`search_cities`) | City centre coordinates from `us_cities` stored as above | Distance | Owner, Server | Optional | As above | Deleted |
| Reverse geocoding | The rounded point is sent to the phone's geocoder (Android `Geocoder`, iPhone `CLGeocoder`) to get "City, ST" | Not stored by Dzirent | City label | Google (Android geocoder, device-dependent) / Apple | Optional | Their policies | - |
| Listing location | Copied from the lender's profile when the listing is created (web `listing-mutations.ts`, mobile `ListingEditor.kt`) | `listings.approx_lat/lng`, `listings.city` | Distance to the piece | Owner, Server. Guests see only `city` and whole-mile distance | Required to publish | Until the listing is deleted | Deleted with the listing |
| Caller's point per search | Sent with each shop window request (`p_lat`, `p_lng`) in the POST body | Not stored. Supabase API logs record the URL and query string, not the body (log field list checked) | Distance | Server, in passing | Optional | Not kept | - |
| Approximate place from the IP address | Cloudflare in front of Supabase | Supabase logs: `request.cf.city`, `region`, `country`, AS organisation; Edge Function logs also `postalCode`, `timezone` | Supabase's own logging | Server | Automatic | Supabase log retention | Kept until the logs expire |

How coarse 2 decimals is: 0.01° is about 1.1 km north-south and about 0.96 km east-west at Austin (30° N). The stored point is up to about 0.7 km (about 2,400 ft) from the real one, depending on latitude. Distances are always returned in whole miles and coordinates are never returned to anyone else. Rounding is done by the clients and by `handle_new_user` at sign-up. **Later profile updates are not rounded by the database**: a caller using the API directly could store an exact point.

### 1.5 Listings and photos

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Listing details: title, description, category, item type, garment type, size, price, price note, deposit note, retail value, styles, status, created date | Listing editor | `listings` | The listing | Guest when `active` (shop window); Owner always | Title and category required by the database; price required by both forms (`listing-form.ts`, `ListingForm.kt`); others optional | Until the lender deletes it | Deleted (cascade) |
| Server pause reason, review flag | Server | `listings.auto_paused_reason`, `ai_review_needed` | Photo check outcome | Owner, Server | Automatic | Until cleared or deleted | Deleted |
| Garment measurements | Listing editor | `listing_measurements` | Fit and the listing page | Guest | Optional | Until deleted | Deleted |
| Availability date ranges | Listing editor | `availability` | Date search, listing page | Guest | Optional | Until deleted | Deleted |
| Photo records: path, slot, order | Upload | `listing_photos` | Listing page | Guest | At least one photo to run a photo check ("Add a photo first") | Until deleted | Deleted |
| Photo files | Upload (see EXIF below) | Storage bucket `listing-photos` (public, 25 objects on 2026-11-06), path `<listing id>/<random>.jpg`. `storage.objects` also keeps `owner` (the uploader's account ID), size, type, times | Listing photos | **Anyone with the URL**, no sign-in (public bucket, decision of 2026-10-30). Owner can list and delete | Required | Until the photo or listing is deleted | Deleted by `delete-account` before the user is removed. CDN copies after deletion: **unconfirmed** |
| Photo metadata (EXIF, GPS) | Camera or gallery | See below | - | - | - | - | - |
| Original photos on the phone | Gallery or camera | App storage only: Android `filesDir/listing_photos/<user>` (`AndroidPhotoStore`), iPhone `Application Support/listing_photos/<user>` (`IosPhotoStore`). These are the original bytes, EXIF included | Drafts survive a restart | The phone's user | - | Until uploaded and pruned, "Start over", or the app is removed | Not touched by account deletion (on the phone) |
| Web listing draft | Listing editor | Browser IndexedDB `dzirent-listing-drafts` (compressed photos, no EXIF, and form fields) | Draft survives a reload | The browser's user | - | Until cleared | Stays in the browser |

EXIF and GPS, checked on each platform's upload path:
- **Website: removed.** `apps/web/src/lib/drafts.ts` `compressPhoto` draws the image on a canvas and exports a new JPEG (`canvas.toBlob`, quality 0.82, longest side 1600 px). Canvas output carries no EXIF. `listing-editor.tsx` calls it for every picked or captured file before upload; the server route (`listing-mutations.ts` `uploadPhoto`) accepts only `image/jpeg` up to 2.5 MB and checks the JPEG start bytes.
- **Android: removed.** `mobile/shared/src/androidMain/.../AndroidPlatformServices.kt` `AndroidImageCompressor.compressImage` decodes to a `Bitmap`, rotates it from the EXIF orientation, and writes a new JPEG with `Bitmap.compress` (quality 80, 1600 px), which writes no EXIF. `ListingPublisher.syncPhotos` calls it for every new photo before `uploadListingPhoto`.
- **iPhone: removed.** `mobile/shared/src/iosMain/.../IosPlatformServices.kt` `IosImageCompressor.compressImage` redraws the photo into a new image (`IosImages.kt` `uprightImage`, `UIGraphicsImageRenderer`) and encodes it with `UIImageJPEGRepresentation`. The source metadata is not copied. Same `ListingPublisher` path as Android.
- Verified by reading code only, not by uploading a GPS-tagged photo.
- **Not removed on the server.** Storage accepts any file the owner uploads through the API, so a caller who skips the apps can upload a JPEG with GPS. The vision service reads EXIF orientation only (`ImageOps.exif_transpose`) and stores nothing.

### 1.6 Photo checks and the vision service

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Scan record: status, verdict, reason, suggestions (category, colors, pattern, fabric, styles, title, description, quality), photo set hash, admin decision, error code, times | `request_scan`, the automatic re-check, `scan-listing` | `listing_scans` (9 rows) | Policy check and suggestions | Owner (RLS, also through Realtime), Server | Automatic for listings | **Every scan is kept** until the listing is deleted | Deleted with the listing |
| Per-photo results: blur, brightness, framing, worn-by-person probability, 768-number image fingerprint, label scores, warnings, decision, storage path | `vision_finish_scan` | `photo_scans` (16 rows) | Quality warnings; duplicate-photo check | Owner, Server. The fingerprint is compared on the server with every other lender's photos; only "matches another listing" comes back | Automatic | Until the photo or listing is deleted | Deleted |
| What the vision service receives | `scan-listing` | Cloud Run service `vision` (`us-west1`): listing ID, photo IDs, slots, public photo URLs. It downloads the photos itself (user agent `dzirent-vision`, seen in Storage logs) | Run the model | Server | - | Photos are held in memory for the request only. No disk, no database, no keys (`services/vision/app/main.py`) | - |
| What the vision service logs | Its own code | Cloud Logging: one line per scan, `scan photos=N verdict=X total_ms=T`. Uvicorn access log off (`--no-access-log` in the `Dockerfile`), `httpx` URL logging off | Operations | Server | - | Cloud Logging retention **unconfirmed** (`gcloud` needed a new sign-in) | Kept until the logs expire |
| Cloud Run request logs | Google Cloud | Request path, status, latency, caller address (the Supabase Edge Function, not the user) | Platform logging | Server | - | **Unconfirmed** | - |
| `scan-listing` and `send-push` logs | Edge Function code | Supabase function logs: counts, verdicts, durations, error codes only | Operations | Server | - | Supabase log retention | Kept until expiry |
| Server-to-server calls | `pg_net` from the database | `net.http_request_queue` (request body, deleted once sent; 0 rows) and `net._http_response` (the function's reply: push counts or scan ID). `pg_net.ttl` is 6 hours, but replies 21 hours old were still there at 23:35 UTC on 2026-11-06 | Calls `send-push` and `scan-listing` | Server | - | See left | Kept until pg_net removes them |

### 1.7 Suggestions and activity events

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suggestion outcome: field, policy label the suggestion came from, kept / cleared / edited | Mobile listing editor at publish (`ListingEditorState.outcomeEvents`, `logSuggestionEvents`); the website does not write it | `suggestion_events` (13 rows) | Measure suggestion quality | Owner, Server | Automatic | Indefinite | **Kept, `user_id` set to null** (`ON DELETE SET NULL`); `listing_id` set to null when the listing goes |
| Listing views, saves, chat starts | Mobile only: listing page opened (`MainScreens.kt`), save, start chat (`DzirentRepository.recordListingEvent`); the website does not write it | `listing_events` (`user_id`, `listing_id`, `type`, time; 16 rows) | No reader in the code or database today | Owner, Server | Automatic | Indefinite | Deleted (cascade) |
| Recent searches | Search screen | On the phone only: Android SharedPreferences `recent_searches_<user>`, iPhone NSUserDefaults | Recent search list | The phone's user | - | Until cleared | Stays on the phone |

### 1.8 Messaging, rentals and saved items

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Conversation: listing, renter, lender, requested dates, start time | `start_conversation`, `set_conversation_dates` | `conversations` | Chat | Both participants | - | Until a participant's account or the listing is deleted | **Deleted for both people** (cascade on `renter_id`, `lender_id` and `listing_id`) |
| Message text, sender, time | Chat | `messages` (up to 2000 characters, plain text in the database, readable by Server; in the Realtime publication) | Chat | Both participants, Server | - | Until deleted | **Deleted for both people**: the sender's messages cascade, and the whole chat goes with either account |
| Read receipts | `mark_conversation_read` | `conversation_reads.last_read_at` | Unread dot | Owner | Automatic | Until deleted | Deleted |
| Rental record: listing, renter, lender, status, dates, who changed it | Chat rental controls | `rentals` (0 rows; in the Realtime publication) | Rental tab, studio rental count | Both participants | - | Until deleted | Deletion refused while `active`; otherwise **deleted for both people** (cascade) |
| "Did the rental happen?" answer | Chat | `rental_outcomes` (`happened`, time) | Rental flow | Owner | - | Until deleted | Deleted |
| Saved pieces, saved studios | Save buttons | `saved_listings`, `saved_studios` | Saved tab | Owner | Optional | Until unsaved | Deleted (and removed from other users' Saved when a studio's account goes) |
| Live updates | Supabase Realtime | `realtime.subscription` holds each live subscriber's JWT claims while connected (0 rows at the check) | Live chat and scans | Server | Automatic | While connected | - |
| Chat safety tip dismissed (website) | Chat | Browser localStorage `dzirent-safety-<conversation id>` | Show the tip once | The browser's user | - | Until cleared | Stays in the browser |

### 1.9 Safety: blocks and reports

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blocks | `block_user` (by handle) | `blocks` (`blocker_id`, `blocked_id`) | Hide each other | Blocker (`my_blocked_users`); Server | Optional | Until unblocked | Deleted when either account is deleted |
| Reports: target type (user, listing, message), target ID, reason, details (500), time | `report_user`; web chat report (`workflow-mutations.ts`); mobile `DzirentRepository` report | `reports` (0 rows) | Moderation | Reporter, Server. No review tool exists | Optional | Indefinite | Reporter's reports: deleted. Reports about a deleted user: **kept, pointing to an ID that no longer exists** (no foreign key on `target_id`). A reported message is **not copied** into the report, so it disappears when its sender's account or the chat goes |

### 1.10 Declarations

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accessory declaration: full legal name, email, city, app version, IP address (first `x-forwarded-for` hop), user agent (400), session ID, version, time | `record_accessory_declaration` (mobile `ListingEditor.kt`; web `api/workflows/[...path]/route.ts` with `p_app_version = "web-1.0.0"`) | `accessory_declarations` (0 rows) | Signed attestation before listing accessories | Owner (RLS), Server | Required to list accessories | Indefinite | **Kept with legal name, email, IP, user agent and city; only `user_id` becomes null** |
| Listing declaration: listing, version, IP, session ID, time | `record_listing_declaration` (web `listing-mutations.ts`, mobile) | `listing_declarations` (0 rows) | Per-listing attestation for accessories | Owner, Server | Required for accessory listings | Indefinite | **Kept with IP**; `user_id` and `listing_id` become null |

On the website both calls run on the Vercel server, so the IP and user agent recorded are **Vercel's, not the person's** (the browser never calls these functions). On the phones they are the phone's public IP and `ktor-client`.

### 1.11 Push notifications

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Push token, platform (`android` / `ios`), first and last seen | Firebase on the phone, sent with `register_push_token` on every sign-in and app start (`Notifications.kt` `registerPush`) and when Firebase issues a new token (`DzirentMessagingService.onNewToken`) | `device_tokens` (1 row) | Deliver chat notifications | Owner, Server | Automatic for signed-in Android users with a Firebase build, whether or not notifications are allowed. Turning Messages off stops pushes but keeps the token | Until sign-out (`unregister_push_token`), Firebase reports it dead, or deletion. A token that is never used again stays: nothing expires it by `last_seen_at` | Deleted (cascade) |
| Notification settings | Settings > Notifications | `notification_settings` (`messages`, `show_message_text`) | Respect choices | Owner | Optional | Until deleted | Deleted |
| What Firebase receives per push | `send-push` | Google FCM: device token, `kind`, `conversation_id`, `recipient_id` (account ID), `title` ("New message from <studio or display name>"), `body` (message text only if "Show message text" is on; listing title and dates for new chats and date changes), `tag`; time to live 1 day. Phone numbers, emails, street addresses, map links and coordinates are left out (`app_private.push_safe_text`) | Delivery | Google | Optional | Google's policy | - |
| Signed-in user on the phone | `FirebasePush.setSignedInUser` | Android SharedPreferences `dzirent_push` (`signed_in_user` = account ID) | Show only this account's pushes | The phone's user | Automatic | Until sign-out | Cleared on sign-out |
| Firebase SDK identifiers | Firebase Messaging SDK | Firebase Installations ID and the app's Firebase IDs, sent to Google by the SDK (`firebase-installations`, `firebase-datatransport` in the release dependency tree). Exactly what the SDK sends was not captured: **unconfirmed** | FCM registration | Google | Automatic in Android builds with `google-services.json` | Google's policy | - |
| iPhone push | - | Off: `IosPushService` returns no token | - | - | - | - | - |

### 1.12 Request logs, IP addresses and device details

| Data item | Comes from | Stored in | Purpose | Who can see | Required | Kept for | On account deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase API logs | Every request to Supabase (data, RPC, Realtime, Storage) | Supabase `edge_logs`: client IP (`cf_connecting_ip`), Cloudflare city/region/country/AS organisation, TLS fingerprint (`ja4`), user agent, `x-client-info`, method, path, **query string**, account ID and JWT session ID, status | Supabase operations | Server | Automatic | Logs from 2026-10-30 (the project's first day) were still queryable on 2026-11-06, so at least 7 days. Plan limit **unconfirmed** | Kept until they expire |
| Supabase Auth logs | Sign-in, sign-up, refresh | `auth_logs`: IP (`remote_addr`), referer, path, account ID, email | Auth operations | Server | Automatic | As above | Kept until they expire |
| Supabase Storage logs | Uploads and every public photo view, guests included | `storage_logs`: IP, user agent, object path, uploader ID | Storage operations | Server | Automatic | As above | Kept until they expire |
| Supabase function and database logs | Edge Function calls; database warnings and errors | `function_edge_logs` (IP, postal code, time zone, user agent), `postgres_logs` (whether failed statements include values: **unconfirmed**) | Operations | Server | Automatic | As above | Kept until they expire |
| What the mobile apps send in headers | supabase-kt 3.0.3 with Ktor | `User-Agent: ktor-client` and `X-Client-Info: supabase-kt/3.0.3` (checked in the Supabase logs with values masked: 736 requests). **No app version, OS version or device model** in headers. iPhone: same shared client with the Darwin engine; no iPhone traffic in the logs, so **unconfirmed** | - | - | - | - | - |
| What the website sends | Vercel server (Node.js, `X-Client-Info: supabase-ssr/...`) for pages and actions; the browser directly for Realtime and photo loads | So Supabase sees Vercel's IP for most website work, and the visitor's IP and browser user agent for Realtime and photos | - | - | - | - | - |
| App version | `record_accessory_declaration` only | `accessory_declarations.app_version` | Declaration audit | Owner, Server | With the declaration | Indefinite | Kept |
| Website requests | Every visit to dzirent.com and dzirent.vercel.app | Vercel (functions in `pdx1`): IP, user agent, path. What Vercel stores and for how long: **unconfirmed** | Hosting | Vercel, Server | Automatic | **Unconfirmed** | - |
| Firebase delivery data | FCM | Google | Delivery | Google | Automatic | **Unconfirmed** | - |

### 1.13 Website cookies and browser storage

No third-party cookies, scripts, fonts or trackers: the font is served with the site (`@fontsource-variable/roboto`) and `package.json` has no analytics package.

| Name | Type | Set by | Holds | Lifetime | Needed for |
| --- | --- | --- | --- | --- | --- |
| `sb-<project ref>-auth-token` (may be split into `.0`, `.1`) | Cookie | `@supabase/ssr` (`proxy.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`) | Session access and refresh tokens | Library default: **unconfirmed** (`node_modules` not installed here) | Sign-in (strictly necessary) |
| `dzirent-location` | Cookie, httpOnly, SameSite Lax, Secure on https | `/api/preferences` | City and coordinates rounded to 2 decimals | 1 year | Browse nearby |
| `dzirent-dates` | Cookie, httpOnly | `/api/preferences` | Chosen rental dates | 1 year | Date chip |
| `dzirent-welcome` | Cookie, httpOnly | `/api/preferences`, `actions.ts` | "seen" | 1 year | Show the welcome once |
| `dzirent-auth-next` | Cookie, httpOnly | `actions.ts` | Page to return to after email confirmation | 1 hour, cleared in `/auth/callback` | Sign-up flow |
| `dzirent-web-settings` | Cookie (readable by scripts) and localStorage | `local-preferences.tsx` | Theme, distance unit, measurement unit, rental days, distance step | 1 year | Settings |
| `dzirent-measurement-unit`, `dzirent-desktop-filter-panel` | localStorage | `local-preferences.tsx`, `measurements-editor.tsx`, `shell.tsx` | Unit, panel open | Until cleared | Settings |
| `welcome_seen_<account ID>`, `setup_card_dismissed_<account ID>` | localStorage | `shell.tsx`, `onboarding.tsx` | "true" | Until cleared | Show once |
| `dzirent-safety-<conversation ID>` | localStorage | `chat.tsx` | "1" | Until cleared | Safety tip once |
| `dzirent-listing-drafts` | IndexedDB | `lib/drafts.ts` | Listing draft and compressed photos | Until cleared | Drafts |

### 1.14 Phone storage (apps)

| Where | Holds |
| --- | --- |
| Supabase session | `SettingsSessionManager` (supabase-kt): sign-in session on the phone |
| Android DataStore `settings`; iPhone NSUserDefaults | Theme, units, rental days, distance step |
| Android SharedPreferences `dzirent_prefs`; iPhone NSUserDefaults | Small flags (photo consent, tips, declaration, as noted in `AndroidDevice.kt`), recent searches per account |
| Android `filesDir/drafts`, iPhone `Application Support/drafts` | Listing draft JSON per account |
| Photo folders | Original photos, see 1.5 |
| Android backup | `android:allowBackup="true"` in `AndroidManifest.xml`: Android may copy app data, including the session and drafts, to the user's Google backup. No backup rules file limits it |

### 1.15 Reference data

| Table | Holds | Who can see |
| --- | --- | --- |
| `us_cities` | 32,363 public US city names and centre points | Through `search_cities` only (guests too) |
| `policy_item_types` | The item policy (114 rows) | Everyone |
| `app_settings` | Feature flags `vision_required`, `verification_required`, `payments_enabled` (all off) | Everyone |

### 1.16 Schema check (Phase 2)

Live schema on 2026-11-06 (`information_schema.columns`): 26 tables in `public`, all with RLS on. Every one is in the tables above: `accessory_declarations`, `app_settings`, `availability`, `blocks`, `conversation_reads`, `conversations`, `device_tokens`, `listing_declarations`, `listing_events`, `listing_measurements`, `listing_photos`, `listing_scans`, `listings`, `messages`, `notification_settings`, `photo_scans`, `policy_item_types`, `private_profiles`, `profiles`, `rental_outcomes`, `rentals`, `reports`, `saved_listings`, `saved_studios`, `suggestion_events`, `us_cities`. Every column is covered. The map below lists each table's columns exactly as the live schema has them (generated from `information_schema.columns` on 2026-11-06) and the section that describes them.

| Table | Live columns | Section |
| --- | --- | --- |
| `accessory_declarations` | `id`, `user_id`, `email`, `full_legal_name`, `declaration_version`, `app_version`, `city`, `ip`, `user_agent`, `session_id`, `created_at` | 1.10 |
| `app_settings` | `key`, `enabled`, `description`, `updated_at` | 1.15 |
| `availability` | `id`, `listing_id`, `start_date`, `end_date` | 1.5 |
| `blocks` | `blocker_id`, `blocked_id` | 1.9 |
| `conversation_reads` | `user_id`, `conversation_id`, `last_read_at` | 1.8 |
| `conversations` | `id`, `listing_id`, `renter_id`, `lender_id`, `created_at`, `requested_start`, `requested_end` | 1.8 |
| `device_tokens` | `token`, `user_id`, `platform`, `created_at`, `last_seen_at` | 1.11 |
| `listing_declarations` | `id`, `listing_id`, `user_id`, `declaration_version`, `ip`, `session_id`, `created_at` | 1.10 |
| `listing_events` | `id`, `user_id`, `listing_id`, `type`, `created_at` | 1.7 |
| `listing_measurements` | `id`, `listing_id`, `label`, `value`, `unit` | 1.5 |
| `listing_photos` | `id`, `listing_id`, `storage_path`, `position`, `slot` | 1.5 |
| `listing_scans` | `id`, `listing_id`, `status`, `verdict`, `reason`, `suggestions`, `photo_set_hash`, `admin_decision`, `error`, `created_at`, `started_at`, `finished_at`, `admin_decided_at` | 1.6 |
| `listings` | `id`, `lender_id`, `title`, `category`, `size_label`, `description`, `price_note`, `city`, `approx_lat`, `approx_lng`, `status`, `created_at`, `retail_value`, `deposit_note`, `item_type`, `price_usd`, `listing_styles`, `garment_type`, `ai_review_needed`, `auto_paused_reason` | 1.4, 1.5 |
| `messages` | `id`, `conversation_id`, `sender_id`, `body`, `created_at` | 1.8 |
| `notification_settings` | `user_id`, `messages`, `show_message_text`, `updated_at` | 1.11 |
| `photo_scans` | `id`, `scan_id`, `listing_id`, `photo_id`, `storage_path`, `slot`, `blur_score`, `brightness_score`, `framing_score`, `worn_probability`, `fingerprint`, `labels`, `warnings`, `decision`, `scanned_at` | 1.6 |
| `policy_item_types` | `key`, `label`, `kind`, `allowed`, `category`, `item_type`, `garment_type`, `style`, `policy_group`, `noun`, `looks_like`, `reason`, `prompts`, `position` | 1.15 |
| `private_profiles` | `user_id`, `chest_cm`, `waist_cm`, `hips_cm`, `shoulder_cm`, `height_cm`, `inseam_cm`, `activity_seen_at`, `updated_at`, `fit_profile`, `style_interests` | 1.3 |
| `profiles` | `id`, `display_name`, `role`, `city`, `approx_lat`, `approx_lng`, `adult_confirmed`, `created_at`, `studio_name`, `studio_handle`, `studio_bio`, `style_tags`, `pickup_area` | 1.2, 1.4 |
| `rental_outcomes` | `conversation_id`, `user_id`, `happened`, `answered_at` | 1.8 |
| `rentals` | `id`, `conversation_id`, `listing_id`, `renter_id`, `lender_id`, `status`, `start_date`, `end_date`, `updated_by`, `created_at`, `updated_at` | 1.8 |
| `reports` | `id`, `reporter_id`, `target_type`, `target_id`, `reason`, `created_at`, `details` | 1.9 |
| `saved_listings` | `user_id`, `listing_id`, `created_at` | 1.8 |
| `saved_studios` | `user_id`, `lender_id`, `created_at` | 1.8 |
| `suggestion_events` | `id`, `user_id`, `listing_id`, `field`, `label`, `action`, `created_at` | 1.7 |
| `us_cities` | `id`, `name`, `state`, `lat`, `lng` | 1.15 |

`storage` schema: `buckets` (1 bucket) and `objects` are covered (1.5). Internal to Supabase Storage and unused by Dzirent's code: `migrations` (Storage's own versions), `s3_multipart_uploads` and `s3_multipart_uploads_parts` (temporary S3-protocol uploads, 0 rows; the apps upload through the Storage API), `buckets_analytics`, `buckets_vectors`, `vector_indexes` (0 rows each), `bucket_lifecycle_states`, `lifecycle_abandoned_artifacts` (Storage features Dzirent doesn't use).

Other schemas:
- `auth`: covered in 1.1. The rest are Supabase Auth's own tables. `identities` has 5 rows, one per user. `one_time_tokens`, `flow_state`, `mfa_factors`, `sso_providers`, `saml_providers`, `oauth_clients`, `webauthn_credentials` and `scim_users` had 0 rows on 2026-11-06. MFA is switched on in the hosted settings but no app offers it.
- `net`: see 1.6.
- `realtime`: see 1.8. The `messages_*` partitions are broadcast messages: 0 rows, unused.
- `vault`: exactly four entries, `scan_listing_secret`, `scan_listing_url`, `send_push_secret` and `send_push_url` (names checked, values not read). No user data.
- `extensions.pg_stat_statements`: query statistics. Not inspected; the extension normally replaces values with placeholders.
- `supabase_migrations`: migration history.

Privileges checked live: `authenticated` can UPDATE `profiles.adult_confirmed`, `profiles.approx_lat` and `listings.approx_lat` (`has_column_privilege`), which is why gaps 6 and 7 exist.

## 2. Outside services

| Service | Receives | Why | Where it runs |
| --- | --- | --- | --- |
| Supabase (project `dzirent-server`) | Everything in section 1 that is stored on the server; request logs with IP | Database, sign-in, photo storage, live updates, Edge Functions | AWS `us-west-2` (decision of 2026-10-30); logs and CDN through Cloudflare |
| Vercel | Every website request (IP, user agent, pages), sign-in email and password in transit, uploaded photos in transit, unrounded browser location in transit to `/api/preferences` | Hosts dzirent.com; runs the website's server code | Functions in Portland (`pdx1`, `apps/web/vercel.json`); edge network worldwide |
| Google Cloud Run (project `dzirent`) | Public photo URLs, listing and photo IDs; downloads the photos | Photo checks (`vision`) | `us-west1` |
| Firebase Cloud Messaging (project `dzirent-17c88`) | Push tokens, account ID of the recipient, conversation ID, notification title and optional text; Firebase Installations IDs from Android phones | Push notifications | Google, location not chosen by Dzirent |
| Google Play services Location (Android) | Location requests on the phone (handled by Google Play services) | Approximate location | On the phone, with Google's services |
| Android `Geocoder` / Apple `CLGeocoder` | The rounded point | "City, ST" | Google or Apple services |
| Supabase built-in email | Email addresses for sign-up and password reset emails (no custom SMTP is set) | Auth emails | Supabase |
| Google (Android backup) | App data if the user has backup on (`allowBackup="true"`) | Phone backup | The user's Google account |
| Planned: Didit (P6A) | Government ID, face photo or selfie, date of birth, verification result | One-time ID verification | **Unconfirmed** until contracted |
| Planned: Stripe (P6B) | Payment cards, payouts, lender identity and tax details (Stripe Connect), rental amounts | Deposits and payments | **Unconfirmed** until set up |
| Planned: email service (P6C) | Email addresses, email content (receipts, reminders) | Transactional email | **Unconfirmed** |

## 3. Tracking and ads

Result: **no analytics, advertising or tracking SDK anywhere.**
- Android release dependency tree (`:androidApp:dependencies --configuration releaseRuntimeClasspath`, 2026-11-06): no `firebase-analytics`, no `play-services-measurement*`, no `play-services-ads*`, no Crashlytics, no Performance Monitoring, no third-party analytics. Present and worth disclosing: `firebase-messaging` 25.1.3, `firebase-installations` 19.1.2, `firebase-datatransport` 18.2.0 with `transport-backend-cct` 3.1.9 (Google's delivery logging transport used by Firebase SDKs), `play-services-location` 21.3.0, `play-services-cloud-messaging`, and `firebase-measurement-connector` 19.0.0 (an interface only; it does nothing without `firebase-analytics`).
- Merged Android manifest (last debug build): no `com.google.android.gms.permission.AD_ID`. Permissions: internet, network state, coarse location, camera, notifications, wake lock and the FCM receive permission.
- Website (`apps/web/package.json` and lockfile): no analytics, tag manager, pixel, error tracker or Vercel Analytics / Speed Insights package. Whether Web Analytics is switched on in the Vercel dashboard: **unconfirmed** (it needs a script the site doesn't include).
- iPhone: only the shared Kotlin code and Apple frameworks (`project.yml`); no third-party SDK.
- Vision service: `HF_HUB_DISABLE_TELEMETRY=1` and offline at run time (`Dockerfile`).
- Nothing is sold or used for advertising. `listing_events` and `suggestion_events` are first-party only.

## 4. Children and the 18+ rule

Today:
- Website sign-up needs the "I confirm I am 18 or older." checkbox (`apps/web/src/app/auth/page.tsx`, checked again in `actions.ts`), then sends `adult_confirmed: true`.
- The apps refuse sign-up without "I confirm I am 18 years of age or older" (`AuthScreens.kt`).
- The database stores it in `profiles.adult_confirmed` (default false, from `handle_new_user`).
- Nothing else checks it. No date of birth, no age signal, no store age API.
- A sign-up made straight through the Auth API without the flag gets `adult_confirmed = false` and can still use everything.
- A user can change their own `adult_confirmed`: the `authenticated` role has UPDATE on all `profiles` columns.
- Guests have no account and see listings only.
- No child-directed content and no collection meant for children.
- ID verification (V2.0, P6A) is the planned real check.

## 5. Security measures in place

| Measure | Where it lives |
| --- | --- |
| Row level security on all 26 public tables; owner-only policies; guests have no raw-table grants | `supabase/migrations/20261030232729_foundation_access.sql` and later migrations; checked live with `pg_class.relrowsecurity` |
| Shop window functions return safe fields only, no coordinates or other users' IDs, max 30 rows | `20261031010000_shop_window.sql`, `..._shop_window_fix.sql`, `..._parity_shop_window_gaps.sql` |
| Fixed empty search path on functions; internal helpers in `app_private`, not exposed; EXECUTE revoked by default | Migrations; `security-log.md` |
| Column-level UPDATE grants on `listings` and `rentals` (IDs and `auto_paused_reason` not writable by apps) | `foundation_access.sql`, `20261106040000_step8b_photo_policy.sql` |
| Private storage rules: only the listing's owner can list, upload, change or delete its photos; paths are `<listing id>/<random>.<ext>`, never user IDs; listing delete refused while photos remain | `foundation_access.sql`, `20261030232953_photo_cleanup.sql` |
| Edge Functions check the caller in code: `delete-account` and `delete-listing` verify the JWT; `send-push` and `scan-listing` need a 32-byte shared secret from Vault, compared in constant time | `supabase/functions/*/index.ts`, `supabase/config.toml` |
| Keys: apps hold only the publishable key, from build environment variables; server keys only in Edge Function secrets, Vault and `H:\DziRent\secrets\`; `google-services.json` kept out of the repo | `mobile/shared/build.gradle.kts`, `security-log.md`, `.gitignore` |
| Vision service: no unauthenticated access, one invoker service account, no keys, URL allow-list, size and pixel limits, no redirects, max 1 instance | `services/vision/app/fetch.py`, `config.py`, `security-log.md` |
| Google Cloud billing kill switch: $20 budget, Pub/Sub `billing-alerts`, function `stop-billing` | Google Cloud project `dzirent`, per `security-log.md`. Its source is in a local folder outside the repo (`H:\DziRent\billing-killswitch\`, not read). Not re-checked this session (`gcloud` needed a new sign-in) |
| Rate limits that exist: photo checks 20 per lender per hour and one at a time per listing (`request_scan`, `app_private.queue_scan`); Supabase Auth hosted limits `rate_limit_email_sent = 2`, `rate_limit_token_refresh = 150`, `rate_limit_verify = 30`, `rate_limit_otp = 30` (per hour for email, per 5 minutes per IP for the others, as described in `supabase/config.toml`); shop window pages capped at 30 | Step 8A/8B migrations; hosted Auth settings |
| No rate limit on messages, reports, chats, saves or sign-ups beyond Supabase Auth's own | - |
| Passwords: hosted minimum 8 characters; leaked-password protection on per `BOARD.md` Step 0 (not re-read from the API this session); refresh-token rotation on | Hosted Auth settings |
| Push text filter: no phone numbers, emails, addresses, map links or coordinates in notifications | `app_private.push_safe_text` (`20261104035948_step7a_push_notifications.sql`) |
| Publish gate and automatic re-check of changed photos (gate off until `vision_required` is on) | Step 8A/8B migrations |
| Encryption in transit: HTTPS for every service; Supabase, Vercel and Google encrypt stored data at rest (provider default, not configured by Dzirent) | Provider defaults |
| Not in place: CAPTCHA (`security_captcha_enabled = false`), email confirmation (`mailer_autoconfirm = true`), website security headers (`next.config.ts` sets none), MFA not offered in the apps | Hosted Auth settings, `apps/web/next.config.ts` |

## 6. Store disclosure drafts

Drafts for the owner and attorney. Items marked **[P6A]** change when ID verification goes live, **[P6B]** when payments go live.

### 6.1 Google Play Data safety

"Shared" follows Google's definition: transfers to service providers (Supabase, Vercel, Google Cloud, Firebase) are not sharing. Encrypted in transit: yes for every item (HTTPS). Deletable: users can delete their account in the app and on the website. The declarations and suggestion events are kept after deletion (gaps 1-2); the form must say so or the gap must be fixed first.

| Category | Data type | Collected | Shared | Required / optional | Purposes |
| --- | --- | --- | --- | --- | --- |
| Location | Approximate location | Yes | No | Optional | App functionality |
| Location | Precise location | No (coarse permission only; rounded to about 1 km before upload) | No | - | - |
| Personal info | Name | Yes (display name; full legal name for accessory lenders) | No | Required | App functionality, account management, fraud prevention (declaration) |
| Personal info | Email address | Yes | No | Required | Account management, app functionality |
| Personal info | User IDs | Yes | No | Required | Account management, app functionality |
| Personal info | Address | No. **[P6B]** may become yes (Stripe) | No | - | - |
| Personal info | Phone number | No | No | - | - |
| Personal info | Race and ethnicity, political or religious beliefs, sexual orientation | No. Style interests are fashion styles, not ethnicity (attorney to confirm) | No | - | - |
| Personal info | Other info | Yes: body measurements, fit profile (man/woman), role | No | Optional | App functionality (fit) |
| Financial info | Payment info, purchase history, credit score, other | No. **[P6B]** yes (Stripe) | **[P6B]** with Stripe | - | - |
| Health and fitness | Health info, fitness info | No. Body measurements are declared under "Other info" (attorney to confirm, see Washington below) | No | - | - |
| Messages | Emails, SMS or MMS | No | No | - | - |
| Messages | Other in-app messages | Yes | No | Optional | App functionality |
| Photos and videos | Photos | Yes (listing photos) | No | Optional (required to list) | App functionality |
| Photos and videos | Videos | No | - | - | - |
| Audio, Files and docs, Calendar, Contacts | All | No | - | - | - |
| App activity | App interactions | Yes (listing views, saves and chat starts in `listing_events`; suggestion outcomes) | No | Collected automatically (not optional) | Analytics, app functionality |
| App activity | In-app search history | No (recent searches stay on the phone; search terms are processed in the request and not stored) | No | - | - |
| App activity | Installed apps, other user-generated content, other actions | User-generated content: yes (listings, studio profile, reports, declarations) | No | Optional | App functionality, fraud prevention and security |
| Web browsing | Web browsing history | No | - | - | - |
| App info and performance | Crash logs, diagnostics, other | No | - | - | - |
| Device or other IDs | Device or other IDs | Yes (FCM push token; Firebase Installations ID through the SDK) | No | Collected automatically (registered on sign-in and app start, notification permission or not) | App functionality |
| **[P6A]** Personal info / Photos | Government ID, face photo, date of birth | Yes when ID verification is live (Didit) | With Didit as a service provider | Required for messaging and listing when `verification_required` is on | Fraud prevention, security, compliance |

Other answers: data is encrypted in transit (yes); users can request deletion (yes: in-app Settings > Delete account and website Settings; Play also needs a public web URL, see P1A); independent security review (no); app is not directed at children; no ads (`Contains ads: No`).

### 6.2 Apple privacy labels

Tracking: **no data is used to track** (no ads, no data brokers, no linking with other companies' data). All collected items below are **linked to the user** (they belong to the account).

| Category | Data type | Collected | Linked | Used for tracking | Purposes |
| --- | --- | --- | --- | --- | --- |
| Contact info | Name | Yes | Yes | No | App functionality |
| Contact info | Email address | Yes | Yes | No | App functionality |
| Contact info | Phone number, physical address, other | No. **[P6B]** address may become yes | - | No | - |
| Health and fitness | Health, fitness | No; body measurements under "Other data" (attorney to confirm) | - | No | - |
| Financial info | Payment info, credit info, other | No. **[P6B]** yes | **[P6B]** yes | No | **[P6B]** app functionality |
| Location | Precise location | No | - | No | - |
| Location | Coarse location | Yes | Yes | No | App functionality |
| Sensitive info | Sensitive info | No (attorney to confirm for style interests and the "Maternity" studio tag) | - | No | - |
| Contacts | Contacts | No | - | No | - |
| User content | Emails or text messages (in-app chat) | Yes | Yes | No | App functionality |
| User content | Photos or videos | Yes | Yes | No | App functionality |
| User content | Customer support | Not through the app: About opens an email to `support@dzirent.com` (`AppLinks.SUPPORT_EMAIL`). Owner to decide whether support emails count | - | No | - |
| User content | Other user content (listings, studio, reports, declarations) | Yes | Yes | No | App functionality |
| Browsing history | Browsing history | No | - | No | - |
| Search history | Search history | No (kept on the phone only) | - | No | - |
| Identifiers | User ID | Yes | Yes | No | App functionality |
| Identifiers | Device ID | No today (iPhone push is off). Yes once iPhone push is on (P8B) | Yes | No | App functionality |
| Purchases | Purchase history | No. **[P6B]** yes | **[P6B]** yes | No | **[P6B]** app functionality |
| Usage data | Product interaction | Yes (`listing_events`, `suggestion_events`, shared code runs on iPhone) | Yes | No | Analytics, app functionality |
| Usage data | Advertising data, other usage data | No | - | No | - |
| Diagnostics | Crash data, performance data, other | No | - | No | - |
| Other data | Other data types | Yes: body measurements, fit profile | Yes | No | App functionality |
| **[P6A]** Sensitive info / User content / Identifiers | Government ID, face photo, date of birth | Yes when ID verification is live | Yes | No | App functionality (fraud prevention) |

The iPhone app also needs a privacy manifest (`PrivacyInfo.xcprivacy`) before submission (gap 17).

## 7. Rules to features

Laws named here are the compliance plan's list; how each applies is for the attorney.

| Rule | What the platform does today | Gap | Phase |
| --- | --- | --- | --- |
| App store rules (Google Play, Apple) | Account deletion in the app (Android and iPhone Settings) and on the website; report and block for users, listings and messages; no ads or tracking; permission reasons in `Info.plist` and before each Android request; support email link (`support@dzirent.com`) in the apps' About screen and the website menu | No public deletion web page and no privacy policy URL; no Data safety form or privacy labels filed; no iPhone privacy manifest; no help center; no terms of use shown at sign-up | P1A (pages), P1B (help center, terms acceptance), P8A, P8B |
| Texas SB 2420 and Utah app store age laws | Self-attested 18+ checkbox only | No store age signals, no state list, no database enforcement | P2C |
| COPPA and Texas SCOPE Act | Not aimed at children; 18+ checkbox; guests have no account | No age check beyond the checkbox; no process for an account found to belong to a minor | P2C (age gate), P2B (suspend from admin), P1A (policy wording) |
| Texas TDPSA and other state privacy laws | Minimal data, no sale, no targeted ads; owner-only access; account deletion | No privacy policy; no "download my data"; declarations and suggestion events kept after deletion; no retention periods; no consent record for any sensitive data; no request process (access, correct, delete, appeal) | P1A, P3A, P3B, P1B |
| Washington My Health My Data | Body measurements stored privately, used only for fit | Body measurements might be "consumer health data" (bodily measurements); no separate consent or health data policy; the "Maternity" style tag could suggest pregnancy. Attorney to decide | P1B (explicit consent before saving measurements), P1A (consumer health data section if needed) |
| Biometric laws (Illinois BIPA, Texas CUBI, Washington) | No face recognition. Photos may show people; the vision service stores a general image fingerprint (768 numbers) per photo for duplicate checks, not a face template | Confirm with the attorney that photo fingerprints are not biometric identifiers; Didit (P6A) will process faces | P1A (policy wording), P6A |
| Breach laws, including New York SHIELD | RLS, secrets out of the repo, server keys in function secrets | No incident plan, no breach notification process, no monitoring or alerts, log retention unknown | P5B, P5A |
| DMCA | Report a listing exists | No copyright policy, no designated agent, no takedown or counter-notice process, no repeat-infringer rule | P1A (page), P2B (takedowns) |
| FTC fair dealing | Plain product rules in the README and apps; no payments, no hidden fees | No terms; no published listing and moderation rules; automatic pause reasons are shown, but no appeal path | P1A, P2B |
| ADA (website and apps) | Not audited | No WCAG 2.1 AA check | P4A, P4B |
| CAN-SPAM and TCPA | Only Supabase Auth emails (sign-up, password reset); no marketing email; no SMS | Auth emails come from Supabase's built-in sender; no physical address or unsubscribe for future non-transactional email; email confirmation is off, so emails can go to addresses nobody verified | P6C (email service and templates), P8C (email confirmation on) |
| Payments | None (product rule: users arrange payment themselves); `payments_enabled` off | Everything (Stripe Connect, deposits, tax, refunds, disclosures) | P6B, P6C |
| ID verification | None; `verification_required` off | Everything (Didit, consent, retention of ID data) | P6A |

## 8. Gaps found

Each gap has a suggested fix and the phase from the handoff plan.

1. **Accessory declarations outlive the account with personal data.** `accessory_declarations` keeps email, full legal name, IP, user agent and city after deletion (`user_id` set null). Fix: decide a retention period with the attorney, store only what the declaration needs, and remove or anonymize the rest on deletion and after the period. Phase: P3B (with the retention period stated in P1A).
2. **Listing declarations keep the IP after deletion.** Same as 1 for `listing_declarations.ip` and `session_id`. Fix: as 1. Phase: P3B.
3. **Website declarations record Vercel's IP and user agent, not the person's.** The website calls both declaration functions from its server. Fix: either pass the visitor's address explicitly from the Vercel route or stop collecting IP and user agent for declarations everywhere. Phase: P5A.
4. **No server-side metadata removal.** All three apps remove EXIF, but Storage accepts any JPEG from an owner who uploads through the API. Fix: re-encode or strip metadata on the server (a Storage trigger or the upload route), or check uploads in the vision service. Phase: P5A.
5. **Original photos with EXIF stay on the phone.** Android and iPhone keep the original picked or taken bytes in app storage until upload or pruning. Fix: store the compressed copy instead, or clean abandoned draft photos on a schedule. Phase: P3B.
6. **Coordinates are not rounded by the database after sign-up.** `profiles` and `listings` accept any precision from a direct API call. Fix: a trigger that rounds `approx_lat/lng` to 2 decimals on insert and update. Phase: P5A.
7. **18+ is a self-attested checkbox the user can undo.** `adult_confirmed` is not enforced and the user can update it. Fix: make it server-written only, block accounts without it, add the store age signals and state list. Phase: P2C.
8. **Terms acceptance is not recorded.** The "Dzirent only connects people" tick is required but not stored, and there are no terms yet. Fix: store terms version and time at sign-up on all three platforms. Phase: P1B.
9. **Body measurements are saved without an explicit consent step.** Fix: explicit consent before the first save, and a statement on how they are used. Phase: P1B.
10. **Deleting an account deletes the other person's chat and rental history.** `conversations`, `messages` and `rentals` cascade on either participant. The privacy policy must say so, or the product should keep the other person's copy with the deleted user anonymized. Phase: P1A (disclose); unassigned for a change (suggested P3B).
11. **Reports lose their evidence.** A report stores only the target ID; the reported message disappears when its sender's account goes, and reports about deleted users point to nothing. Fix: snapshot the reported content and the target's handle into the report, kept for a set period. Phase: P2B.
12. **No way for staff to review reports or photo checks.** Only the Supabase dashboard. Phase: P2B.
13. **No download-my-data.** Phase: P3A.
14. **History that grows forever.** Every `listing_scans` and `photo_scans` row is kept until the listing is deleted; `listing_events` (which nothing reads) and stale `device_tokens` are never removed; `auth.sessions` have no time limit; `pg_net` replies outlive their 6-hour TTL. Fix: retention jobs, and stop writing `listing_events` until it has a use. Phase: P3B.
15. **Log retention and contents are unknown.** Supabase logs keep IP, approximate place, user agent, account ID and query strings for at least 7 days; Vercel and Cloud Logging retention were not checked. Fix: record each provider's retention in the account inventory, set the shortest workable period, and state it in the privacy policy. Phase: P3B (log retention), P5B, P7B.
16. **`send-push` puts IDs and tokens in URLs.** It reads tokens with `user_id=eq.<id>` and deletes dead tokens with `token=eq.<token>` in the query string, which Supabase API logs record (field `request.search`). From code; no such request was in the logs window. Fix: move both to an RPC with the values in the body. Phase: P5A.
17. **No iPhone privacy manifest.** `PrivacyInfo.xcprivacy` is missing; the app uses NSUserDefaults, a required-reason API. Phase: P8B.
18. **Android backup includes the session and drafts.** `android:allowBackup="true"` with no backup rules. Fix: `dataExtractionRules` / `fullBackupContent` that leave out the session, drafts and photos (or `allowBackup="false"`). Phase: P5A.
19. **Email confirmation off; Auth `site_url` is `http://localhost:3000`; no custom SMTP.** Anyone can sign up with someone else's address, and email links may point to localhost. Fix: set `site_url` to dzirent.com, add an email service, turn confirmation on. Phase: P6C (email service), P8C (confirmation on, `site_url`).
20. **No bot check, no message or report rate limits, no website security headers.** Phase: P5A.
21. **Password length differs.** Hosted minimum is 8, but the apps say "at least 6" (`auth/page.tsx` `minLength={6}`, `AuthScreens.kt`). Fix: align the clients with 8. Phase: P5A.
22. **Chat text is unfiltered.** Phone numbers, emails and addresses are kept out of pushes but not out of messages, listings or profiles. Phase: P2A.
23. **Photos of people.** The vision service estimates whether a person wears the piece, and photos may show faces. There is no nudity check, and fingerprints are stored for every photo. Fix: the P2A nudity check, and attorney confirmation that fingerprints are not biometric data. Phase: P2A, P1A.
24. **Public photos stay at their URL.** The bucket is public and photo views by anyone are logged with IP. Deleted photos may stay in the CDN cache for a while (unconfirmed). Fix: disclose in the privacy policy; check the cache behaviour. Phase: P1A (disclose), P3B (orphan photos).
25. **Display name visible to guests.** A lender without a studio name shows their display name on public cards. Fix: disclose, or require a studio name before listing. Phase: P1A (disclose); unassigned for a change (suggested P2A).
26. **Possible sensitive inferences.** Studio style tag "Maternity" and cultural style interests. Fix: attorney review for TDPSA and Washington. Phase: P1A.
27. **No cookie notice.** The website sets only first-party necessary and preference cookies (1.13). Fix: a cookie section in the privacy policy; a banner is not needed while nothing else is added (attorney to confirm). Phase: P1A.
28. **Firebase SDK data not documented.** `firebase-installations` and `firebase-datatransport` send identifiers and delivery data to Google. Fix: name them in the privacy policy and Data safety form. Phase: P1A, P8A.
29. **Not audited for accessibility.** Phase: P4A, P4B.
30. **Google Play needs a public account deletion URL.** Deletion exists inside the website's Settings only. Phase: P1A (delete-account page).
31. **Some providers could not be checked this session.** Cloud Logging retention and the billing kill switch (`gcloud` needs an interactive sign-in), the Vercel Web Analytics setting, Supabase backup retention, and the leaked-password setting through the API. Fix: re-check and record in the account inventory. Phase: P7B (P5B for log retention).
32. **Sample listings are owned by test users in what becomes production.** The handoff plan already lists their removal. Phase: P3B.
</content>
</invoke>
