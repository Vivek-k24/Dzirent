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
  - `p_end_date` (date, default null): end date of requested rental window (only listings available for the full range).
  - `p_min_price` (numeric, default null): minimum price USD.
  - `p_max_price` (numeric, default null): maximum price USD.
  - `p_new_days` (integer, default null): listings created within last N days (for "New near you").
  - `p_saved_only` (boolean, default false): signed-in only; returns caller's saved pieces.
  - `p_saved_studios_only` (boolean, default false): signed-in only; returns listings from studios the caller saved.
  - `p_sort` (text, default null): sort order ('nearest', 'newest', 'price_low', 'price_high', or relevance when query is present).
  - `p_limit` (integer, default 20, max 30): results per page.
  - `p_offset` (integer, default 0): paging offset.
- **Returns:** Table of listing cards:
  - `id` (uuid): listing ID.
  - `title` (text): listing title.
  - `price` (numeric): rental price in USD.
  - `distance` (integer): whole miles from caller, or null.
  - `city` (text): city label.
  - `category` (text): category name.
  - `cover_photo_path` (text): Storage path of lowest position photo.
  - `studio_name` (text): studio name or display name.
  - `studio_handle` (text): studio handle.

### `get_listing`
- **Who can call:** Guest and signed-in (`anon`, `authenticated`).
- **Inputs:**
  - `p_listing_id` (uuid): listing ID.
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
- **Returns:** Table with one row (or empty if paused/blocked/not found):
  - `id` (uuid), `title` (text), `category` (text), `item_type` (text), `garment_type` (text), `size_label` (text), `description` (text), `price` (numeric), `price_note` (text), `deposit_note` (text), `retail_value` (numeric), `listing_styles` (text[]), `city` (text), `distance` (integer), `studio_name` (text), `studio_handle` (text).
  - `photos` (jsonb): array of `{ storage_path, position, slot }` in position order.
  - `measurements` (jsonb): array of `{ label, value, unit }`.
  - `availability` (jsonb): array of `{ start_date, end_date }` in date order.
  - `created_at` (timestamptz).

### `get_studio`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:**
  - `p_handle` (text): studio handle.
  - `p_lat` (double precision, default null): caller's latitude.
  - `p_lng` (double precision, default null): caller's longitude.
- **Returns:** Table with one row:
  - `studio_name` (text), `studio_handle` (text), `studio_bio` (text), `style_tags` (text[]), `city` (text), `pickup_area` (text).
  - `rental_count` (integer): count of completed/active rentals.
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
- `set_conversation_dates(p_conversation_id, p_start, p_end)`: Signed-in renter only. Refused (`42501`, "You cannot message this user") when the two people in the chat are blocked in either direction, like sending a message (Step 5B).
- `mark_conversation_read(p_conversation_id)`: Signed-in participant only.
- `mark_activity_seen()`: Signed-in only.

### Push notifications (Step 7A)
- `register_push_token(p_token text, p_platform text)`: Signed-in only. Saves this phone's push token for the caller; `p_platform` is `'android'` or `'ios'`. A token saved for another account moves to the caller (the phone changed hands). Call on sign-in, on every app start while signed in, and when Firebase issues a new token. Returns nothing.
- `unregister_push_token(p_token text)`: Signed-in only. Removes the token if it is the caller's. Call before signing out. Returns nothing.
- Settings are the caller's own `notification_settings` row (table below). No row means Messages on and message text hidden.

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
- **Parts:** `account` (email, created, last sign-in), `profile`, `private_profile`, `listings` (each with `measurements`, `availability`, `photos`, `photo_checks` with per-photo results), `saved_pieces`, `saved_studios`, `chats` (with `messages`), `rentals`, `blocked_people`, `reports_filed`, `warnings`, `accessory_declarations`, `listing_declarations`, `legal_acceptances`, `age_checks`, `notification_settings`, `devices` (platform and dates, never tokens), `suggestion_choices`, `listing_activity`, `earlier_exports`.
- **Other people** appear only as `{ name, handle }` (studio name, else display name; studio handle). Messages say `from: "you"` or `"other person"`. Never another user's account id, email, location, measurements or private fields. Reports about the caller, report evidence, outcomes and admin notes are not included.

### Cleanup and retention jobs (P3B)
- **Nine jobs, nightly** (pg_cron, UTC): the seven database jobs at 09:15 (`app_private.run_cleanup_jobs()`), the two file jobs at 09:30 (`app_private.request_file_cleanup()` → Edge Function `cleanup-files`).
- **Each job counts only until its switch is on.** The switch is the `app_settings` flag `cleanup_<job>`: off (default) = count only, on = delete. Admins switch it on the admin Flags page (`set_flag`, logged). Every run, in either mode, adds a row to `app_private.job_runs` (job, mode, counts, error, start and finish).
- **Retention settings** in `app_private.settings` (key → default, who decides):

| Job | What it removes | Setting (default) | Decides |
| --- | --- | --- | --- |
| `abandoned_drafts` | Listings never published (`published_at` null), paused, not held, not edited for N days, with their photo files | `draft_retention_days` (60) | Owner |
| `orphan_photos` | Files in `listing-photos` with no `listing_photos` row, older than N days | `orphan_photo_days` (1) | Owner |
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
  - It reads `cleanup_file_plan()` (service role only). In delete mode it empties each abandoned draft's folder through the Storage API and then deletes the listing, and removes orphan files through the Storage API. It records both runs with `cleanup_record_run()` (service role only).
  - It returns `{ ok, abandoned_drafts: {...}, orphan_photos: {...} }` with counts.
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
The database (triggers on `messages` and `conversations`) decides; the `send-push` Edge Function delivers. Apps never send pushes.
- New message: to the other participant. Title "New message from <name>". Body: the message text, only if the recipient turned on "Show message text".
- New chat on a listing: to the lender. Title "New chat from <name>". Body: listing title and requested dates.
- Requested dates changed: to the other participant. Title "New dates from <name>". Body: "Nov 5 - 8 · <listing title>".
- `<name>` is the sender's studio name, else display name.
- Never between blocked users (either direction), never when the recipient turned Messages off, never to a recipient with no registered phone.
- Never phone numbers, email or street addresses, map links or coordinates: text that looks like one of these is left out entirely.
- FCM data message, high priority, all values strings: `kind` (`message`, `new_chat`, `dates`), `conversation_id`, `recipient_id`, `title`, `body` (only when there is one), `tag` (`chat_<conversation_id>`). The app builds the notification: one per chat (the tag), "Messages" channel, nothing while that chat is on screen, a tap opens the chat.

---

## 2. Edge Functions

**Input rules (P5A, every function, `supabase/functions/_shared/input.ts`):** the body must be one JSON object, within the function's size limit, with only the fields listed for it and every required one present. Otherwise HTTP 400 (413 when too large) with a plain `message` ("Send a JSON object.", "This request has fields that aren't accepted.", "This request is missing required fields.", "This request is too large."). Errors never include database or library details.

| Function | Fields | Size limit |
| --- | --- | --- |
| `delete-listing` | `listing_id` (required) | 1 KB |
| `delete-account`, `export-my-data`, `cleanup-files` | none (`{}` or an empty body) | 1 KB |
| `admin-actions` | `action`, `reason` (required, at most 500 characters), `user_id`, `report_id`, `listing_id`, `photo_ids` (at most 20), `takedown_id` | 16 KB |
| `send-push` | `kind`, `conversation_id`, `recipient_id`, `title` (required), `body` | 8 KB |
| `scan-listing` | `scan_id` (required) | 1 KB |

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
  2. Refuses with HTTP 409 if caller has active rentals as renter or lender.
  3. Finds all caller listings and deletes their folders from `listing-photos` via Storage API.
  4. Deletes auth user via admin client; foreign keys cascade profile, listings, and child rows.
- **Returns:** HTTP 200 `{ "ok": true }`.

### `send-push`
- **Who can call:** The database only (`app_private.queue_push`, through `pg_net`). Never apps.
- **Auth:** Header `x-send-push-secret` must equal the function secret `SEND_PUSH_SECRET` (the same value is in Vault as `send_push_secret`); compared in constant time. `verify_jwt = false`. Anything else gets HTTP 401.
- **Payload:** `{ "kind": "message" | "new_chat" | "dates", "conversation_id": "<uuid>", "recipient_id": "<uuid>", "title": "<text>", "body": "<text>" | null }`, already checked and worded by the database.
- **Behavior:** Gets a Google access token with the Firebase server key (`FIREBASE_SERVICE_ACCOUNT_BASE64`), sends the data message above through the FCM HTTP v1 API to each of the recipient's Android tokens (TTL one day), then deletes the tokens Firebase reports as unregistered or invalid.
- **Returns:** HTTP 200 `{ "sent", "failed", "removed", "errors" }`: counts and Firebase error codes only, never tokens or text.

### `export-my-data` (P3A)
- **Who can call:** Signed-in user (`POST /functions/v1/export-my-data`, body `{}`).
- **Auth:** Bearer token verified in code (`auth.getUser(token)`). `verify_jwt = false`. Holds no server key: it calls `export_my_data()` with the caller's own token.
- **Returns:** HTTP 200 with the file, as `application/json` and `Content-Disposition: attachment; filename="dzirent-data-<YYYY-MM-DD>.json"`. It starts with `about` (a plain-language explanation of each part, the photo links and the daily limit), then `exported_at`, then the parts above in that order. Each listing photo gets `link`, the public URL of the caller's own photo.
- **Errors:** JSON `{ error, code, message }`, with the same sentence in `error` and `message`:
  - 401 `not_signed_in`;
  - 429 `once_a_day` (the database's sentence);
  - 500 `export_failed`.
- **Clients:**
  - Website: Settings > Privacy & safety > Download my data, through `/api/workflows/export`.
  - Android: Settings > Privacy & safety > Download my data, saved with the system "save file" picker.
  - iPhone: the same row opens the website's page for now.

### `scan-listing` (Step 8A)
- **Who can call:** The database only (`request_scan` and the automatic re-check, through `pg_net`). Never apps.
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
| `rentals` | SELECT, INSERT, UPDATE | SELECT: participant. INSERT: participant with active conversation. UPDATE: state transitions by participant. |
| `rental_outcomes` | SELECT, INSERT | `user_id = auth.uid()` |
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
| `notification_settings` | SELECT, INSERT, UPDATE | `user_id = auth.uid()`. Columns `messages` (default true), `show_message_text` (default false), `updated_at`. Removed with the account. |
| `us_cities` | None | Closed to all direct access; query via `search_cities`. |
| `listing_scans` | SELECT | Owned listing only (`l.lender_id = auth.uid()`). Written only by `request_scan` and the server. Columns `id`, `listing_id`, `status` (`queued`, `running`, `done`, `failed`), `verdict` (`allowed`, `rejected`, `review`; set when done or failed), `reason` (plain words for the lender), `suggestions` (JSON: `item_key`, `item_label`, `category`, `item_type`, `garment_type`, `colors`, `pattern`, `fabric`, `styles`, `title`, `description`, `alternatives`, `confidence` when there is a confident allowed item, plus always `quality` `{ summary, photos, photos_with_warnings, warnings }`, `duplicate`, `model`), `photo_set_hash`, `admin_decision` (`approved`, `rejected` or null), `error` (short code), `created_at`, `started_at`, `finished_at`, `admin_decided_at`. Removed with the listing. In the `supabase_realtime` publication (Step 8B): owners receive changes to their own scans only (RLS applies). |
| `photo_scans` | SELECT | Owned listing only. Written only by the server. One row per scanned photo: `scan_id`, `listing_id`, `photo_id`, `storage_path`, `slot`, `blur_score` (0 sharp to 1 blurry), `brightness_score` (0 black to 1 white), `framing_score` (0 = whole piece in frame; higher = more of its outline on the edge), `worn_probability`, `fingerprint` (`vector(768)`), `labels` (JSON label scores), `warnings` (text[], worded as on the phone), `decision` (`allowed`, `not_allowed`, `not_clothing`, `detail`, `unsure`), `scanned_at`. Removed with the photo or listing. |
| `policy_item_types` | SELECT | Everyone, guests included (`using (true)`); no writes through the API. Columns `key`, `label`, `kind` (`garment`, `accessory`, `other`), `allowed`, `category`, `item_type`, `garment_type`, `style`, `policy_group`, `noun`, `looks_like`, `reason`, `prompts`, `position`. |
| `app_settings` | SELECT | Everyone, guests included; changed by admins through `set_flag` (P2B). Columns `key`, `enabled`, `description`, `updated_at`. |
| `data_exports` | SELECT | `user_id = auth.uid()` (P3A). Written only by `export_my_data`. Columns `id` (bigint), `user_id`, `exported_at`. Removed with the account. |
| `age_checks` | SELECT | `user_id = auth.uid()` (P2C). Written only by `record_age_check`. Columns `id` (bigint), `user_id`, `source` (`store_signal`, `self_declared`), `result` (`adult`, `minor`, `unknown`), `platform` (`web`, `android`, `ios`), `checked_at`. No birthdate. Removed with the account. |
| `legal_documents` | SELECT | Everyone, guests included; changed only by migrations (P1B). One row per document: `document` (`terms`, `privacy`), `version` (seeded `1.0.0` and `1.0.0`, from the website's `TERMS_VERSION` and `PRIVACY_VERSION`), `url`, `updated_at`. |
| `legal_acceptances` | SELECT | `user_id = auth.uid()`. Written only by `accept_legal` (P1B). Columns `id`, `user_id`, `document`, `version`, `platform` (`web`, `android`, `ios`), `accepted_at`; one row per user, document and version. Removed with the account. |
