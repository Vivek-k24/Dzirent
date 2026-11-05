# Security log

Every Security Advisor warning and how it was handled. Updated by the coordinator from agent handoffs.

## Reference project findings (2026-10-30)

Found in the `Dzirent_Android` project. Handled by rebuilding cleanly in `dzirent-server`, not by editing the reference project.

| Finding | Handling in `dzirent-server` | Status |
| --- | --- | --- |
| 3 functions without a fixed search path | Every function gets a fixed search path | Done (1A) |
| Internal helper functions callable through the API | Not callable through the API | Done (1A) |
| Elevated-rights functions callable by guests | Guests can call shop window functions only | Done (1A) |
| Elevated-rights functions callable by signed-in users | Kept only where needed, each checks the caller, logged below | Done (1A) |
| `delete-account` relies on its own user check | User verified in code | Planned (Step 1.4) |
| Leaked-password protection off | Turned on | Done |
| Signed-in users can read every profile row | Profiles owner-only, public data through shop window | Done (1A), shop window in 1B |

## dzirent-server Advisor check (Step 1B additions)

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| INFO: RLS on, no policies | `us_cities` | Raw table is closed to everyone. Only `search_cities` reads it. |
| WARN: guests can run elevated function | `search_cities` | Guest city search. Returns public city reference data only, bounded results. |
| WARN: signed-in users can run elevated function | `search_cities` | Same as above. |
| WARN: guests can run elevated function | `browse_listings` | Safe guest & signed-in shop window query. Empty search path, bounded results (max 30), returns only safe card fields, no coordinates or account IDs, hides paused and blocked listings. |
| WARN: signed-in users can run elevated function | `browse_listings` | Same as above. |
| WARN: guests can run elevated function | `get_listing` | Safe guest & signed-in listing page. Empty search path, returns only safe listing fields, no coordinates or account IDs, hides paused and blocked listings. |
| WARN: signed-in users can run elevated function | `get_listing` | Same as above. |
| WARN: signed-in users can run elevated function | `get_studio` | Signed-in only (rejects null `auth.uid()`). Returns safe studio profile and up to 30 active piece cards, hides blocked studios. Includes `is_own` flag and coarse `since` month/year without account IDs. Replaces `studio_rental_count` and `studio_reply_minutes`. |
| WARN: signed-in users can run elevated function | `my_saved_listings` | Signed-in only (rejects null `auth.uid()`). Returns caller's own saved listings with `is_available` flag; hides details of paused/blocked listings. |
| WARN: signed-in users can run elevated function | `my_blocked_users` | Signed-in only (rejects null `auth.uid()`). Scoped strictly to caller's own blocks, returns blocked user's display/studio name without exposing private profile rows. |
| WARN: signed-in users can run elevated function | `fit_listings` | Signed-in only (rejects null `auth.uid()`). Reads caller's own measurements from `private_profiles` to match active pieces via Android ease logic; returns safe cards only. |
| WARN: signed-in users can run elevated function | `my_conversations` | Signed-in only (rejects null `auth.uid()`). Scoped strictly to caller's own conversations, returns other party's display or studio name without account ID. |
| WARN: signed-in users can run elevated function | `my_saved_studios` | Signed-in only (rejects null `auth.uid()`). Returns caller's own saved studios with safe fields only. |
| WARN: signed-in users can run elevated function | `save_studio` | Signed-in only (rejects null `auth.uid()`). Resolves handle to lender and saves to caller's `saved_studios` without exposing lender account ID. |
| WARN: signed-in users can run elevated function | `unsave_studio` | Signed-in only (rejects null `auth.uid()`). Resolves handle to lender and removes from caller's `saved_studios`. |
| WARN: signed-in users can run elevated function | `start_conversation` | Signed-in only (rejects null `auth.uid()`). Validates active listing, checks blocks, and creates/updates conversation for caller as renter. |
| WARN: signed-in users can run elevated function | `block_user` | Signed-in only (rejects null `auth.uid()`). Resolves handle to target user ID and blocks target for caller without exposing account IDs. |
| WARN: signed-in users can run elevated function | `unblock_user` | Signed-in only (rejects null `auth.uid()`). Resolves handle to target user ID and removes block relationship. |
| WARN: signed-in users can run elevated function | `report_user` | Signed-in only (rejects null `auth.uid()`). Resolves handle to target user ID and records audit report. |
| WARN: signed-in users can run elevated function | `my_block_peer_ids` | Returns only the caller's own block relationships. |
| WARN: signed-in users can run elevated function | `record_accessory_declaration` | Append-only audit record for the caller. |
| WARN: signed-in users can run elevated function | `record_listing_declaration` | Append-only audit record, caller must own the listing. |
| WARN: signed-in users can run elevated function | `set_conversation_dates` | Renter-only date update through a validated function, no raw update access. Since Step 5B it also refuses blocked pairs (either direction). |

All of these reject callers with no signed-in user (except `search_cities`, `browse_listings`, and `get_listing`).

## dzirent-server Advisor check (Step 7A additions)

Advisor run after the Step 7A migration (2026-11-03): the only new finding is below. `pg_net` is installed in the `extensions` schema; the new tables have RLS and owner policies.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: signed-in users can run elevated function | `register_push_token` | Signed-in only (rejects null `auth.uid()`). Checks the token and platform and saves the token for the caller only. It runs with elevated rights because a token the caller's phone already had under another account must move to the caller (the phone changed hands); owner-only RLS can't do that. Returns nothing; nobody can read another user's tokens. |

Internal push functions (`app_private.queue_push`, `push_safe_text`, `push_dates_label` and the three trigger functions) are not callable through the API.

## Edge Functions

| Function | Check | Status |
| --- | --- | --- |
| `delete-listing` | Gateway JWT check off (required with new API keys). Code verifies the user, confirms the caller owns the listing, runs as the caller under RLS, uses no secret key. Reviewed by coordinator. | Deployed (1A) |
| `delete-account` | Gateway JWT check off. Code verifies caller with Auth (`auth.getUser`), refuses if active rentals exist (409), removes caller's listing photo folders through Storage API, then deletes user via service-role key from function environment only. | Deployed (1B) |
| `send-push` | Gateway JWT check off: only the database calls it. Code requires the shared secret in `x-send-push-secret` (constant-time compare, 401 otherwise), validates the payload, reads and deletes `device_tokens` with the project's secret key from the function environment, and logs counts only (never tokens or message text). | Deployed (7A) |

## Secrets (Step 7A)

| Secret | Where it lives | Handling |
| --- | --- | --- |
| Shared secret (database to `send-push`) | Vault `send_push_secret` (read by the push trigger), Edge Function secret `SEND_PUSH_SECRET` | 32 random bytes generated inside the database by the Step 7A migration, so it is never in the repo. Copied from Vault to the function secret with the CLI through a temporary file in the agent's scratch folder, deleted right after; never printed. To rotate: replace the Vault value and run `supabase secrets set SEND_PUSH_SECRET` with the same value. |
| Firebase server key (service account `dzirent-17c88-firebase-adminsdk-fbsvc`) | Edge Function secret `FIREBASE_SERVICE_ACCOUNT_BASE64`; the file only in `H:\DziRent\secrets\` | Set with `supabase secrets set` from the file (base64), never printed or committed. Used only by `send-push` to get short-lived FCM access tokens. |
| `google-services.json` (Firebase app config) | `H:\DziRent\secrets\` (local builds, path in `GOOGLE_SERVICES_JSON`); GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (release workflow) | Not a server secret, but kept out of this public repo: `.gitignore` lists it, and Gradle reads it from the path without copying it into the repo. |

Vault also holds `send_push_url`, the function's address (public, not a secret).
