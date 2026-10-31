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

### `save_studio` / `unsave_studio`
- **Who can call:** Signed-in only (`authenticated`).
- **Inputs:** `p_handle` (text).
- **Behavior:** Resolves handle to lender without client needing lender account UUID.

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
- `set_conversation_dates(p_conversation_id, p_start, p_end)`: Signed-in renter only.
- `mark_conversation_read(p_conversation_id)`: Signed-in participant only.
- `mark_activity_seen()`: Signed-in only.

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

---

## 3. Raw Database Tables & RLS Rules

Guests have zero access to raw tables. Authenticated clients interact only with rows they own or participate in:

| Table | Operations | RLS Rule |
| --- | --- | --- |
| `profiles` | SELECT, UPDATE | `id = auth.uid()` |
| `private_profiles` | ALL | `user_id = auth.uid()` |
| `listings` | SELECT, INSERT, UPDATE, DELETE | `lender_id = auth.uid()`. INSERT requires lender/both role. UPDATE restricted to safe columns. DELETE requires empty Storage folder. |
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
| `us_cities` | None | Closed to all direct access; query via `search_cities`. |
