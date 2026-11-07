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
  - `messages`: `body`; `reports`: `reason`, `details`.
- Language that isn't allowed (LDNOOBW English list, whole words after normalizing case, accents, repeated letters and swaps such as 0/o, 1/i or l, @/a, $/s) is refused everywhere. Contact details and outside links (phone numbers, email addresses, URLs, `@handles`) are refused only in listings and profiles; chat allows them.
- A refusal is `P0001` with one of these messages, and `hint` = the column name (for example `title`, `body`, `studio_bio`), so apps can show it under the right field:
  - "This text includes language that isn't allowed on Dzirent."
  - "Please remove contact details from your listing; people can message you in Dzirent."
  - "Please remove contact details from your profile; people can message you in Dzirent."
- `check_text(p_text text, p_where text)`: Guest and signed-in. `p_where` is `'listing'`, `'profile'`, `'message'` or `'report'` (else `22023`); text up to 5000 characters. Returns the refusal message, or null when the text is fine. Saving runs the same check; this is for asking first, mainly sign-up's display name (the Auth API hides the database's message when the profile insert at sign-up is refused).

### Photo checks (Step 8A, Step 8B)
- `request_scan(p_listing_id uuid)`: Signed-in listing owner only. Returns the `uuid` of the photo check (a `listing_scans` row) for the listing's current photos. The check runs on the server and usually finishes within a minute (longer when the vision service starts cold). Watch the row until `status` is `done` or `failed`: Realtime `UPDATE` events on `listing_scans` filtered by `id`, with polling by ID as the fallback (Step 8B).
  - One scan at a time per listing: asking again while one is `queued` or `running` returns that scan's ID. Since Step 8B, when the latest check is `done` and covers the current photos (`photo_set_hash`), that check's ID comes back instead of a new one. A scan that hasn't finished after 10 minutes is marked `failed` and a new one can start.
  - Refused: `42501` "Not signed in" / "Not your listing"; `22023` "Add a photo first"; `P0001` "Too many photo checks. Try again in an hour." (20 per lender per hour).
- Automatic re-check (Step 8B): any insert or delete on `listing_photos` of an `active` listing, or a change of a photo's `storage_path`, `slot` or `listing_id`, queues a check the same way as `request_scan` (same 20-an-hour limit). Apps don't call anything for it. The listing stays `active` while the check runs.
- Automatic pause (Step 8B), only while `vision_required` is on: when that check of an `active` listing ends with a result that isn't `allowed`, or fails, the server sets the listing to `paused` and writes a plain sentence to `listings.auto_paused_reason`: "Paused: <reason>" for a rejection, otherwise "Paused: the new photos need a check before this listing can go live again." If the photos changed again while the check ran, the server checks again instead. If the 20-an-hour limit stops a re-check, the listing is paused with "Paused: the photos changed too often to check right now. Check them again in an hour." While the flag is off, photos are re-checked only and nothing is ever paused.
- Content safety (P2A), in the vision service: any photo (size tags and close-ups included) that the safety model reads as clear nudity or sexual content makes the verdict `rejected` with "This photo isn't allowed on Dzirent."; an uncertain one makes it `review` ("Someone at Dzirent will check these photos before this listing can go live.") unless it is already rejected; a photo read as a hooded garment turns `allowed` into `review` ("This piece has a hood, so someone at Dzirent will check it."). A piece being worn never changes the verdict and never adds a warning. Each photo's `labels` (in `photo_scans`) now also carry `hooded` and `safety.nsfw`.
- `listings.auto_paused_reason` (text, at most 300 characters, Step 8B): why the server paused the listing; apps show it on paused listings. Written only by the server: apps can't update it, and a listing inserted by an app always starts without one. A successful republish (`status` set to `active`, flag on or off) clears it.
- `policy_item_types` (table below): what can be listed, readable by everyone, guests included. Allowed rows give the listing's own `category`, `item_type` (accessories), `garment_type` and `style`; the others give the `reason` shown to the lender.
- `app_settings` (table below): feature flags, readable by everyone, changed only by migrations. `vision_required`, `verification_required` and `payments_enabled` are all off.
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
| `profiles` | SELECT, UPDATE | `id = auth.uid()` |
| `private_profiles` | ALL | `user_id = auth.uid()`. `measurements_consent_at` (P1B) is written only by `give_measurements_consent` / `withdraw_measurements_consent`; body measurements need it (see "Terms acceptance and measurements consent"). |
| `listings` | SELECT, INSERT, UPDATE, DELETE | `lender_id = auth.uid()`. INSERT requires lender/both role. UPDATE restricted to safe columns. DELETE requires empty Storage folder. `auto_paused_reason` (Step 8B) is read-only for apps. |
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
| `reports` | SELECT, INSERT | `reporter_id = auth.uid()` |
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
| `app_settings` | SELECT | Everyone, guests included; changed only by migrations. Columns `key`, `enabled`, `description`, `updated_at`. |
| `legal_documents` | SELECT | Everyone, guests included; changed only by migrations (P1B). One row per document: `document` (`terms`, `privacy`), `version` (seeded `1.0.0` and `1.0.0`, from the website's `TERMS_VERSION` and `PRIVACY_VERSION`), `url`, `updated_at`. |
| `legal_acceptances` | SELECT | `user_id = auth.uid()`. Written only by `accept_legal` (P1B). Columns `id`, `user_id`, `document`, `version`, `platform` (`web`, `android`, `ios`), `accepted_at`; one row per user, document and version. Removed with the account. |
