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

## dzirent-server Advisor check (Step 8A additions)

Migration `20261105200000_step8a_photo_scanning.sql` (2026-11-05). `vector` (pgvector 0.8.2) is installed in the `extensions` schema. All four new tables have RLS and explicit grants (checked with `has_table_privilege` / `has_function_privilege` for `anon`, `authenticated` and `service_role`). Advisor run after the migration (2026-11-06 02:33 UTC): the only new finding is below; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: signed-in users can run elevated function | `request_scan` | Signed-in only (rejects null `auth.uid()`), owner only ("Not your listing" otherwise). It needs elevated rights to insert the `listing_scans` row (owners can only read scans) and to read the Vault secret for the call to `scan-listing`. One scan at a time per listing and 20 per lender per hour (cost guard for the vision service). Returns only the scan ID. |

By design, not Advisor findings:
- `policy_item_types` and `app_settings` are readable by guests: the item policy and the feature flags are public reference data, "readable by everyone" as Step 8A asked. SELECT `using (true)` for `anon` and `authenticated`, and no INSERT/UPDATE/DELETE grant to any API role (`service_role` included), so only migrations change them. This is a deliberate exception to "guests have no access to any raw table"; neither table holds anything about users.
- `vision_start_scan`, `vision_finish_scan`, `vision_fail_scan` are in `public` so `scan-listing` can call them through the API, but EXECUTE is granted only to `service_role` (revoked from `public`, `anon`, `authenticated`). They run as the caller, not elevated.
- `app_private.photo_set_hash` and `app_private.vision_publish_gate` are not callable through the API (`app_private` is not exposed). `photo_set_hash` is granted to `authenticated` only because the publish gate runs as the listing owner and calls it; it reads `listing_photos` under the caller's RLS, so it can only hash photos the caller already sees.

Publish gate (`listings_vision_publish_gate`, BEFORE INSERT or UPDATE OF `status` on `listings`): runs as the caller. With `vision_required` on, a client can make a listing `active` only when its latest scan is `done`, covers the current photo set (`photo_set_hash`) and was `allowed` or admin-`approved`. Server roles and migrations are not stopped (same rule as the accessory declaration trigger). The flag is off, and only a migration can turn it on.

## dzirent-server Advisor check (Step 8B additions)

Migrations `20261106040000_step8b_photo_policy.sql`, `20261106050000_step8b_sweater_prompts.sql` and `20261106070000_step8b_server_role_helpers.sql`, plus two for the API test only: `20261106080000_step8b_test_vision_on.sql` and `20261106081000_step8b_test_vision_off.sql` (2026-11-05). Advisor run after all of them (2026-11-06 04:39 UTC): no new findings. The list is the same as after Step 8A (`request_scan` was already on it, above).

- New helpers in `app_private` (not exposed through the API): `vision_required`, `queue_scan`, `vision_pause`, `recheck_active_listing` and the trigger function `rescan_on_photo_change`. They run with elevated rights and an empty search path. EXECUTE is revoked from `public`, `anon` and `authenticated` (checked with `has_function_privilege`). `request_scan` now goes through `queue_scan`; its checks (signed in, owner only, 20 checks per lender per hour) are unchanged.
- `service_role` got USAGE on `app_private` and EXECUTE on `vision_pause` and `recheck_active_listing`, nothing else (`..._server_role_helpers`). `vision_finish_scan` and `vision_fail_scan` run as `service_role` (called by `scan-listing`) and call these two for active listings. Without the grant, a check of an active listing could be neither saved nor marked failed, and stayed `running` until the 10-minute timeout. The Step 8B API test found this. `anon` and `authenticated` got nothing new.
- Triggers `listing_photos_rescan_insert_delete` and `listing_photos_rescan_update` on `listing_photos`: a photo change on an active listing queues a check (same 20-an-hour cost guard; when the guard stops it while `vision_required` is on, the listing is paused, so changed photos never stay live unchecked). Errors in the trigger are caught: a photo change never fails because of the check.
- `listings.auto_paused_reason`: written only by the server. Apps have no UPDATE right on the column (column-level grants), and the publish gate clears it on every insert by an app, so a lender can't set or hide a pause reason. A successful republish through the gate clears it.
- Automatic pause happens only while `vision_required` is on. It was on for about two minutes for the Step 8B API test (`..._test_vision_on`, then `..._test_vision_off`; off again at 04:26 UTC) and is off.
- `listing_scans` is in the `supabase_realtime` publication. Realtime sends a change only to subscribers whose RLS lets them read the row (the listing's owner), the same rule as reading the table.

## dzirent-server Advisor check (P1B part 1 additions)

Migration `20261106120000_p1b_legal_and_consent.sql` (2026-11-06). Both new tables have RLS and explicit grants (checked with `has_table_privilege` and `has_function_privilege` for `anon`, `authenticated` and `service_role`). Advisor run after the migration (2026-11-07 01:03 UTC): the three findings below are new; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: signed-in users can run elevated function | `accept_legal` | Signed-in only (rejects null `auth.uid()`), checks the platform. It needs elevated rights to insert into `legal_acceptances`, which apps can only read. It records only the caller's acceptance of the current versions; returns nothing. |
| WARN: signed-in users can run elevated function | `give_measurements_consent` | Signed-in only. It needs elevated rights because apps can't write `measurements_consent_at` (the consent trigger keeps the stored value for `authenticated` and `anon`). Touches only the caller's own `private_profiles` row; returns only the consent time. |
| WARN: signed-in users can run elevated function | `withdraw_measurements_consent` | Signed-in only. Same reason: it clears `measurements_consent_at` with the caller's six body measurements, on the caller's own row only. Returns nothing. |

By design, not Advisor findings:
- `legal_documents` is readable by guests (the current terms and privacy versions are public), like `app_settings`. No INSERT/UPDATE/DELETE grant to any API role, `service_role` included: only migrations change it.
- `legal_acceptances`: owners read their own rows; no API role can write it directly (only `accept_legal`). `service_role` can read it (for the admin tool and data download later).
- `needs_legal_acceptance` runs as the caller (not elevated): it reads the public versions and the caller's own acceptances under RLS.
- `app_private.require_measurements_consent` (trigger on `private_profiles`) is not callable through the API; EXECUTE revoked from `public`, `anon` and `authenticated`.

## dzirent-server Advisor check (P2A additions)

Migrations `20261107010000_p2a_text_filter.sql` and `20261107012000_p2a_text_filter_one_as_l.sql` (2026-11-07). `unaccent` is installed in the `extensions` schema. Advisor run after both (2026-11-07 02:47 UTC): the four findings below are new; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: guests can run elevated function | `check_text` | Sign-up's display-name check runs before there is an account. It returns only the refusal message or null, never the word list or which word matched. It needs elevated rights to read the closed lists in `app_private`. Input capped at 5000 characters; `p_where` must be one of four values. |
| WARN: signed-in users can run elevated function | `check_text` | Same as above. |
| INFO: RLS on, no policies | `app_private.text_filter_terms` | The word list (LDNOOBW English). Closed to every API role (no grants, not in an exposed schema); only the elevated `app_private.text_refusal` reads it. |
| INFO: RLS on, no policies | `app_private.text_filter_allowed` | The allowlist. Same handling. |

By design, not Advisor findings:
- The triggers on `listings`, `profiles`, `messages` and `reports` run as the person writing. They call `app_private.check_text_field` (elevated, reads the lists through `text_refusal`). EXECUTE on it is granted to `authenticated` and `service_role` only because of these triggers; `app_private` is not exposed, so it can't be called through the API. Every other new function (`filter_normalize`, `filter_pattern`, `text_has_contact`, `text_refusal`, the four trigger functions) has EXECUTE revoked from `public`, `anon` and `authenticated`.
- A refusal never says which word matched (only the plain-words reason and the column name).

## Admin role (P2B part 1)

Migrations `20261107100000_p2b_admin_core.sql` and `20261107101000_p2b_admin_functions.sql`, the Edge Function `admin-actions` and the seed script `supabase/seed/admins.mjs` (2026-11-07).

- **Who is an admin:** an account in `app_private.admin_users`. The table is closed to every API role, `service_role` included. Only the seed script changes it; it syncs to `ADMIN_EMAILS` (secrets, never the repo) and logs every change.
- **Two-step sign-in required:**
  - `app_private.require_admin()` is the first statement of every admin function. It refuses unless the caller is in `admin_users` **and** the JWT says `aal2` (Supabase MFA, TOTP).
  - Hosted Auth has TOTP enroll and verify on and `mfa_allow_low_aal = false` (read 2026-11-07).
  - The API test showed an admin at `aal1` refused by all 23 functions and by the Edge Function.
- **Admin log:**
  - `app_private.admin_actions` gets one row per admin call (reads included), with before and after snapshots.
  - A trigger refuses every UPDATE and DELETE, and TRUNCATE, for every role, `postgres` included. The test showed an update refused.
  - It has no foreign keys, so rows outlive the people in them.
- **Ban function:** `admin-actions`, gateway JWT check off.
  - It validates the token with Auth, then asks the database `is_admin()` with the caller's own token.
  - Only after that does it use `SUPABASE_SERVICE_ROLE_KEY`, from the function environment, for `auth.admin.updateUserById` (ban, unban) and Storage `remove` (photo files).
  - The database step after it (`admin_record_ban`, `admin_remove_photos`) runs with the caller's token, so it checks the admin again and writes the log.
  - Self-ban is refused. It logs only the action name and counts.
- **Report evidence:** `app_private.report_evidence` is closed to API roles, and a trigger refuses updates for every role. Reporters can't read the evidence; admins see it through `admin_list_reports`.
  - It is captured by elevated helpers that the reports triggers call as the reporter: `report_target_user`, `capture_report_evidence`.
  - Message reports are limited to the reporter's own chats, so a reporter can't capture someone else's chat by guessing a message id.
- **Suspension columns:** a trigger keeps `profiles.suspended_until` and `suspension_reason` for app roles; `authenticated` has table-wide UPDATE on `profiles`, so a column grant wouldn't stop it.
- **Hold columns:** `listings.hold` and its companions are kept by a trigger for app roles. They aren't in the column UPDATE grant anyway, and app inserts start with no hold.

Advisor run after the migrations (2026-11-07 04:01 UTC): the findings below are new; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: signed-in users can run elevated function | `is_admin` | Returns only true or false for the caller. It needs elevated rights to read the closed `admin_users`. |
| WARN: signed-in users can run elevated function (×23) | `admin_queues`, `admin_list_reports`, `admin_list_scan_reviews`, `admin_list_takedowns`, `admin_list_id_reviews`, `admin_dismiss_report`, `admin_warn_user`, `admin_remove_reported_content`, `admin_suspend_user`, `admin_unsuspend_user`, `admin_record_ban`, `admin_decide_scan`, `admin_hide_listing`, `admin_unhide_listing`, `admin_create_takedown`, `admin_takedown_remove_listing`, `admin_remove_photos`, `admin_record_counter_notice`, `admin_set_takedown_status`, `set_flag`, `admin_metrics`, `admin_find_user`, `admin_audit_log` | The admin website calls them as the signed-in admin. Each one's first statement is `require_admin()` (admin + `aal2`), and each writes the admin log. Not callable by guests (EXECUTE revoked from `public` and `anon`). |
| INFO: RLS on, no policies (×5) | `app_private.admin_users`, `admin_actions`, `report_evidence`, `settings`, `takedown_requests` | Closed to every API role (no grants, not in an exposed schema); read and written only by the elevated admin functions and helpers. |

By design, not Advisor findings:
- **Helpers callable by `authenticated`** (`app_private`, not exposed): `suspension_message`, `report_target_user` and `capture_report_evidence`. The reports, messages, conversations and listings triggers run as the person writing and need them.
- **Revoked from `public`, `anon` and `authenticated`:** every other new `app_private` function (`require_admin`, `log_admin_action`, `hold_listing`, `release_listing`, `report_snapshot`, `purge_expired_reports`, `close_report`, `set_suspension`, the trigger functions).
- **`set_flag` replaces "flags change only through migrations"** (decisions.md "Admin"). Each switch is logged with before and after.

## Google Cloud (Step 8A)

Project `dzirent`, region `us-west1`. The $20 billing kill switch (budget, Pub/Sub topic `billing-alerts`, function `stop-billing`) was not touched.

| Item | Handling |
| --- | --- |
| Cloud Run service `vision` | No unauthenticated access (`--no-allow-unauthenticated`): every request needs a Google ID token from an account with `roles/run.invoker` on the service. Min 0, max 1 instance, 2 CPU, 4 GiB, 120 s timeout, concurrency 4, CPU only (no GPU). It holds no keys, never calls Supabase, and downloads photos only from URLs under the public `listing-photos` bucket prefix (`VISION_ALLOWED_URL_PREFIXES`; no redirects, 15 MB and 40 megapixel limits); `data:` image URLs are decoded without any network call. Logs counts and verdicts only, never URLs or photos. |
| Service account `vision-runtime` | The service runs as this account. It has no project roles. |
| Service account `vision-invoker` | Only `roles/run.invoker` on the `vision` service (a service-level binding, not a project role). `scan-listing` signs in as it to get a one-hour ID token for the service URL. |
| `vision-invoker` key | One user-managed key. The file exists only in `H:\DziRent\secrets\vision-invoker-key.json`; its base64 is the Edge Function secret `VISION_INVOKER_KEY_BASE64`, set with `supabase secrets set` from a temporary file in the agent's scratch folder, deleted right after; never printed or committed. The key can only call the vision service. To rotate: create a new key, set the secret again, delete the old key (`gcloud iam service-accounts keys delete`). |

## Secrets (Step 8A)

| Secret | Where it lives | Handling |
| --- | --- | --- |
| Shared secret (database to `scan-listing`) | Vault `scan_listing_secret` (read by `request_scan`), Edge Function secret `SCAN_LISTING_SECRET` | 32 random bytes generated inside the database by the Step 8A migration, never in the repo. Copied from Vault to the function secret with the CLI through a temporary file in the agent's scratch folder, deleted right after; never printed. A separate secret from `send_push_secret`. To rotate: replace the Vault value and set `SCAN_LISTING_SECRET` again. |
| `vision-invoker` key | `H:\DziRent\secrets\vision-invoker-key.json`; Edge Function secret `VISION_INVOKER_KEY_BASE64` | See Google Cloud above. |
| Vision service address | Edge Function secret `VISION_URL` | Not a secret (useless without a token), kept with the other function settings. |

Vault also holds `scan_listing_url`, the function's address (public, not a secret).

## Edge Functions

| Function | Check | Status |
| --- | --- | --- |
| `delete-listing` | Gateway JWT check off (required with new API keys). Code verifies the user, confirms the caller owns the listing, runs as the caller under RLS, uses no secret key. Reviewed by coordinator. | Deployed (1A) |
| `delete-account` | Gateway JWT check off. Code verifies caller with Auth (`auth.getUser`), refuses if active rentals exist (409), removes caller's listing photo folders through Storage API, then deletes user via service-role key from function environment only. | Deployed (1B) |
| `send-push` | Gateway JWT check off: only the database calls it. Code requires the shared secret in `x-send-push-secret` (constant-time compare, 401 otherwise), validates the payload, reads and deletes `device_tokens` with the project's secret key from the function environment, and logs counts only (never tokens or message text). | Deployed (7A) |
| `admin-actions` | Gateway JWT check off. Code validates the caller with Auth, then requires `is_admin()` (admin + two-step sign-in) asked with the caller's own token (403 otherwise). Uses the service role key from the function environment only for the Auth ban/unban and deleting photo files; the database step runs as the caller and writes the admin log. | Deployed (P2B) |
| `scan-listing` | Gateway JWT check off: only the database calls it. Code requires the shared secret in `x-scan-listing-secret` (constant-time compare, 401 otherwise) and a scan ID that is `queued` (else 409). Uses the project's secret key only for the three server-only `vision_*` functions, and the `vision-invoker` key only to get an ID token for the vision service. Sends the vision service public photo URLs only. Any failure marks the scan failed (verdict review). Logs counts, verdicts and error codes only. Not changed in Step 8B; the automatic re-check calls it the same way. | Deployed (8A) |

## Secrets (Step 7A)

| Secret | Where it lives | Handling |
| --- | --- | --- |
| Shared secret (database to `send-push`) | Vault `send_push_secret` (read by the push trigger), Edge Function secret `SEND_PUSH_SECRET` | 32 random bytes generated inside the database by the Step 7A migration, so it is never in the repo. Copied from Vault to the function secret with the CLI through a temporary file in the agent's scratch folder, deleted right after; never printed. To rotate: replace the Vault value and run `supabase secrets set SEND_PUSH_SECRET` with the same value. |
| Firebase server key (service account `dzirent-17c88-firebase-adminsdk-fbsvc`) | Edge Function secret `FIREBASE_SERVICE_ACCOUNT_BASE64`; the file only in `H:\DziRent\secrets\` | Set with `supabase secrets set` from the file (base64), never printed or committed. Used only by `send-push` to get short-lived FCM access tokens. |
| `google-services.json` (Firebase app config) | `H:\DziRent\secrets\` (local builds, path in `GOOGLE_SERVICES_JSON`); GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (release workflow) | Not a server secret, but kept out of this public repo: `.gitignore` lists it, and Gradle reads it from the path without copying it into the repo. |

Vault also holds `send_push_url`, the function's address (public, not a secret).
