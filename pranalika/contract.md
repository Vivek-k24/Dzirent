# Contract

The functions and tables client apps may use, what each takes and returns, and who may call it (guest, signed-in, owner).

---

## 1. Shop Window RPC Functions

All shop window functions have an empty search path (`search_path = ''`), qualify all names, hide paused listings and blocked pairs in both directions, and never return coordinates or other users' account IDs. Distance is always returned in whole miles only.

### `browse_listings`
- **Who can call:** Guest and signed-in (`anon`, `authenticated`).
- **Inputs:**
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
  - `p_radius_miles` (double precision, default null): maximum distance in miles.
  - `p_query` (text, default null): text search over title and description (uses `pg_trgm` word similarity and substring matching).
  - `p_category` (text, default null): category filter ('Career & Professional', 'Occasion & Party', 'Cultural & Traditional', 'Everyday', 'Outerwear', 'Accessories').
  - `p_item_type` (text, default null): item type for accessories.
  - `p_garment_type` (text, default null): garment type ('top', 'trousers', 'suit', 'dress', 'skirt', 'saree', 'one_size').
  - `p_size` (text, default null): size label match (normalized or split on `/`, `,`, `|`).
  - `p_styles` (text[], default null): array of listing styles to match (`operator(pg_catalog.&&)` overlap).
  - `p_start_date` (date, default null): start date of requested rental window.
  - `p_end_date` (date, default null): end date of requested rental window (only listings available for the full range; since C3 also leaves out listings with booked days in the range: an accepted, awaiting-payment, paid or picked-up rental).
  - `p_min_price` (numeric, default null): minimum price per day, USD.
  - `p_max_price` (numeric, default null): maximum price per day, USD.
  - `p_new_days` (integer, default null): listings created within last N days (for "New near you").
  - `p_saved_only` (boolean, default false): signed-in only; returns caller's saved pieces.
  - `p_saved_studios_only` (boolean, default false): signed-in only; returns listings from studios the caller saved.
  - `p_sort` (text, default null): sort order ('nearest', 'newest', 'price_low', 'price_high', or relevance when query is present).
  - `p_limit` (integer, default 20, max 30): results per page.
  - `p_offset` (integer, default 0): paging offset.
- **Returns:** Table of listing cards:
  - `id` (uuid): listing ID.
  - `title` (text): listing title.
  - `price` (numeric): price per day in USD (C1; kept for installed apps, the same as `price_per_day`).
  - `distance` (integer): whole miles from caller, or null.
  - `city` (text): city label.
  - `category` (text): category name.
  - `cover_photo_path` (text): Storage path of lowest position photo.
  - `studio_name` (text): studio name or display name.
  - `studio_handle` (text): studio handle.
  - `price_per_day` (numeric), `price_unit` (text, always `'per_day'` for now) (C1).
  - `days` (integer) and `total` (numeric): with both `p_start_date` and `p_end_date`, the days in the range counting both ends (Dec 30 - Jan 2 is 4) and `price_per_day × days`; null otherwise (C1).

### `get_listing`
- **Who can call:** Guest and signed-in (`anon`, `authenticated`).
- **Inputs:**
  - `p_listing_id` (uuid): listing ID.
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
  - `p_start_date`, `p_end_date` (date, default null, C1): the dates the person chose.
- **Returns:** Table with one row (or empty if paused/blocked/not found):
  - `id` (uuid), `title` (text), `category` (text), `item_type` (text), `garment_type` (text), `size_label` (text), `description` (text), `price` (numeric), `price_note` (text), `deposit_note` (text), `retail_value` (numeric), `listing_styles` (text[]), `city` (text), `distance` (integer), `studio_name` (text), `studio_handle` (text).
  - `photos` (jsonb): array of `{ storage_path, position, slot }` in position order.
  - `measurements` (jsonb): array of `{ label, value, unit }`.
  - `availability` (jsonb): array of `{ start_date, end_date }` in date order.
  - `created_at` (timestamptz).
  - `price_per_day` (numeric), `price_unit` (text), `days` (integer), `total` (numeric): as in `browse_listings` (C1). `price` is the price per day.
  - `booked` (jsonb, C3): array of `{ start_date, end_date }`, the booked days from today on (rentals accepted, awaiting payment, paid or picked up). Never who booked them. Clients show them as unavailable in the request date picker.

### `get_studio`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:**
  - `p_handle` (text): studio handle.
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
- **Returns:** Table with one row:
  - `studio_name` (text), `studio_handle` (text), `studio_bio` (text), `style_tags` (text[]), `city` (text), `pickup_area` (text).
  - `rental_count` (integer): count of the lender's completed rentals (C3; before: active and returned).
  - `reply_minutes` (integer): median first-reply time across conversations in last 90 days (null if <3).
  - `is_saved` (boolean): whether caller has saved this studio.
  - `listings` (jsonb): array of up to 30 active listing cards from this studio.
  - `is_own` (boolean): true if caller is the studio owner, false otherwise.
  - `since` (text): studio creation date in month/year format ("Since Mon YYYY").

### `fit_listings`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:**
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
  - `p_radius_miles` (double precision, default null): radius in miles.
  - `p_limit` (integer, default 20, max 30): page limit.
  - `p_offset` (integer, default 0): paging offset.
- **Returns:** Table of listing cards matching caller's body measurements within category ease ranges (at least 2 matching body parts, porting Android `Fit.kt` logic).

### `my_conversations`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:**
  - `p_conversation_id` (uuid, default null): optional conversation filter.
  - `p_limit` (integer, default 20, max 30): page limit.
  - `p_offset` (integer, default 0): paging offset.
- **Returns:** Table of conversations:
  - `id` (uuid): conversation ID.
  - `listing_id` (uuid): listing ID.
  - `listing_title` (text): listing title.
  - `cover_photo_path` (text): cover photo path.
  - `price` (numeric): price in USD.
  - `other_name` (text): other participant's studio or display name.
  - `other_handle` (text): other participant's handle.
  - `last_message` (text): body of latest message.
  - `last_message_at` (timestamptz): timestamp of latest message.
  - `unread` (boolean): true if latest incoming message is newer than caller's read receipt.
  - `requested_start` (date): requested rental start date.
  - `requested_end` (date): requested rental end date.

### `my_saved_studios`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:**
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
  - `p_limit` (integer, default 20, max 30): page limit.
  - `p_offset` (integer, default 0): paging offset.
- **Returns:** Table of saved studios:
  - `studio_name` (text), `studio_handle` (text), `city` (text), `cover_photo_path` (text), `piece_count` (integer), `distance` (integer).

### `my_saved_listings`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:**
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
  - `p_limit` (integer, default 30, max 30): page limit.
  - `p_offset` (integer, default 0): paging offset.
- **Returns:** Table of saved listings:
  - `listing_id` (uuid), `is_available` (boolean), `title` (text), `price` (numeric), `distance` (integer), `city` (text), `category` (text), `cover_photo_path` (text), `studio_name` (text), `studio_handle` (text), `created_at` (timestamptz).
  - Paused or blocked listings return `is_available = false` and null for title, price, and other details.

### `my_blocked_users`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:** None.
- **Returns:** Table of caller's own blocked users:
  - `blocked_id` (uuid), `display_name` (text), `studio_name` (text), `studio_handle` (text), `city` (text).

### `save_studio` / `unsave_studio`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:** `p_handle` (text).
- **Behavior:** Resolves handle to lender without client needing lender account UUID.

### `block_user` / `unblock_user`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:** `p_handle` (text).
- **Behavior:** Resolves studio handle to user ID internally and adds or removes the block relationship in `blocks`. Never returns account IDs.

### `report_user`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:** `p_handle` (text), `p_reason` (text), `p_details` (text, default null).
- **Behavior:** Resolves studio handle to target user ID internally and inserts audit row into `reports`. Never returns account IDs.

### `start_conversation`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:** `p_listing_id` (uuid), `p_start` (date, default null), `p_end` (date, default null).
- **Returns:** `uuid` of new or existing conversation between caller and listing owner.

### `search_cities`
- **Who can call:** Guest and signed-in (`anon`, `authenticated`).
- **Inputs:** `p_query` (text, min length 2), `p_limit` (integer, default 20).
- **Returns:** Set of `us_cities` records (`id`, `name`, `state`, `lat`, `lng`).

### Audit & Utility RPCs
- `record_accessory_declaration(p_full_legal_name, p_declaration_version, p_app_version)`: Signed-in only.
- `record_listing_declaration(p_listing_id, p_declaration_version)`: Signed-in owner only.
- `set_conversation_dates(p_conversation_id, p_start, p_end)`: Signed-in renter only. Refused (`42501`, `DZ-E3005` "You can't message this user." since C1) when the two people in the chat are blocked in either direction, like sending a message (Step 5B).
- `mark_conversation_read(p_conversation_id)`: Signed-in participant only.
- `mark_activity_seen()`: Signed-in only.

### Push notifications (Step 7A)
- `register_push_token(p_token text, p_platform text)`: Signed-in only. Saves this phone's push token for the caller; `p_platform` is `'android'` or `'ios'`. A token saved for another account moves to the caller (the phone changed hands). Call on sign-in, on every app start while signed in, and when Firebase issues a new token. Returns nothing.
- `unregister_push_token(p_token text)`: Signed-in only. Removes the token if it is the caller's. Call before signing out. Returns nothing.
- Settings are the caller's own `notification_settings` row (table below). No row means Messages on, message text hidden and (C3) Rental reminders on.

### Terms acceptance and measurements consent (P1B part 1)
- `needs_legal_acceptance()`: Signed-in only. Returns `boolean`: true while the caller hasn't accepted the current version (`legal_documents`) of the Terms of Use or the Privacy Policy. Runs as the caller. The apps ask it after sign-in and when a saved session opens; while true they show only the "We've updated our terms" step (Agree or Sign out).
- `accept_legal(p_platform text)`: Signed-in only. Records that the caller accepts the current version of both documents; `p_platform` is `'web'`, `'android'` or `'ios'`. Accepting a version twice keeps the first row. Returns nothing. Call right after sign-up (the sign-up tick) and from the terms step.
- `give_measurements_consent()`: Signed-in only. Returns the consent time (`timestamptz`); keeps the first time if consent was already given. Needed before the first body measurement is saved.
- `withdraw_measurements_consent()`: Signed-in only. Deletes the caller's six body measurements and the consent time; fit profile and style interests stay. Returns nothing.
- Saving a body measurement (`chest_cm`, `waist_cm`, `hips_cm`, `shoulder_cm`, `height_cm`, `inseam_cm` set to a new value, by insert, update or upsert) without consent is refused: `P0001` "Give consent before saving your measurements." Clearing a measurement, and saving only `fit_profile` or `style_interests`, is always allowed. Apps can't write `measurements_consent_at` (a trigger keeps the stored value).
- Publishing a new terms or privacy version means a migration that updates its `legal_documents` row (the same version as `apps/web/src/content/legal/config.ts`); every user then accepts again.

### Text filter (P2A)
- Triggers check text when it is inserted or changes (a column that doesn't change is never checked, so old rows never block other updates):
  - `listings`: `title`, `description`, `price_note`, `deposit_note` (public text);
  - `profiles`: `display_name`, `studio_name`, `studio_handle`, `studio_bio`, `pickup_area` (public text);
  - `reports`: `reason` (`details` unfiltered since P2B).
  - `messages.body` is **not checked since P5A** (owner decision): no check and no logging. A chat message is never refused for its words.
- Language that isn't allowed (LDNOOBW English list, whole words after normalizing case, accents, repeated letters and swaps such as 0/o, 1/i or l, @/a, $/s) is refused in the fields above (not in chat messages since P5A). Contact details and outside links (phone numbers, email addresses, URLs, `@handles`) are refused only in listings and profiles; chat allows them.
- A refusal is `P0001` with one of these messages, and `hint` = the column name (for example `title`, `body`, `studio_bio`), so apps can show it under the right field:
  - "This text includes language that isn't allowed on Dzirent."
  - "Please remove contact details from your listing; people can message you in Dzirent."
  - "Please remove contact details from your profile; people can message you in Dzirent."
- `check_text(p_text text, p_where text)`: Guest and signed-in. `p_where` is `'listing'`, `'profile'`, `'message'` or `'report'` (else `22023`); text up to 5000 characters. Returns the refusal message, or null when the text is fine. `'message'` always returns null since P5A (kept so installed apps don't fail). Saving runs the same check; this is for asking first, mainly sign-up's display name (the Auth API hides the database's message when the profile insert at sign-up is refused).

### Current terms and rate limits (P5A)
- **Current terms required.** These writes are refused with `P0001` "Please accept the updated Terms of Use and Privacy Policy to continue." until the caller has accepted the current version of both documents (`needs_legal_acceptance()` false; `accept_legal` fixes it):
  - publishing a listing (`listings.status` becoming `active`, insert or update; private drafts are allowed);
  - starting a chat (`start_conversation` or a `conversations` insert; reopening an existing chat is allowed);
  - sending a message (`messages` insert);
  - saving a piece (`saved_listings` insert) or a studio (`save_studio`);
  - filing a report (`reports` insert, `report_user`).
  - Reading, deleting, unsaving, blocking and everything else stay allowed.
- **Rate limits.** Refused with `P0001` "You're doing that too often. Try again in a bit." A refused write isn't counted. Settings in `app_private.settings` (`rate_limit_<action>`, changed only by migrations); a window starts at the first write after the previous window ended:

| Action | Limit | Counted on |
| --- | --- | --- |
| `message` | 30 a minute | `messages` insert |
| `new_chat` | 30 a day | a new chat (`start_conversation` reopening an existing chat isn't counted) |
| `report` | 20 a day | `reports` insert (direct or `report_user`) |
| `new_listing` | 20 a day | `listings` insert (drafts included) |
| `photo_scan` | 30 an hour per lender | a new photo check, asked for (`request_scan`) or automatic |

- Both rules key on the signed-in caller writing their own row: server jobs and admins acting on someone else's row aren't stopped. Trigger `terms_and_limits` on `messages`, `conversations`, `reports`, `saved_listings`, `saved_studios` and `listings`.

### Listing photo uploads (P5A)
- Bucket `listing-photos` (public reads): Storage accepts only `image/jpeg`, `image/png` and `image/webp`, at most 10 MB (10,485,760 bytes). Otherwise Storage answers HTTP 400 with `statusCode` `415` ("mime type … is not supported") or `413` ("The object exceeded the maximum allowed size"). The apps and website show "Choose a JPEG, PNG or WebP photo." and "This photo is too big. Choose one under 10 MB.".
- Upload and update are allowed only at `{listing_id}/{random}.jpg`, where `{random}` is 16 to 64 letters, digits, `_` or `-`, and only for a listing the caller owns (else 403, row-level security). Both apps and the website upload compressed JPEG with `Content-Type: image/jpeg`.

### Admin (P2B part 1)
Admins are the accounts in `app_private.admin_users` (closed to every API role). Every admin function below is callable by `authenticated` but starts with `app_private.require_admin()`: it refuses with `42501` "Admins only" unless the caller is in `admin_users`, and "Sign in with two-step verification to use admin tools" unless the JWT is `aal2` (Supabase MFA, TOTP). Since P5A it also refuses with "Enter a new two-step code to keep using admin tools" when the session's last TOTP check (the JWT's `amr` entry) is more than 24 hours old, and `is_admin()` is false then. The website shows the code step for both messages and then continues to the page that was asked for. Every call, reads included, writes one row to the append-only admin log. Functions return `jsonb` unless noted.

- **Adding or removing an admin:** list the admin emails in `ADMIN_EMAILS` (comma-separated) in `H:\DziRent\secrets\providers.env`, then an agent runs `node supabase/seed/admins.mjs` from the repo root. It makes `admin_users` match the list exactly: listed accounts are added, unlisted admins removed, each change logged as `admin_added` / `admin_removed`. An empty list is refused. An email with no Dzirent account is skipped (sign up first, then run it again). The admin then enrolls a TOTP factor (Supabase MFA) and signs in with it.
- `is_admin()` → `boolean`: true only for an admin at `aal2`. Any signed-in user may call it.
- **Queues:**
  - `admin_queues()`: counts `open_reports`, `scans_in_review` (latest scan `done` + `review`, no admin decision), `open_takedowns` (`received` or `countered`), `id_verification_reviews` (always 0 until P6A).
  - `admin_list_reports(p_status text default 'open', p_limit int default 30, p_offset int default 0)`: reports (`p_status` null = all) with reporter and target names and handles, outcome, and the evidence snapshot (`evidence`).
  - `admin_list_scan_reviews(p_limit, p_offset)`: scans waiting for a person, with the listing title, lender handle and each photo's storage path, slot, decision, warnings, `looks_like`, `nsfw` and `hooded`.
  - `admin_list_takedowns(p_status text default null, p_limit, p_offset)`: takedown requests; null = the open ones.
  - `admin_list_id_reviews()`: `[]` until ID verification (P6A).
- **Reports** (each closes an open report when given one; a closed report can't be closed again):
  - `admin_dismiss_report(p_report_id, p_reason)`: outcome `dismissed`.
  - `admin_warn_user(p_user_id, p_note, p_report_id default null)`: adds a `user_warnings` row (the user can read their own); outcome `warned`.
  - `admin_remove_reported_content(p_report_id, p_reason)`: a message is deleted, a listing is hidden (hold), a profile loses its studio name, bio and pickup area; outcome `content_removed`. The evidence keeps the original.
  - `admin_suspend_user(p_user_id, p_days 1-3650, p_reason, p_report_id default null)`: sets `profiles.suspended_until` / `suspension_reason` and holds the user's active listings; outcome `suspended`. An admin can't suspend themselves.
  - `admin_unsuspend_user(p_user_id, p_reason)`: clears the suspension and restores the held listings.
  - Ban / unban: through the `admin-actions` Edge Function (below), which calls `admin_record_ban(p_user_id, p_banned, p_reason, p_report_id default null)` after the Auth step. That function makes a ban an open-ended suspension (`suspended_until = 'infinity'`, listings held), with outcome `banned`; unban clears it.
- **Photo checks:** `admin_decide_scan(p_scan_id, p_decision 'approved'|'rejected', p_reason)`: sets `admin_decision`, `admin_decided_at` and `admin_reason` (shown to the lender) on a finished scan. Under the vision gate an approved scan of the current photos makes the listing publishable; rejected blocks it.
- **Listings:** `admin_hide_listing(p_listing_id, p_reason)` / `admin_unhide_listing(p_listing_id, p_reason)`: the hold below.
- **Takedowns** (`app_private.takedown_requests`: claimant, contact, work, URLs, listing ids, received date, status `received` / `actioned` / `rejected` / `countered` / `restored`, notes, counter-notice):
  - `admin_create_takedown(p_claimant_name, p_claimant_contact, p_work, p_urls text[] default '{}', p_listing_ids uuid[] default '{}', p_received_at default now, p_note default null)` → `uuid`.
  - `admin_takedown_remove_listing(p_takedown_id, p_listing_id, p_reason)`: hides the listing; status `actioned`.
  - Removing photos: through the `admin-actions` Edge Function (`remove_photos`), which calls `admin_remove_photos(p_listing_id, p_photo_ids uuid[], p_reason, p_takedown_id default null)` (deletes the photo rows, returns their `storage_paths`), then deletes the files. Called directly, the rows go but the files stay in the bucket.
  - `admin_record_counter_notice(p_takedown_id, p_notice, p_received_at default now)`: status `countered`.
  - `admin_set_takedown_status(p_takedown_id, p_status, p_note)`: for `rejected`, `restored` and corrections. Restoring a listing is `admin_unhide_listing`.
- **Feature flags:** `set_flag(p_key, p_enabled)`: switches an `app_settings` flag (`vision_required`, `verification_required`, `payments_enabled`, and since P2C `preview_label`). This replaces switching flags with migrations.
- **Metrics:** `admin_metrics()`: `users`, `new_users_week`, `active_listings`, `scans_week` (count by verdict, or status while unfinished), `open_reports`, `messages_week`, `suspended_users`.
- **Lookup:** `admin_find_user(p_query)`: by exact email, studio handle (with or without `@`) or account id, up to 10 matches. Returns profile fields, email, last sign-in, `banned_until`, suspension, `is_admin`, reports made, against and open against, warnings, and listings total, active and held.
- **The log:** `admin_audit_log(p_limit default 50 (max 200), p_offset)`: newest first, with the admin's handle.

`admin-actions` Edge Function (`POST /functions/v1/admin-actions`, `verify_jwt = false`):
- **Checks:** validates the caller's token (`auth.getUser`), then calls `is_admin()` with the caller's own token. Anything else gets HTTP 403. A reason of at least 3 characters is required.
- `{ "action": "ban" | "unban", "user_id", "reason", "report_id"? }`: Supabase Auth ban (`ban_duration` about 100 years, or `none`) with the server key from the function's environment, then `admin_record_ban` as the caller. A banned account can't sign in or refresh. An admin can't ban themselves.
- `{ "action": "remove_photos", "listing_id", "photo_ids": [...], "reason", "takedown_id"? }`: `admin_remove_photos` as the caller, then deletes the files from `listing-photos` with the server key.
- Returns `{ ok, action, ... }`. An Auth failure is HTTP 502 (nothing recorded). If the record step fails after the Auth change, it is HTTP 500 with `auth_changed: true`. Since P5A errors carry a plain `message` and no longer a `detail` with the database's reply.

Suspension and holds (any client):
- **Suspended accounts:** messages, new chats and reports by a suspended account are refused with `P0001`: "Your account is suspended until Nov 8, 2026. Reason: …." For a ban: "Your account is suspended. Reason: …." Reading one's own data still works. Apps can't change `suspended_until` or `suspension_reason` (a trigger keeps them).
- **Holds** (`listings.hold` `'hidden'` | `'suspended'`, `hold_reason`, `hold_restores`; written only by admin functions):
  - A held listing is `paused`, so it is hidden from the shop window, and `auto_paused_reason` says "Hidden by Dzirent: …." or "Paused while your account is suspended.".
  - Apps can't set a hold and can't make a held listing active. That is refused with "This listing is hidden by Dzirent: …. Contact support if you think this is a mistake.", or with the suspension message.
  - A suspended owner can't publish any listing.
  - Lifting the hold restores `active` if the listing was active before. An admin hide stays when a suspension ends.

Reports (P2B changes):
- **New columns:** `target_user_id` (who the report is about, set by the server), `status` (`open` / `closed`), `outcome`, `outcome_note`, `closed_at`, `closed_by`. Apps always insert `open`.
- **Rental reports (C3):** `target_type = 'rental'`, `target_id` = the rental. Only its renter or lender may report it (else `DZ-E5015`); it is about the other one. The evidence holds the rental (people, dates, price), its whole timeline and its condition photo paths. "Remove content" is refused for a rental report (`DZ-E5016`).
- **Message reports:** a reporter can only report messages in their own chats ("You can only report messages in your own chats.").
- **Evidence:** at insert, the server saves a snapshot in `app_private.report_evidence`, which never changes and is readable only through `admin_list_reports`:
  - a message with up to 5 messages before and after it in that chat, each with sender id, name, handle and time;
  - a listing's title, description, notes, category, status and photo paths;
  - a profile's public fields.
- **Text filter:** `details` is no longer filtered, so people can quote what was said; `reason` still is.
- **Retention:** reports and evidence survive either account's deletion (`reporter_id` becomes null). They are kept for `report_retention_days` after closing (`app_private.settings`, 730 = a placeholder until the attorney decides); `app_private.purge_expired_reports()` deletes the older ones (scheduling: P3B).

### Age gate (P2C)
- `record_age_check(p_source text, p_result text, p_platform text)` → `boolean`: Signed-in only. Records what the app store (or the user) said about the caller's age: `p_source` `'store_signal'` (Google Play Age Signals, later Apple's Declared Age Range) or `'self_declared'` (the 18+ confirmation at sign-up); `p_result` `'adult'`, `'minor'` or `'unknown'`; `p_platform` `'web'`, `'android'` or `'ios'`. Anything else is `22023`; a guest is refused. Returns true when the account is blocked afterwards.
  - A self-declared `adult` is stored as `unknown` if the profile has no 18+ confirmation (`adult_confirmed`).
  - The same source, result and platform as the caller's latest row within an hour adds no row.
  - Android calls it on every sign-in and once a day when the app opens; the website calls it once, right after sign-up (`self_declared`, `adult`, `web`). Never send a birthdate: there is no field for one.
- **Blocked:** the caller's latest decisive check is `minor` (a store `minor`, or a self-declared `minor`). Only a later store `adult` lifts it; a self-declared `adult` and `unknown` never do.
- **While blocked**, every insert or update by that user is refused with `P0001` "Dzirent is only for people 18 and older." on: `accessory_declarations`, `availability`, `blocks`, `conversations`, `device_tokens`, `legal_acceptances`, `listing_declarations`, `listing_events`, `listing_measurements`, `listing_photos`, `listing_scans`, `listings`, `messages`, `notification_settings`, `private_profiles`, `profiles`, `rental_outcomes`, `rentals`, `reports`, `saved_listings`, `saved_studios`, `suggestion_events` (trigger `age_gate`, which fires before the tables' other triggers). Reading, deleting rows, chat read receipts (`conversation_reads`), `mark_activity_seen` and account deletion still work. Server jobs and admins acting on the account are not stopped.
- When the block starts, the account's `active` listings become `paused` with `auto_paused_reason` "Paused: Dzirent is only for people 18 and older." They stay paused when it ends; republishing clears the reason.
- Apps show a full-screen "Dzirent is only for people 18 and older." step (Delete my account, Sign out) when `record_age_check` returns true.
- `admin_find_user` (P2B) also returns `age_check` (`{ source, result, platform, checked_at }` of the latest row, or null) and `age_blocked` (boolean).

- `age_blocked()` → `boolean` (P3A): Signed-in only. True while the caller is blocked by the age gate. The website shows its full blocked page then.

### Download my data (P3A)
- **Clients call the Edge Function `export-my-data`** (below). It returns the file; the database function behind it is `export_my_data()`.
- `export_my_data()` → `jsonb`: Signed-in only. Everything Dzirent holds about the caller, built from `auth.uid()` only. Once per 24 hours: a second call is refused with `P0001` "You can download your data once a day. Try again after Nov 8, 2026, 6:51 PM UTC." Each successful call adds a row to `data_exports`.
- **Parts:** `account` (email, created, last sign-in), `profile`, `private_profile`, `listings` (each with `measurements`, `availability`, `photos`, `photo_checks` with per-photo results), `saved_pieces`, `saved_studios`, `chats` (with `messages`), `rentals` (since C3 with `price_per_day`, `days`, `total`, `currency` and `events`: from, to, by you / other person / Dzirent, note, time), `condition_photos` (C3: the caller's own pickup and return photos, `rental_id`, `stage`, `storage_path`, `uploaded_at`; the Edge Function adds `link`, a signed link valid 7 days), `blocked_people`, `reports_filed`, `warnings`, `accessory_declarations`, `listing_declarations`, `legal_acceptances`, `age_checks`, `notification_settings`, `devices` (platform and dates, never tokens), `suggestion_choices`, `listing_activity`, `earlier_exports`.
- **Other people** appear only as `{ name, handle }` (studio name, else display name; studio handle). Messages say `from: "you"` or `"other person"`. Never another user's account id, email, location, measurements or private fields. Reports about the caller, report evidence, outcomes and admin notes are not included.

### Cleanup and retention jobs (P3B)
- **Ten jobs, nightly** (pg_cron, UTC): the seven database jobs at 09:15 (`app_private.run_cleanup_jobs()`), the three file jobs at 09:30 (`app_private.request_file_cleanup()` → Edge Function `cleanup-files`; C3 added `old_condition_photos`).
- **Each job counts only until its switch is on.** The switch is the `app_settings` flag `cleanup_<job>`: off (default) = count only, on = delete. Admins switch it on the admin Flags page (`set_flag`, logged). Every run, in either mode, adds a row to `app_private.job_runs` (job, mode, counts, error, start and finish).
- **Retention settings** in `app_private.settings` (key → default, who decides):

| Job | What it removes | Setting (default) | Decides |
| --- | --- | --- | --- |
| `abandoned_drafts` | Listings never published (`published_at` null), paused, not held, not edited for N days, with their photo files | `draft_retention_days` (60) | Owner |
| `orphan_photos` | Files in `listing-photos` with no `listing_photos` row, older than N days | `orphan_photo_days` (1) | Owner |
| `old_condition_photos` (C3, file job) | Files in `rental-photos` of rentals that ended (completed, cancelled, declined, expired) more than N days ago, and of rentals that no longer exist | `condition_photo_retention_days` (365, placeholder) | Attorney |
| `old_photo_checks` | Finished photo checks older than N days except the latest per listing, with their per-photo results | `photo_check_retention_days` (90) | Owner |
| `expired_reports` | Closed reports past the period, with their evidence | `report_retention_days` (730, placeholder) | Attorney |
| `old_data_exports` | `data_exports` rows older than N days | `data_export_retention_days` (30) | Owner |
| `old_age_checks` | Every age check except the latest per account and the latest decisive one (what the age gate reads) | `age_checks_keep` ("latest") | Owner |
| `old_suggestion_choices` | `suggestion_events` older than N days | `suggestion_retention_days` (365) | Owner |
| `old_declarations` | Accessory and listing declarations older than N years | `declaration_retention_years` (7, placeholder) | Attorney |
| `stale_device_tokens` | `device_tokens` not seen for N days | `device_token_stale_days` (90) | Owner |

- **Never purged:** the admin log and takedown records.
- **Listings** have two new server-written columns: `updated_at` (any change to the listing, its photos, measurements or dates) and `published_at` (the first time it became `active`). Apps can't set them. Existing listings were all counted as published.
- `cleanup-files` (`POST /functions/v1/cleanup-files`, `verify_jwt = false`):
  - Called only by the database, with the header `x-cleanup-secret` = function secret `CLEANUP_FILES_SECRET` (Vault `cleanup_files_secret`); anything else gets 401.
  - It reads `cleanup_file_plan()` (service role only). In delete mode it empties each abandoned draft's folder through the Storage API and then deletes the listing, and removes orphan files and (C3) old condition photos through the Storage API. It records each run with `cleanup_record_run()` (service role only).
  - It returns `{ ok, abandoned_drafts: {...}, orphan_photos: {...}, old_condition_photos: {...} }` with counts.
- `admin_cleanup_status()` → `jsonb` (admin + two-step sign-in, logged): each job's `deletes` switch, description and `last_run` (`mode`, `counts`, `error`, `started_at`, `finished_at`). The admin overview's "Cleanup jobs" card shows it.

### Sample data
- `supabase/seed/remove_sample_data.mjs` removes the 12 sample listings from `sample_data.mjs`, with their photos. It signs in as their owners (test users 1 and 2) and calls `delete-listing` for each owner's listing with one of the sample titles. Without `--yes` it only lists them.
- **Run only when the owner says so.**

### Photo checks (Step 8A, Step 8B)
- `request_scan(p_listing_id uuid)`: Signed-in listing owner only. Returns the `uuid` of the photo check (a `listing_scans` row) for the listing's current photos. The check runs on the server and usually finishes within a minute (longer when the vision service starts cold). Watch the row until `status` is `done` or `failed`: Realtime `UPDATE` events on `listing_scans` filtered by `id`, with polling by ID as the fallback (Step 8B).
  - One scan at a time per listing: asking again while one is `queued` or `running` returns that scan's ID. Since Step 8B, when the latest check is `done` and covers the current photos (`photo_set_hash`), that check's ID comes back instead of a new one. A scan that hasn't finished after 10 minutes is marked `failed` and a new one can start.
  - Refused: `42501` "Not signed in" / "Not your listing"; `22023` "Add a photo first"; `P0001` "You're doing that too often. Try again in a bit." (30 new checks per lender per hour since P5A; was "Too many photo checks. Try again in an hour." at 20).
- Automatic re-check (Step 8B): any insert or delete on `listing_photos` of an `active` listing, or a change of a photo's `storage_path`, `slot` or `listing_id`, queues a check the same way as `request_scan` (same 30-an-hour limit since P5A). Apps don't call anything for it. The listing stays `active` while the check runs.
- Automatic pause (Step 8B), only while `vision_required` is on: when that check of an `active` listing ends with a result that isn't `allowed`, or fails, the server sets the listing to `paused` and writes a plain sentence to `listings.auto_paused_reason`: "Paused: <reason>" for a rejection, otherwise "Paused: the new photos need a check before this listing can go live again." If the photos changed again while the check ran, the server checks again instead. If the 20-an-hour limit stops a re-check, the listing is paused with "Paused: the photos changed too often to check right now. Check them again in an hour." While the flag is off, photos are re-checked only and nothing is ever paused.
- Content safety (P2A), in the vision service: any photo (size tags and close-ups included) that the safety model reads as clear nudity or sexual content makes the verdict `rejected` with "This photo isn't allowed on Dzirent."; an uncertain one makes it `review` ("Someone at Dzirent will check these photos before this listing can go live.") unless it is already rejected; a photo read as a hooded garment turns `allowed` into `review` ("This piece has a hood, so someone at Dzirent will check it."). A piece being worn never changes the verdict and never adds a warning. Each photo's `labels` (in `photo_scans`) now also carry `hooded` and `safety.nsfw`.
- `listings.auto_paused_reason` (text, at most 300 characters, Step 8B): why the server paused the listing; apps show it on paused listings. Written only by the server: apps can't update it, and a listing inserted by an app always starts without one. A successful republish (`status` set to `active`, flag on or off) clears it.
- `policy_item_types` (table below): what can be listed, readable by everyone, guests included. Allowed rows give the listing's own `category`, `item_type` (accessories), `garment_type` and `style`; the others give the `reason` shown to the lender.
- `app_settings` (table below): feature flags, readable by everyone, changed by admins through `set_flag` (P2B). Since P3B also the nine `cleanup_<job>` switches (all off = count only). `vision_required`, `verification_required` and `payments_enabled` are all off. `preview_label` (P2C) is on: the website header shows "Preview only" in red while it is.
- Publish gate: while `vision_required` is on, a listing can become `active` (insert or update) only if its latest scan is `done`, covers its current photos (`photo_set_hash`) and was `allowed` or approved by an admin (`admin_decision = 'approved'`; `rejected` blocks). Otherwise the update is refused with `P0001` and plain words, for example "Check the photos before publishing this listing." or "This listing can't be published yet: <reason>". So when the flag is turned on, apps must insert new listings as `paused`, upload photos, run `request_scan`, then publish (the mobile apps always work this way since Step 8B). While the flag is off nothing is blocked.

### Push events
The database (triggers on `messages` and `conversations`) decides; the `send-push` Edge Function delivers, through the background job outbox (section 5) since C1. Apps never send pushes.
- New message: to the other participant. Title "New message from <name>". Body: the message text, only if the recipient turned on "Show message text".
- New chat on a listing: to the lender. Title "New chat from <name>". Body: listing title and requested dates.
- Requested dates changed: to the other participant. Title "New dates from <name>". Body: "Nov 5 - 8 · <listing title>".
- `<name>` is the sender's studio name, else display name.
- Never between blocked users (either direction), never when the recipient turned Messages off, never to a recipient with no registered phone.
- Never phone numbers, email or street addresses, map links or coordinates: text that looks like one of these is left out entirely.
- FCM data message, high priority, all values strings: `kind` (`message`, `new_chat`, `dates`, and since C3 the rental kinds in section 6), `conversation_id`, `recipient_id`, `title`, `body` (only when there is one), `tag` (`chat_<conversation_id>`). The app builds the notification: one per chat (the tag), "Messages" channel, nothing while that chat is on screen, a tap opens the chat (rental pushes carry the rental's chat, where the rental card is).

---

## 2. Edge Functions

**Input rules (P5A, every function, `supabase/functions/_shared/input.ts`):** the body must be one JSON object, within the function's size limit, with only the fields listed for it and every required one present. Otherwise HTTP 400 (413 when too large) with a plain `message` ("Send a JSON object.", "This request has fields that aren't accepted.", "This request is missing required fields.", "This request is too large."). Errors never include database or library details.

**Errors (C1, every function, `supabase/functions/_shared/errors.ts`):** every error body is `{ "code": "DZ-E####", "message": "..." }` with the catalog's HTTP status (section 5), for example `delete-listing` 400 `DZ-E9011` for an unknown field, 401 `DZ-E1003` without a token, 409 `DZ-E7010` from `delete-account` for an active rental. The old `error` slugs are gone. `admin-actions` keeps its extra fields (`auth_changed: true` with `DZ-E5025`, `rows_removed` with `DZ-E5036`) and passes a database refusal's code through (`DZ-E5034`, ...).

| Function | Fields | Size limit |
| --- | --- | --- |
| `delete-listing` | `listing_id` (required) | 1 KB |
| `delete-account`, `export-my-data`, `cleanup-files` | none (`{}` or an empty body) | 1 KB |
| `admin-actions` | `action`, `reason` (required, at most 500 characters), `user_id`, `report_id`, `listing_id`, `photo_ids` (at most 20), `takedown_id` | 16 KB |
| `send-push` | `kind`, `conversation_id`, `recipient_id`, `title` (required), `body` | 8 KB |
| `scan-listing` | `scan_id` (required) | 1 KB |
| `stripe-onboard` (C4) | `return_url`, `refresh_url` | 2 KB |
| `stripe-account-status`, `admin-integrations` (C4) | none | 1 KB |
| `stripe-pay` (C4) | `rental_id` (required) | 1 KB |
| `stripe-deposit` (C4) | `action`, `rental_id` (people, both required); `operation_id` (the outbox) | 1 KB |
| `stripe-refund` (C4) | `operation_id` (required) | 1 KB |
| `stripe-webhook` (C4) | Stripe's event, read only after its signature is checked | 512 KB |

### `delete-listing`
- **Who can call:** Signed-in listing owner (`POST /functions/v1/delete-listing`).
- **Auth:** Bearer token verified in code (`auth.getUser(token)`). `verify_jwt = false`.
- **Payload:** `{ "listing_id": "<uuid>" }`
- **Behavior:** Checks caller owns listing. Cleans up all files in `listing-photos/<listing_id>/` via Storage API in batches, then deletes the listing row under caller RLS.
- **Returns:** HTTP 200 `{ "ok": true }`.

### `delete-account`
- **Who can call:** Signed-in account owner (`POST /functions/v1/delete-account`).
- **Auth:** Bearer token verified in code (`auth.getUser(token)`). `verify_jwt = false`.
- **Payload:** None (user ID comes exclusively from verified token).
- **Behavior:**
  1. Verifies caller authentication.
  2. Refuses with HTTP 409 `DZ-E7010` while the caller has a rental in progress as renter or lender: `accepted`, `awaiting_payment`, `paid`, `picked_up`, `returned`, `claimed` or `disputed` (C3; asked with `account_has_rental_in_progress(p_user)`, server key only). A request alone doesn't block.
  3. Finds all caller listings and deletes their folders from `listing-photos` via Storage API.
  4. Deletes auth user via admin client; foreign keys cascade profile, listings, and child rows.
- **Returns:** HTTP 200 `{ "ok": true }`.

### `send-push`
- **Who can call:** The database only (`app_private.queue_push`, through the `async_jobs` outbox and `pg_net`, C1). Never apps.
- **Auth:** Header `x-send-push-secret` must equal the function secret `SEND_PUSH_SECRET` (the same value is in Vault as `send_push_secret`); compared in constant time. `verify_jwt = false`. Anything else gets HTTP 401.
- **Payload:** `{ "kind": "message" | "new_chat" | "dates" | "rental_request" | "rental_accepted" | "rental_declined" | "pickup_tomorrow" | "return_tomorrow" | "return_overdue" | "rental_completed" | "rental_cancelled" | "rental_expired" | "claim_filed" | "claim_decided" | "deposit_hold_ending", "conversation_id": "<uuid>", "recipient_id": "<uuid>", "title": "<text>", "body": "<text>" | null }`, already checked and worded by the database (rental kinds since C3, the last five since C4).
- **Behavior:** Gets a Google access token with the Firebase server key (`FIREBASE_SERVICE_ACCOUNT_BASE64`), sends the data message above through the FCM HTTP v1 API to each of the recipient's Android tokens (TTL one day), then deletes the tokens Firebase reports as unregistered or invalid.
- **Returns:** HTTP 200 `{ "sent", "failed", "removed", "errors" }`: counts and Firebase error codes only, never tokens or text. Since C1, when nothing was delivered and a phone failed for a reason other than a dead token, HTTP 503 `DZ-E9003` with the same counts, so the outbox tries again.

### `export-my-data` (P3A)
- **Who can call:** Signed-in user (`POST /functions/v1/export-my-data`, body `{}`).
- **Auth:** Bearer token verified in code (`auth.getUser(token)`). `verify_jwt = false`. Holds no server key: it calls `export_my_data()` with the caller's own token.
- **Returns:** HTTP 200 with the file, as `application/json` and `Content-Disposition: attachment; filename="dzirent-data-<YYYY-MM-DD>.json"`. It starts with `about` (a plain-language explanation of each part, the photo links and the daily limit), then `exported_at`, then the parts above in that order. Each listing photo gets `link`, the public URL of the caller's own photo.
- **Errors (C1):** JSON `{ code, message }`:
  - 401 `DZ-E1003`;
  - 429 `DZ-E7001`, the database's sentence with the time (without its code prefix);
  - 500 `DZ-E7002`; 503 `DZ-E7003` when the function isn't configured.
- **Clients:**
  - Website: Settings > Privacy & safety > Download my data, through `/api/workflows/export`.
  - Android: Settings > Privacy & safety > Download my data, saved with the system "save file" picker.
  - iPhone: the same row opens the website's page for now.

### `scan-listing` (Step 8A)
- **Who can call:** The database only (`request_scan` and the automatic re-check, through the `async_jobs` outbox and `pg_net`, C1). Never apps.
- **Auth:** Header `x-scan-listing-secret` must equal the function secret `SCAN_LISTING_SECRET` (the same value is in Vault as `scan_listing_secret`); compared in constant time. `verify_jwt = false`. Anything else gets HTTP 401.
- **Payload:** `{ "scan_id": "<uuid>" }`.
- **Behavior:** `vision_start_scan` marks the scan `running` and returns the listing's current photos; the function answers HTTP 202 at once and works in the background. It signs in to Google as the `vision-invoker` service account (`VISION_INVOKER_KEY_BASE64`), sends the photos' public URLs to the vision service (`VISION_URL`, `POST /scan`, 115 s timeout), computes the photo set hash and saves the result with `vision_finish_scan`. Any failure calls `vision_fail_scan`: status `failed`, verdict `review`.
- `vision_start_scan`, `vision_finish_scan` and `vision_fail_scan` are callable only with the project's secret key (`service_role`).

### Vision service (Cloud Run, server only)
- Service `vision` in Google Cloud project `dzirent`, `us-west1`. Callable only by signed-in Google accounts with `roles/run.invoker` on it (`vision-invoker`, and the owner for the eval). Holds no keys and never calls Supabase. Fetches photos only from the public `listing-photos` bucket. Details: `services/vision/README.md`.
- Since P2A it also runs the image safety model `Marqo/nsfw-image-detection-384` (Apache 2.0, pinned revision, built into the image). The scan response names it in `safety_model`; `/health` in `safety_model`, `safety_revision`, `safety_license`.

---

## 3. Raw Database Tables & RLS Rules

Guests have zero access to raw tables. Authenticated clients interact only with rows they own or participate in:

| Table | Operations | RLS Rule |
| --- | --- | --- |
| `profiles` | SELECT, UPDATE | `id = auth.uid()`. `suspended_until` and `suspension_reason` (P2B) are readable by the owner and written only by admin functions. |
| `private_profiles` | ALL | `user_id = auth.uid()`. `measurements_consent_at` (P1B) is written only by `give_measurements_consent` / `withdraw_measurements_consent`; body measurements need it (see "Terms acceptance and measurements consent"). |
| `listings` | SELECT, INSERT, UPDATE, DELETE | `lender_id = auth.uid()`. INSERT requires lender/both role. UPDATE restricted to safe columns. DELETE requires empty Storage folder. `auto_paused_reason` (Step 8B) is read-only for apps. `hold`, `hold_reason`, `hold_restores` (P2B) are server-only (see "Admin"). |
| `listing_photos` | ALL | Owned listing only (`l.lender_id = auth.uid()`). |
| `listing_measurements` | ALL | Owned listing only (`l.lender_id = auth.uid()`). |
| `availability` | ALL | Owned listing only (`l.lender_id = auth.uid()`). |
| `conversations` | SELECT, INSERT | SELECT: participant (`auth.uid() in (renter_id, lender_id)`). INSERT: renter only (`renter_id = auth.uid()`), validated by trigger. |
| `messages` | SELECT, INSERT | SELECT: conversation participant. INSERT: `sender_id = auth.uid()` in participated conversation. |
| `conversation_reads` | ALL | `user_id = auth.uid()` |
| `rentals` | SELECT | Participant (`auth.uid() in (renter_id, lender_id)`). Since C3 no insert, update or delete by apps: every change goes through the rental functions (section 6). |
| `rental_events` | SELECT | C3. Participants of the rental. Written only by the rental functions; append-only. Columns `id`, `rental_id`, `from_status`, `to_status`, `actor_id`, `actor_role` (`renter`, `lender`, `system`), `note`, `created_at`. |
| `rental_outcomes` | SELECT, INSERT | `user_id = auth.uid()`. Old "did it happen?" answers; kept readable, no longer written by the apps (C3). |
| `saved_listings` | ALL | `user_id = auth.uid()` |
| `saved_studios` | ALL | `user_id = auth.uid()` |
| `blocks` | ALL | `blocker_id = auth.uid()` |
| `reports` | SELECT, INSERT | `reporter_id = auth.uid()`. Since P2B: server-set `target_user_id`, `status`, `outcome`, `outcome_note`, `closed_at`, `closed_by`; evidence in `app_private.report_evidence` (admins only); kept after either account is deleted. |
| `user_warnings` | SELECT | `user_id = auth.uid()` (P2B). Written only by `admin_warn_user`. Columns `id`, `user_id`, `note`, `report_id`, `created_by`, `created_at`. Removed with the account. |
| `listing_events` | SELECT, INSERT | `user_id = auth.uid()` |
| `suggestion_events` | SELECT, INSERT | `user_id = auth.uid()` |
| `accessory_declarations`| SELECT | `user_id = auth.uid()` |
| `listing_declarations`  | SELECT | `user_id = auth.uid()` |
| `device_tokens` | SELECT, DELETE | `user_id = auth.uid()`. Added only through `register_push_token`. Columns `token` (unique), `user_id`, `platform`, `created_at`, `last_seen_at`. Removed with the account. |
| `notification_settings` | SELECT, INSERT, UPDATE | `user_id = auth.uid()`. Columns `messages` (default true), `show_message_text` (default false), `rental_reminders` (default true, C3), `updated_at`. Removed with the account. |
| `us_cities` | None | Closed to all direct access; query via `search_cities`. |
| `listing_scans` | SELECT | Owned listing only (`l.lender_id = auth.uid()`). Written only by `request_scan` and the server. Columns `id`, `listing_id`, `status` (`queued`, `running`, `done`, `failed`), `verdict` (`allowed`, `rejected`, `review`; set when done or failed), `reason` (plain words for the lender), `suggestions` (JSON: `item_key`, `item_label`, `category`, `item_type`, `garment_type`, `colors`, `pattern`, `fabric`, `styles`, `title`, `description`, `alternatives`, `confidence` when there is a confident allowed item, plus always `quality` `{ summary, photos, photos_with_warnings, warnings }`, `duplicate`, `model`), `photo_set_hash`, `admin_decision` (`approved`, `rejected` or null), `error` (short code), `created_at`, `started_at`, `finished_at`, `admin_decided_at`. Removed with the listing. In the `supabase_realtime` publication (Step 8B): owners receive changes to their own scans only (RLS applies). |
| `photo_scans` | SELECT | Owned listing only. Written only by the server. One row per scanned photo: `scan_id`, `listing_id`, `photo_id`, `storage_path`, `slot`, `blur_score` (0 sharp to 1 blurry), `brightness_score` (0 black to 1 white), `framing_score` (0 = whole piece in frame; higher = more of its outline on the edge), `worn_probability`, `fingerprint` (`vector(768)`), `labels` (JSON label scores), `warnings` (text[], worded as on the phone), `decision` (`allowed`, `not_allowed`, `not_clothing`, `detail`, `unsure`), `scanned_at`. Removed with the photo or listing. |
| `policy_item_types` | SELECT | Everyone, guests included (`using (true)`); no writes through the API. Columns `key`, `label`, `kind` (`garment`, `accessory`, `other`), `allowed`, `category`, `item_type`, `garment_type`, `style`, `policy_group`, `noun`, `looks_like`, `reason`, `prompts`, `position`. |
| `app_settings` | SELECT | Everyone, guests included; changed by admins through `set_flag` (P2B). Columns `key`, `enabled`, `description`, `updated_at`. |
| `data_exports` | SELECT | `user_id = auth.uid()` (P3A). Written only by `export_my_data`. Columns `id` (bigint), `user_id`, `exported_at`. Removed with the account. |
| `age_checks` | SELECT | `user_id = auth.uid()` (P2C). Written only by `record_age_check`. Columns `id` (bigint), `user_id`, `source` (`store_signal`, `self_declared`), `result` (`adult`, `minor`, `unknown`), `platform` (`web`, `android`, `ios`), `checked_at`. No birthdate. Removed with the account. |
| `legal_documents` | SELECT | Everyone, guests included; changed only by migrations (P1B). One row per document: `document` (`terms`, `privacy`), `version` (seeded `1.0.0` and `1.0.0`, from the website's `TERMS_VERSION` and `PRIVACY_VERSION`), `url`, `updated_at`. |
| `legal_acceptances` | SELECT | `user_id = auth.uid()`. Written only by `accept_legal` (P1B). Columns `id`, `user_id`, `document`, `version`, `platform` (`web`, `android`, `ios`), `accepted_at`; one row per user, document and version. Removed with the account. |

---

## 4. Links, sharing and previews (P5C)

**Shared links** are always the production address, with no tracking parameters:
- a listing: `https://dzirent.com/listing/<listing id>`;
- a studio: `https://dzirent.com/studio/<studio handle>` (URL-encoded).

**Share text** is the same on all three platforms:
- "`<title>` on Dzirent: `<link>`" for a listing;
- "`<studio name>` on Dzirent: `<link>`" for a studio (studio name, else display name).

Website: `apps/web/src/lib/share.ts`. Apps: `mobile/shared/.../util/ShareLinks.kt`.

**Share buttons:**
- **Website:** on listing and studio pages. It opens the browser's share menu where there is one, otherwise "Copy link" with "Link copied".
- **Android and iPhone:** the top bar of a listing (live pieces only) and of a studio opens the system share sheet (`DeviceServices.share`).

**Link previews** (Open Graph and X/Twitter card tags, built by the website):
- **Read as a guest:** an anonymous client with no cookies (`apps/web/src/lib/preview.ts`), so a preview shows only what the shop window shows a guest. Never coordinates, email, account ids or anything private.
- **Listing** `/listing/<id>`:
  - `og:title` is the title;
  - `og:description` is "$price/day · City, ST" (C1);
  - `og:url` is the clean link;
  - `og:image` / `twitter:image` is `/listing/<id>/opengraph-image` (and `/twitter-image`): a 1200 × 630 PNG with the first photo in a Dzirent frame, the wordmark, title, "$price/day · City, ST" and `@handle`.
  - Next.js adds a short `?<hash>` to the image address; that's its cache key, not a tracking parameter.
- **Studio** `/studio/<handle>`:
  - The tags are served to everyone, guests and preview bots included: "`<studio name>` (@`<handle>`)", and an image with up to 4 of the studio's listing photos.
  - The page itself still asks guests to sign up.
  - The data comes from `browse_listings` (`get_studio` is signed-in only). It reads at most 10 pages of 30 newest pieces.
  - A studio with no active pieces there gets the generic Dzirent preview.
- **A listing that is paused, deleted or hidden** (`get_listing` returns nothing), or not a listing id:
  - HTTP 200, a plain "This piece is no longer available" page with up to 8 newer pieces and "Browse all pieces";
  - the generic Dzirent preview; `noindex`.

**Android app links:**
- `MainActivity` has an `autoVerify` intent filter for `https://dzirent.com/listing/…` and `/studio/…`, and is `singleTask`.
- Android checks `https://dzirent.com/.well-known/assetlinks.json`, served by the website from `apps/web/public/.well-known/assetlinks.json` (`application/json`).
- **The file lists only the debug app for now:** package `com.dzirent.app.debug`, SHA-256 `A7:AF:02:EA:F1:8C:67:72:05:A4:FC:75:BF:48:3E:D8:E4:B4:5D:AB:DE:DC:DA:F1:B2:1E:05:D9:66:EE:95:7C`. That is the standard Android debug key on the build PC, which signs the APKs copied to OneDrive.
- **Placeholders:**
  - **P8A** adds the release package (`com.dzirent.app`) with the release (Play app signing) fingerprint to this file.
  - **P8B** adds the iPhone file `apple-app-site-association` (universal links).
- **In the app:** an opened link goes straight to that listing (guests too). A studio link opens the studio for a signed-in person, and the usual sign-up pop-up for a guest. A link that arrives during sign-in or the terms step waits until Home shows.

---

## 5. Error codes, prices and background jobs (C1)

### Error and warning codes
- **One source:** `contracts/error-codes.json`. `node contracts/generate.mjs` writes the Kotlin (`mobile/shared/.../util/ErrorCodes.kt`), website (`apps/web/src/lib/error-codes.generated.ts`) and Edge Function (`supabase/functions/_shared/error-codes.ts`) copies and the readable table `pranalika/error-codes.md`. The website build (`prebuild`) and the Android build (`generateErrorCodes`, skipped without Node) run it; `npm run lint` (`--check`) and `ErrorCodesFreshnessTest` fail when a committed copy is out of date. Codes are never reused or renumbered.
- **Entry:** `code` (`DZ-E####` error, `DZ-W####` warning), `kind`, `area`, `message` (what people see), optional `field`, `status` (HTTP-like), optional `server_detail` (the server's sentence carries a date or reason; show it).
- **Families:** 1xxx account, sign-in, terms, age; 2xxx listings, photos, photo checks; 3xxx chat, saving, blocking; 4xxx rentals, payments, deposits (reserved); 5xxx reports, moderation, admin; 6xxx ID verification (reserved); 7xxx data download, deletion; 9xxx system (rate limit `DZ-E9001`, unreachable `DZ-E9002`, unavailable `DZ-E9003`, request checks `DZ-E9010`-`E9016`, unexpected `DZ-E9999`).
- **Database:** every refusal's message starts with its code, `"DZ-E2010: Add a photo first"`; the SQLSTATE (`P0001`, `42501`, `22023`, `P0002`, ...) is unchanged. The field is in the HINT: the text filter's column as before, and the catalog's field otherwise (`full_legal_name`, `dates`, `reason`, `days`, `platform`). `check_text` returns the refusal with its code. The suspension sentence is `DZ-E1040: Your account is suspended ...`. One wording change: "You cannot message this user" is now "You can't message this user." (`DZ-E3005`).
- **Clients:** show the catalog message for the code (the server's words when `server_detail`), under the field when one is named, then the code in brackets: "Add a photo first (DZ-E2010)". A code the build doesn't know shows the server's words; anything without a code shows `DZ-E9999` "Something went wrong. Please try again.". Auth, network and Storage failures get their codes in the client (`DZ-E1004` wrong password, `DZ-E9002` no connection, `DZ-E2064`/`E2065` photo type and size, ...).
- **Photo warnings:** the 8 scanner and phone warnings are `DZ-W2001`-`W2008`, matched by their words (the vision service still sends words); the apps and website show the code after the warning.

### Price per day
- `listings.price_usd` is the price for one day; `listings.price_unit` (`'per_day'`, the only value, default) says so. Apps can't update `price_unit`.
- `browse_listings` and `get_listing` return `price_per_day`, `price_unit`, and with dates `days` and `total` (above). Other functions' `price` (`my_conversations`, `my_saved_listings`, `get_studio` cards, `fit_listings`) is also per day.

### Background jobs (outbox)
- `app_private.async_jobs` (closed to every API role): `id`, `kind` (`send_push`, `scan_listing`), `payload` (the Edge Function's body), `status` (`pending`, `running`, `done`, `dead`), `attempts`, `next_attempt_at`, `last_error`, `request_id` (pg_net), `dispatched_at`, `finished_at`, `created_at`, `updated_at`.
- `queue_push` and `queue_scan` add a job with `app_private.enqueue_job`; its first attempt goes out when the transaction commits, as the direct call did.
- pg_cron `dzirent-async-jobs` runs `app_private.run_async_jobs()` every minute: a 2xx answer marks the attempt's job `done`; any other answer, a timeout, or no answer 10 minutes later is a failure. After failure 1, 2, 3 and 4 the next attempt is 1, 5, 30 and 120 minutes later; failure 5 marks it `dead`. A dead `scan_listing` job ends its photo check like any failed check (`vision_fail_scan`: `failed`, verdict `review`). A `scan_listing` attempt whose check is no longer `queued` is marked done (skipped).
- Kept: done jobs 1 day, dead jobs 30 days.
- **Admin** (two-step sign-in, logged like every admin call):
  - `admin_jobs_status()` -> `jsonb`: `kinds` (per kind: `pending`, `running`, `done_day`, `dead`, `retrying`), `oldest_waiting_at`, `last_dead_at`, `schedule_minutes` `[1,5,30,120]`, `max_attempts` 5.
  - `admin_list_dead_jobs(p_limit int default 30 (max 100), p_offset int default 0)` -> `jsonb` array: `id`, `kind`, `attempts`, `last_error`, `created_at`, `died_at`, and `push_kind` + `conversation_id` (push) or `scan_id` (photo check). Never the push title or text.
  - `admin_retry_job(p_job_id bigint, p_reason text default null)` -> `jsonb` `{ id, kind, status, attempts, last_error }`: starts a dead job again from attempt 1 at once; logged as `retry_background_job`. Refused: `DZ-E5060` not found, `DZ-E5061` not dead.
  - Website: the overview's "Background jobs" card and `/admin/jobs` (counts, dead jobs, Retry).

### Read retries (clients)
- Reads only: GET and HEAD, and the read-only database functions (`browse_listings`, `get_listing`, `get_studio`, `fit_listings`, `search_cities`, `my_*`, `needs_legal_acceptance`, `age_blocked`, `is_admin`, `check_text`; the website also the admin status reads). After a network failure, 408 or 5xx (not 501): 2 retries, after 0.5 s and then 2 s. Writes are never retried; their error shows its code.
- Android/iPhone: Ktor `HttpRequestRetry` in `createDzirentSupabaseClient` (`util/ReadRetry.kt`). Website: `retryingFetch` (`lib/retry.ts`) in all three Supabase clients.

---

## 6. Rentals (C3)

### States
`requested` → `accepted` (or `declined`, `expired`, `cancelled`) → `picked_up` → `returned` → `completed`; `cancelled` from `accepted` too. `awaiting_payment`, `paid`, `claimed` and `disputed` exist for payments (Appendix A.3 of `architecture.md`) and are used only while `payments_enabled` is on: then accept gives `awaiting_payment`, a succeeded payment `paid`, and a return with a deposit hold `returned` (the claim window, section 7). While it is off (now), accept gives `accepted` and `mark_returned` completes the rental at once. Rows from before C3 were mapped: `active` → `picked_up`, `returned` → `completed`.

**C4 follow-ups (owner decisions, 2026-11-13):**
- **Not picked up:** a rental `accepted`, `awaiting_payment` or `paid` and not marked picked up `rental_autocancel_days` (2) after its start date is cancelled by `dzirent-rental-expiry` (by the system, note "Not picked up within 2 days after the start date"), with the cancellation refund rule of section 7 (counted as a late renter cancellation) and a `rental_cancelled` push to both. Exactly 2 days after the start it is still open.
- **No availability windows = always available:** `request_rental` takes any dates from today for such a listing; windows the lender adds limit the dates as before (`DZ-E4008`). `browse_listings` with dates already listed it. The apps' and website's date pickers still treat "no windows" as closed (C3 rule); see the C4 handoff, Requests.
- **Expiry note** uses the setting: "No answer in <rental_request_hours> hours".

### Who may act
Every function below is for signed-in callers and refuses (before anything else): not signed in `DZ-E1001`, age-blocked `DZ-E1030`, suspended `DZ-E1040`, current terms not accepted `DZ-E1010`, not one of the rental's two people `DZ-E4001`. Blocked pairs (either direction) are refused with `DZ-E4003` for `request_rental`, `respond_rental` and `mark_picked_up`; `cancel_rental`, `mark_returned` and `complete_rental` stay allowed so a block never leaves a rental stuck. A wrong state is `DZ-E4012`. Every change writes a `rental_events` row.

| Function | Who, from which state | Returns |
| --- | --- | --- |
| `request_rental(p_listing_id uuid, p_start date default null, p_end date default null)` | The renter (not the lender: `DZ-E4004`). Dates default to the chat's requested dates (else `DZ-E4005`, hint `dates`). Refused: last day before first `DZ-E4007`; start before today in Austin `DZ-E4006`; outside the listing's availability windows (adjacent windows join; none means not rentable) `DZ-E4008`; over booked days `DZ-E4009`; listing not active, held or without a price `DZ-E4011`; an open rental already in this chat `DZ-E4010`; more than 20 requests a day `DZ-E9001` (`rate_limit_rental_request`). Starts the chat if there is none. Stores the price snapshot (`price_per_day`, `days` counted both ends, `total`, `currency` USD) and `expires_at` = now + 48 hours. | the rental id |
| `respond_rental(p_rental_id uuid, p_answer text, p_note text default null)` | The lender (`DZ-E4002`), while `requested`. `p_answer` `accept` or `decline` (else `DZ-E4016`); an expired request `DZ-E4013`; accepting over days booked meanwhile `DZ-E4009`. | the new state |
| `cancel_rental(p_rental_id uuid, p_reason text default null)` | A request: the renter only (the lender declines instead, `DZ-E4018`). `accepted`, `awaiting_payment`, `paid`: either. Never after pickup (`DZ-E4014`). The reason (at most 300 characters, `DZ-E4017`) is the event's note. C4: a `rental_cancelled` push to the other person; a paid rental is refunded by the cancellation rule, an unpaid PaymentIntent is cancelled, a deposit hold released (section 7). | `cancelled` |
| `mark_picked_up(p_rental_id uuid, p_note text default null)` | The lender, from `accepted` or `paid`, after uploading at least 2 pickup photos (`DZ-E4020`, hint `photos`). C4: a `paid` rental with a deposit needs the hold first (`DZ-E4033`; `stripe-deposit` "place" does both). | `picked_up` |
| `mark_returned(p_rental_id uuid, p_note text default null)` | The lender, from `picked_up`, after uploading at least 2 return photos (`DZ-E4020`). C4: with a deposit hold the rental stays `returned` and the claim window opens (`claim_window_ends_at` = now + `claim_window_hours`); otherwise it completes at once (a second event by the system). | `completed` (or `returned`) |
| `complete_rental(p_rental_id uuid)` | The lender (waiving a claim), or the server (service role, no user), from `returned`. C4: a deposit hold is released. | `completed` |
| `get_rental(p_rental_id uuid default null, p_conversation_id uuid default null)` | One of the two people. By id, or the chat's latest rental. Null when there is none. | `jsonb` (below) |
| `my_rentals(p_limit int default 30 (max 100), p_offset int default 0)` | Every rental the caller is in: requests to the caller as lender first, then requested, upcoming, in progress, past. | `jsonb` array (below, without `events` and `photos`) |

The rental `jsonb`: `id`, `conversation_id`, `listing_id`, `listing_title`, `cover_photo_path`, `your_role` (`renter` or `lender`), `other_name`, `other_handle` (never the other person's id), `status`, `start_date`, `end_date`, `price_per_day`, `days`, `total`, `currency`, `expires_at`, `created_at`, `updated_at`, `payments_enabled`, since C4 `deposit_amount`, `payment_status`, `deposit_status`, `refund_amount`, `claim_window_ends_at`, and from `get_rental` also `events` (`from`, `to`, `by` = `you` / `other` / `dzirent`, `by_role`, `note`, `at`), `photos` (`storage_path`, `stage`, `by` = `you` / `other`, `by_role`, `uploaded_at`) and (C4) `claim` (`id`, `status`, `amount`, `reason`, `evidence_paths`, `renter_note`, `decision_amount`, `decision`, `created_at`, `responded_at`, `decided_at`, or null). The apps and website show none of the C4 fields yet (C5); they ignore unknown fields.

### No double booking
Exclusion constraint `rentals_no_double_booking` (btree_gist): one listing can't have two rentals in `accepted`, `awaiting_payment`, `paid` or `picked_up` whose days overlap. Days are inclusive, so Nov 5 - 8 and Nov 9 - 12 are back-to-back and allowed; Nov 5 - 8 and Nov 8 - 10 are refused. Booked days show in `get_listing.booked` and are left out of `browse_listings` with dates. One open rental per chat (`rentals_one_open_per_chat`); a chat can have several rentals over time.

### Expiry and reminders (pg_cron, UTC)
- `dzirent-rental-expiry`, every 10 minutes (`app_private.expire_rental_requests()`): `requested` with `expires_at` passed → `expired` (by the system, note "No answer in 48 hours", `rental_expired` push to both). Setting `rental_request_hours` (48). C4: also the automatic cancel of rentals not picked up (above) and the end of claim windows (section 7).
- `dzirent-rental-reminders`, daily at `rental_reminder_hour` (9) in `rental_timezone` (America/Chicago), scheduled as UTC by `app_private.schedule_rental_reminders()` after each run and whenever an admin changes either setting (15:00 UTC in winter, 14:00 UTC in summer): to both people, `pickup_tomorrow` (accepted or paid, starts tomorrow), `return_tomorrow` (picked up, ends tomorrow), `return_overdue` (picked up, ended 1 to 3 days ago; setting `rental_overdue_reminder_days` 3). At most one per rental, kind, person and day (`app_private.rental_reminders`). "Today" for rentals is the `rental_timezone` day (`app_private.rental_today()`).

### Pushes
Through `send-push` and the outbox, like chat pushes, to a person with a registered phone. Never between blocked people.

| Kind | To | Title | Body | Switch |
| --- | --- | --- | --- | --- |
| `rental_request` | lender | "Rental request from <name>" | "Nov 5 - 8 · <title> · 4 days · $220.00" | Messages |
| `rental_accepted` | renter | "<name> accepted your request" | dates · title | Messages |
| `rental_declined` | renter | "<name> declined your request" | dates · title | Messages |
| `rental_completed` | renter | "Rental completed" | title · dates | Messages |
| `pickup_tomorrow` | both | "Pickup tomorrow" | title · dates | Rental reminders |
| `return_tomorrow` | both | "Return due tomorrow" | title · dates | Rental reminders |
| `return_overdue` | both | "Return overdue" | "<title> was due back Nov 8." | Rental reminders |
| `rental_cancelled` (C4) | the other person; both when Dzirent cancels (automatic cancel, `admin_end_rental`) | "<name> cancelled the rental", or "Rental cancelled" | dates · title (· "Not picked up in time" / "Ended by Dzirent") | Messages |
| `rental_expired` (C4) | both | "Rental request expired" | title · dates | Messages |
| `claim_filed` (C4) | renter | "<name> filed a claim" | title · "$30.00 from the deposit" | Messages |
| `claim_decided` (C4) | lender when the renter accepts; both when Dzirent decides | "Claim decided" | title · "$20.00 from the deposit" or "No charge; the deposit hold is released" | Messages |
| `deposit_hold_ending` (C4) | both | "Deposit hold renews" | title · "A new hold replaces the current one before it ends." | Messages |

Pickup sends no push; the rental card updates live (Realtime on `rentals`). Every push carries the rental's chat, so the apps show it like any chat push (they accept any `kind`).

### Admin: ending a rental (C4)
`admin_end_rental(p_rental_id uuid, p_outcome text, p_reason text, p_refund_amount numeric default null, p_deposit_action text default null, p_capture_amount numeric default null)` → `jsonb` `{ status, refund_amount, deposit_action, capture_amount, refund_operation, deposit_operation, payment_cancel_operation }`. Two-step admins only (`DZ-E5001`, `DZ-E5002`, stale `DZ-E5003`), a reason (`DZ-E5006`); logged as `end_rental` with the before and after.
- Ends any open rental as `cancelled`, or as `completed` once it was picked up (`DZ-E5082`); not an ended one (`DZ-E5081`); `p_outcome` else `DZ-E5080`. The event is by the system: "Ended by Dzirent: <reason>". Both people get `rental_cancelled` or `rental_completed`.
- With a payment: `p_refund_amount` up to what is still paid (`DZ-E5084`, `DZ-E5085` without a payment); a deposit hold needs `p_deposit_action` `release` or `capture` (`DZ-E5083`; `DZ-E4039` when there is no hold) and a capture up to the deposit (`DZ-E5086`). An open claim is marked decided. An unpaid PaymentIntent of a cancelled rental is cancelled. Each money step goes through the outbox (section 7).
- Website: Users > find > Show rentals > "End rental...".

### Condition photos (bucket `rental-photos`, private)
- Paths `{rental_id}/{stage}/{random}.jpg`, `stage` `pickup` or `return`, `{random}` 16 to 64 letters, digits, `_` or `-`. JPEG, PNG or WebP, at most 10 MB (Storage answers 415 / 413, shown as `DZ-E2064` / `DZ-E2065`).
- **Upload:** either person of the rental, only in the matching state: `pickup` while `accepted`, `paid` or `picked_up`; `return` while `picked_up` or `returned`. Otherwise Storage refuses (row-level security, shown as `DZ-E4021`). No updates and no deletes by people: the photos are the record.
- **Read:** the two people and admins (two-step, fresh), by signed links (`createSignedUrl`); the bucket has no public address.
- The lender needs 2 photos of each stage before marking picked up or returned; the renter may add theirs.
- Kept `condition_photo_retention_days` (365, attorney to set) after the rental ends, then removed by the `old_condition_photos` cleanup job (count only until switched on).

### Admin
- `admin_user_rentals(p_user_id uuid, p_limit int default 20 (max 50))` → `jsonb` array of rental snapshots (people with ids, names and handles, dates, price, every event with actor id and role, photo paths with stage and uploader role). Two-step admins only; logged as `view_user_rentals`. The website's user lookup shows it with signed photo links; report detail shows a rental report's frozen snapshot the same way.

### Errors
`DZ-E4001`-`E4022` (`contracts/error-codes.json`, `pranalika/error-codes.md`), `DZ-E5015`, `DZ-E5016`; `DZ-E7010` reworded ("You have a rental in progress. Finish or cancel it in its chat (My rentals), then delete your account."). C4: `DZ-E5080`-`E5086` (admin rentals and payments).

---

## 7. Payments (C4)

Stripe Connect as designed in `architecture.md` Appendix A: Express accounts for lenders, destination charges with `application_fee_amount`, a separate manual-capture PaymentIntent for the deposit hold. **Switched off:** `payments_enabled` is off and the Stripe keys are blank, so every payment Edge Function answers **503 `DZ-E4030` "Payments aren't available yet."** (checked before anything else). Nothing changes for people while it is off. Dzirent never stores card numbers or bank details: Stripe holds them; Dzirent keeps Stripe ids, amounts and states.

### States with payments on
| Step | What happens | Who |
| --- | --- | --- |
| Accept | `respond_rental` → `awaiting_payment` | lender |
| Pay | `stripe-pay` → the client confirms Stripe's payment sheet (C5) → webhook `payment_intent.succeeded` → `paid` (event by the system, "Payment received"), `payment_status` `paid`, the card kept for off-session use | renter, Stripe |
| Pickup | a paid rental with `deposit_amount` needs the hold first: `stripe-deposit` `place` places it and, once Stripe can capture it, marks picked up as the lender. `mark_picked_up` alone answers `DZ-E4033` | lender |
| Return | `mark_returned` → `returned`, claim window `claim_window_hours` (48) | lender |
| No claim | when the window ends (`dzirent-rental-expiry`): `completed`, the hold released, `rental_completed` to the renter | system |
| Claim | `file_claim` → `claimed`; `respond_claim` accept → `completed` and the claimed amount captured; dispute → `disputed` | lender, renter |
| Decide | `admin_decide_claim` → `completed`; capture 0 to the claim (0 releases the hold) | admin |
| Cancel | `cancel_rental`, the automatic cancel, `admin_end_rental`: the refund rule below; an unpaid PaymentIntent cancelled; a hold released | either, system, admin |

A rental with no deposit completes at return, as with payments off. A rental accepted while payments were off stays `accepted` (no payment) and picks up as before.

**Cancellation refund rule** (settings): a renter (or the automatic cancel) gets the whole rental price back until `cancellation_refund_cutoff_hours` (48) before the start of the start date in `rental_timezone`; after that `late_cancellation_refund_percent` (0: the lender keeps the rental price). A lender cancellation always refunds in full. A payment that succeeds after the rental ended is refunded in full. Refunds use `reverse_transfer` (the lender's share comes back) and `refund_application_fee` (the fee in proportion).

**Fee and tax:** `fee_amount` = rental total × `platform_fee_percent` (0) / 100, rounded to cents, as `application_fee_amount`. Sales tax: the hook `app_private.sales_tax_amount` returns $0 (`sales_tax_enabled` off; $0 also when on until the tax adviser decides).

### Data (all server-written)
| Table | Who reads | Columns |
| --- | --- | --- |
| `listings.deposit_amount` | as the listing | optional refundable deposit in USD (null = none; > 0, ≤ 99,999.99). Apps may write it (C5 editors); `deposit_note` stays free text |
| `stripe_customers` | owner: `user_id`, `created_at` only (not the id) | `user_id`, `stripe_customer_id`, `created_at` |
| `payout_accounts` | owner | `user_id`, `stripe_account_id`, `charges_enabled`, `payouts_enabled`, `details_submitted`, `created_at`, `updated_at` |
| `rentals` (new columns) | the two people | `deposit_amount` (snapshot at request), `payment_intent_id`, `payment_status` (`none`, `pending`, `paid`, `failed`, `canceled`, `partially_refunded`, `refunded`), `fee_amount`, `tax_amount`, `refund_amount`, `deposit_intent_id`, `deposit_status` (`none`, `pending`, `held`, `released`, `captured`, `failed`), `deposit_capture_before`, `deposit_captured_amount`, `deposit_warned_at`, `claim_window_ends_at` |
| `rental_claims` | the two people | `id`, `rental_id` (one claim per rental), `lender_id`, `renter_id`, `amount`, `reason`, `evidence_paths` (return photos), `status` (`open`, `accepted`, `disputed`, `decided`), `renter_note`, `decided_by`, `decision`, `decision_amount`, `created_at`, `responded_at`, `decided_at`, `updated_at` |
| `app_private.payment_events` | nobody (closed) | `stripe_event_id` (unique), `type`, `payload_hash` (SHA-256 of the raw body; the payload isn't kept), `received_at`, `processed_at`, `result` |
| `app_private.payment_operations` | admins (Payments page) | each server money step: `kind` (`deposit_place`, `deposit_release`, `deposit_capture`, `deposit_renew`, `refund`, `payment_cancel`), `amount`, `status` (`queued`, `running`, `done`, `failed`), `stripe_id`, `error`, `details`, `requested_by` (admin), `reason`, `attempts`, times. Idempotency key `dz-op-<id>` |
| `app_private.card_disputes` | admins | from `charge.dispute.*`: id, rental, PaymentIntent, amount, reason, status, opened, closed |
| `app_private.rental_payment_methods` | nobody (closed) | the Stripe payment method id a rental was paid with (for the hold; never card data) |

### Database functions
People (signed in; the C3 guards: `DZ-E1001`, `DZ-E1030`, `DZ-E1040`, `DZ-E1010`, a stranger `DZ-E4001`):
- `file_claim(p_rental_id uuid, p_amount numeric, p_reason text, p_photo_paths text[])` → claim id. The lender (`DZ-E4002`), while `returned` inside the window (`DZ-E4040`), with a deposit hold (`DZ-E4047`), once (`DZ-E4048`), amount above $0 and up to the deposit (`DZ-E4041`, hint `amount`, the deposit in the sentence), reason 3-500 characters (`DZ-E4042`), 1 to 10 of this rental's return photos (`DZ-E4043`). → `claimed`, `claim_filed` to the renter. Allowed between blocked people (it ends the rental).
- `respond_claim(p_claim_id uuid, p_answer text, p_note text default null)` → `accepted` / `disputed`. The renter (`DZ-E4032`; strangers `DZ-E4044`), while open (`DZ-E4045`), `accept` or `dispute` (`DZ-E4046`), note ≤ 300 (`DZ-E4017`). Accept: `completed`, capture queued, `claim_decided` to the lender.
Admins (two-step, fresh, a reason; logged):
- `admin_decide_claim(p_claim_id, p_amount, p_reason)` (`decide_claim`): an open or disputed claim, capture 0 up to the claim (`DZ-E5086`). `completed`; `claim_decided` to both.
- `admin_refund_rental(p_rental_id, p_amount, p_reason)` (`refund_rental`): above $0 up to what is still paid (`DZ-E5084`; `DZ-E5085` without a payment).
- `admin_end_rental(...)` (section 6).
- `admin_payments_overview()` (`view_payments`): `payments_enabled`, `claims` (open and disputed), `card_disputes` (open, or closed within 30 days), `failed_payments` (payment or hold failed), `failed_operations` (last 50), `payout_problems` (details submitted but charges or payouts off), `refundable` (last 50 paid rentals).
Server key only (the Edge Functions): `payments_available`, `payment_onboard_prepare`, `payment_save_account`, `payment_update_account`, `payment_account_for`, `payment_save_customer`, `payment_pay_prepare`, `payment_save_intent`, `payment_deposit_prepare`, `payment_deposit_result`, `payment_operation_start`, `payment_operation_finish`, `payment_handle_event`. Each prepare function refuses with `DZ-E4030` while `payments_enabled` is off and checks the person like the rental functions.

### Edge Functions (`verify_jwt = false`; each checks in code)
| Function | Caller | Body | Does |
| --- | --- | --- | --- |
| `stripe-onboard` | a lender (token; renters `DZ-E4037`) | `{ return_url?, refresh_url? }` (https on dzirent.com only) | Creates the Express account once (`type=express`, `country=US`, card payments and transfers; key `dz-acct-<user>`), returns `{ ok, url }`, a new Stripe onboarding link each time |
| `stripe-account-status` | the lender | `{}` | Reads the account from Stripe into `payout_accounts`; `{ ok, account }` (null without one) |
| `stripe-pay` | the renter (`DZ-E4032`), rental `awaiting_payment` (`DZ-E4012`), lender charges on (`DZ-E4031`) | `{ rental_id }` | One PaymentIntent per rental (key `dz-pay-<rental>`; asked again, the same one): amount = total + tax in cents, `customer`, `transfer_data.destination` = lender, `application_fee_amount` (when > 0), `setup_future_usage=off_session`, `automatic_payment_methods` without redirects. Returns `{ ok, rental_id, payment_intent_id, client_secret, publishable_key, amount, currency }` |
| `stripe-deposit` | the lender: `{ action: "place", rental_id }`; the outbox: `{ operation_id }` with `x-payments-secret` | | Place: a manual-capture PaymentIntent off-session on the saved card (`DZ-E4034` without one), destination = lender, key `dz-op-<id>`; held → marks picked up (200 `{ status: "picked_up" }`), not yet capturable → 202 `{ deposit_status: "pending" }` (the webhook confirms; call again), declined → `DZ-E4035`. Outbox: `deposit_release` (cancel), `deposit_capture` (capture `amount_to_capture`; if the hold ended, an off-session charge for the amount), `deposit_renew` (a new hold, then the old one cancelled). Anything else from people: `DZ-E9016` |
| `stripe-refund` | the outbox only (`DZ-E9004` otherwise) | `{ operation_id }` | `refund` (`/v1/refunds`, `reverse_transfer`, `refund_application_fee`), `payment_cancel` (cancel an unpaid PaymentIntent) |
| `stripe-webhook` | Stripe | the raw event | Below |

Stripe errors: a failure Stripe decides (4xx) is recorded on the operation (`failed`, shown on the Payments page) and answered 200; no answer or 5xx is 503 for the outbox to retry with the same key, or `DZ-E4036` for a person. Every create and change call carries an idempotency key. Outbox kinds `stripe_deposit` and `stripe_refund` (Vault `stripe_deposit_url`, `stripe_refund_url`, `payments_job_secret` = function secret `PAYMENTS_JOB_SECRET`); a dead job marks its operation failed. API version pinned `2024-06-20`. `STRIPE_API_BASE` (tests only) is ignored for a live key.

### Webhook (`stripe-webhook`)
1. **Signature first:** `Stripe-Signature` (`t=…,v1=…`) checked on the raw bytes with `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CONNECT_WEBHOOK_SECRET` when set), timestamps within 5 minutes; else 400 `DZ-E4038` and nothing is read or written. Bodies over 512 KB: 413.
2. **Once:** `payment_handle_event` inserts the event id into `payment_events`; a repeated id answers 200 `{ received: true, result: "duplicate" }`. The whole event is one transaction (a failure answers 500 and Stripe retries).
3. **Rows are found by the Stripe ids Dzirent stored**, never by metadata.

| Event | Effect |
| --- | --- |
| `payment_intent.succeeded` | rental PaymentIntent: `paid` (+ the card kept); after the rental ended: a full refund. Deposit PaymentIntent: `captured` |
| `payment_intent.payment_failed` | `payment_status` / `deposit_status` `failed` |
| `payment_intent.canceled` | hold `released`; unpaid payment `canceled` |
| `payment_intent.amount_capturable_updated` | hold `held`, `deposit_capture_before` from the charge (about 7 days when Stripe doesn't say) |
| `charge.refunded` | `refund_amount` = `amount_refunded`; `refunded` or `partially_refunded` |
| `charge.dispute.created`, `charge.dispute.closed` | `card_disputes` row (admin Payments page) |
| `account.updated` | `payout_accounts` flags |
| anything else | recorded, `ignored` |

While `payments_enabled` is off or a key is blank the webhook answers 503 `DZ-E4030`; Stripe retries for up to 3 days.

### Deposit holds over time
`dzirent-deposit-holds`, nightly 09:45 UTC (`app_private.check_deposit_holds()`): a held deposit of a rental still `picked_up` whose `capture_before` is within `deposit_hold_warning_hours` (24) plus a day: `deposit_hold_ending` to both (once per hold) and a `deposit_renew` step (a new hold replaces the old). After return, a claim whose hold has ended is charged off-session for the amount instead.

### Runbook: the day real keys arrive
Who: an agent with the Supabase CLI and the secrets folder (never in the repo, never printed). Order matters.
1. **Get the three keys** from the Stripe dashboard (Developers > API keys) of the Dzirent platform account with Connect enabled: the secret key (`sk_live_…`, or `sk_test_…` for a test-mode rehearsal) and the publishable key (`pk_…`). Save them in `H:\DziRent\secrets\providers.env` as `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
2. **Register the webhook endpoints** (Developers > Webhooks > Add endpoint), URL `https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/stripe-webhook`, API version `2024-06-20`:
   - "Events on your account": `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.amount_capturable_updated`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Its signing secret (`whsec_…`) is `STRIPE_WEBHOOK_SECRET`.
   - "Events on Connected accounts": `account.updated`. Its signing secret is `STRIPE_CONNECT_WEBHOOK_SECRET` (optional: without it, `stripe-account-status` still refreshes a lender's account when they come back from onboarding).
3. **Set the function secrets** from a temporary env file (deleted at once; never echo values): `supabase secrets set --env-file <tmp>` with `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CONNECT_WEBHOOK_SECRET`). `PAYMENTS_JOB_SECRET` is already set (copied from Vault `payments_job_secret` in C4). Never set `STRIPE_API_BASE` on the live project. The publishable key needs no app or website build setting: `stripe-pay` returns it with the client secret.
4. **Check:** admin website > Integrations shows Payments **configured**; `supabase secrets list` shows the names.
5. **Rehearse in test mode first** (test keys): onboard a test lender, pay with Stripe's test card, place and release a hold, refund. Then swap to live keys (steps 1-4 again).
6. **Switch on:** admin website > Flags > `payments_enabled` (logged). From then on, accepting a rental waits for payment. The C5 screens (pay, payouts, deposit, claims) must ship before this is switched on for people.
7. **To switch off in an emergency:** Flags > `payments_enabled` off. Payment calls answer `DZ-E4030`; Stripe keeps retrying webhooks for 3 days, and queued payment steps retry and then wait as dead jobs (Background jobs > Retry) until it is on again.

---

## 8. Settings and integrations (C4)

### Settings (`app_private.settings`, closed)
Every business number and rule; never in code or env files. Each row: `key`, `value` (JSON), `label`, `area` (`payments`, `rentals`, `rate_limits`, `retention`), `value_type` (`integer`, `number`, `boolean`, `timezone`, `choice`, `rate_limit` = `{ max, window_seconds }`, the range for `max`), `unit`, `min_value`, `max_value`, `choices`, `note` (the plain description), `decided_by` (`owner`, `business_owner`, `attorney`), `affects_terms`, `updated_at`. A trigger refuses a value of the wrong type (`DZ-E5072`) or outside the range (`DZ-E5070` "Enter a value from 1 to 336 (hours)."), for every writer, migrations included. Code reads them with `app_private.setting_int / setting_num / setting_bool / setting_text` (a missing one is `DZ-E9020`).

| Area | Keys (default) |
| --- | --- |
| Payments | `platform_fee_percent` (0, BO, terms), `claim_window_hours` (48, BO, terms), `cancellation_refund_cutoff_hours` (48, BO, terms), `late_cancellation_refund_percent` (0, BO, terms), `sales_tax_enabled` (false, attorney/tax adviser, terms), `deposit_hold_warning_hours` (24) |
| Rentals | `rental_request_hours` (48), `rental_autocancel_days` (2), `rental_overdue_reminder_days` (3), `rental_reminder_hour` (9), `rental_timezone` (America/Chicago) |
| Rate limits | `rate_limit_message` (30/min), `rate_limit_new_chat`, `rate_limit_report`, `rate_limit_new_listing` (per day), `rate_limit_photo_scan` (per hour), `rate_limit_rental_request` (20/day), `data_export_interval_hours` (24) |
| Retention | `report_retention_days` (730, attorney, terms), `condition_photo_retention_days` (365, attorney, terms), `declaration_retention_years` (7, attorney, terms), `draft_retention_days`, `orphan_photo_days`, `photo_check_retention_days`, `data_export_retention_days` (at least 8), `age_checks_keep` ("latest"), `suggestion_retention_days`, `device_token_stale_days` |

Not settings, on purpose (technical, not business): the outbox retry schedule, the 24-hour freshness of an admin's two-step code (a security rule), the 10-minute photo-check timeout, cron cadences, Stripe's 5-minute webhook tolerance and 7-day authorization fallback.

- `admin_list_settings()` → `jsonb` array (`key`, `label`, `area`, `value`, `type`, `unit`, `min`, `max`, `choices`, `description`, `decided_by`, `affects_terms`, `updated_at`); logged `view_settings`.
- `admin_set_setting(p_key text, p_value jsonb, p_reason text)` → `{ key, old_value, new_value, affects_terms, reminder_schedule_utc }`. Text is read as a number or true/false where the type says so; a number for a rate limit is its new maximum. Unknown key `DZ-E5071`. Changing `rental_reminder_hour` or `rental_timezone` reschedules `dzirent-rental-reminders`. Logged `set_setting` with the old and new value.
- Website `/admin/settings`: grouped by area; Edit → the new value → a confirmation "From … to …" with a reason; settings marked "Legal pages" warn that the Terms or Privacy Policy may need updating.

### Integrations (`admin-integrations` Edge Function, `/admin/integrations`)
`POST {}` with an admin's token → `{ ok, integrations: [{ key, name, configured, status }] }` for `payments` (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_JOB_SECRET`), `id_checks` (`DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`), `notifications` (`FIREBASE_SERVICE_ACCOUNT_BASE64`, `SEND_PUSH_SECRET`), `email` (`EMAIL_API_KEY`), `photo_checks` (`VISION_URL`, `VISION_INVOKER_KEY_BASE64`, `SCAN_LISTING_SECRET`): "configured" when every named secret is set, else "not configured". Only those words: never a value or length; nothing is accepted or stored. The admin check and the log entry (`view_integrations`, booleans only) are `admin_record_integrations_check` as the caller; a non-admin gets 403 `DZ-E5008`.