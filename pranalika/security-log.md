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

## Age gate (P2C)

Migrations `20261107120000_p2c_age_gate.sql` and `20261107121000_p2c_preview_label.sql` (2026-11-07).

- **No birthdate anywhere:** `age_checks` holds only source, result, platform and time. The owner can read their own rows; nobody can write them except `record_age_check` (no table grants beyond SELECT).
- **The block:** a trigger named `age_gate` on 22 app-writable tables refuses inserts and updates while `app_private.age_blocked(auth.uid())` is true. It keys on the caller (`auth.uid()`), not the row owner, so admins acting on the account, server jobs (no user) and account deletion through the Auth admin API are not stopped. Deletes are not blocked.
- **The skip setting:** `dzirent.age_gate_skip` is set, transaction-local, only inside `mark_activity_seen` (so a blocked account can still read its inbox) and inside `record_age_check` (to pause the account's listings). Clients can't set Postgres settings through PostgREST, and `set_config` isn't in an exposed schema.
- **Known limit: the signal is client-reported.** Google Play Age Signals has no server-side verification, so `record_age_check` trusts what the app sends. A person calling the API directly could send a store `adult` to lift their own block. The apps never do this; closing it needs a verified signal, or ID verification (P6A). A self-declared `adult` never lifts a block.
- **Elevated helpers:** `app_private.age_blocked` and `app_private.refuse_minor_account` have EXECUTE revoked from `public`, `anon` and `authenticated`. The trigger function is elevated, so it doesn't need the helper granted to app roles.

Advisor run after the migrations (2026-11-07 18:06 UTC): one new finding; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: signed-in users can run elevated function | `record_age_check` | Apps record the caller's own age check. It writes only the caller's row (`auth.uid()`), validates every input against a fixed list, and returns only true or false. It needs elevated rights because `age_checks` has no insert grant. Not callable by guests (EXECUTE revoked from `public` and `anon`). |

## Download my data (P3A)

Migration `20261107130000_p3a_data_export.sql` and the Edge Function `export-my-data` (2026-11-07).

- **Only the caller's own data:** `export_my_data()` takes no arguments and reads `auth.uid()` only. Every query is filtered by the caller's id. It was read through, query by query, against this rule before it shipped.
  - Other people appear only through `app_private.export_person`: a name (studio name, else display name) and a studio handle. That is what the shop window and the chat list already show. Never their account id, email, city, location, measurements or anything else.
  - Messages in the caller's own chats are included, the other person's too: the caller can already read them, and each is marked only "you" or "other person".
  - Saved pieces show a title only while the piece is public (active, not blocked either way).
  - Reports the caller filed give the reason, details and open or closed. Not the outcome, admin notes, evidence, or reports about the caller.
  - Photo checks' `duplicate` is only true or false, never which listing matched.
- **The function holds no server key.** It verifies the token with Auth in code (gateway check off, like `delete-account`), then calls `export_my_data` with the caller's own token. A bug in the function can't export someone else.
- **Once a day:** `public.data_exports` records each export (owner reads their own; no write grants). A transaction-level advisory lock stops two parallel calls from both passing. A refusal is HTTP 429 with "You can download your data once a day. Try again after <time> UTC."
- **Photo links** in the file are the public `listing-photos` URLs of the caller's own photos, which anyone with the link could open already.
- **On the phone:** the downloaded file stays in memory only (for a retry if the save picker is cancelled), for that account and day, and is dropped on sign-out. It is written only where the user chooses in the system picker.
- `public.age_blocked()` returns only true or false for the caller (the website's blocked page).
- The API test checked that test user 1's email and account id are nowhere in test user 3's file. Every other-person entry holds only a name and handle, and every message only from, text and time.

Advisor run after the migration (2026-11-07 18:59 UTC): two new findings; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| WARN: signed-in users can run elevated function | `export_my_data` | Returns the caller's own data only (above), once a day. It needs elevated rights to read `auth.users` (the caller's email) and to write `data_exports`. Not callable by guests. |
| WARN: signed-in users can run elevated function | `age_blocked` | Returns only true or false for the caller. It needs elevated rights to read the decision in `app_private`. Not callable by guests. |

`app_private.export_person` has EXECUTE revoked from `public`, `anon` and `authenticated`.

## Cleanup and retention jobs (P3B)

Migration `20261107140000_p3b_cleanup_jobs.sql` and the Edge Function `cleanup-files` (2026-11-07).

- **Everything starts in count-only mode.** A job deletes only when its `app_settings` switch `cleanup_<job>` is on. Only admins change switches (`set_flag`: admin + two-step sign-in, logged in the admin log).
- **Nightly schedule (pg_cron, installed by this migration):** `dzirent-cleanup-database` at 09:15 UTC runs `app_private.run_cleanup_jobs()`. `dzirent-cleanup-files` at 09:30 UTC runs `app_private.request_file_cleanup()`.
- **File deletions** go through `cleanup-files` and the Storage API with the server key, never by deleting storage rows. An abandoned draft's folder is emptied first and the listing row deleted after. The existing trigger refuses to delete a listing whose folder still has files, so a half-failed run can't leave a listing pointing at deleted photos.
- **`cleanup-files` auth:** the header `x-cleanup-secret` must match the function secret `CLEANUP_FILES_SECRET`, compared in constant time; gateway JWT check off. Anything else gets 401. The value was generated inside the database (Vault `cleanup_files_secret`; `cleanup_files_url` is the address). I copied it into the function secret through a temporary file in my scratch folder, deleted right after. Never printed or committed.
- **What the function may delete** comes only from `public.cleanup_file_plan()`, callable only with the server key (`service_role`). It can't be asked to delete arbitrary files. `public.cleanup_record_run()` is also `service_role` only, and accepts only the two file jobs.
- **Age checks:** the cleanup always keeps the latest decisive check (a store minor or adult), so it can never lift an age-gate block.
- **Never purged:** the admin log (`app_private.admin_actions`, still append-only) and takedown records (`app_private.takedown_requests`).
- **Revoked from `public`, `anon` and `authenticated`:** every new `app_private` function, and `cleanup_file_plan` / `cleanup_record_run` (granted to `service_role` only).
- **Listings `updated_at` and `published_at`** are written by triggers. Apps can't set them: they aren't in the column grants, and the trigger overwrites them.

Advisor run after the migration (2026-11-07 19:41 UTC): two new findings; the earlier findings are unchanged.

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| INFO: RLS on, no policies | `app_private.job_runs` | Closed to every API role (no grants, not in an exposed schema). Written by the job functions, read by admins through `admin_cleanup_status`. |
| WARN: signed-in users can run elevated function | `admin_cleanup_status` | The admin overview's cleanup card. Its first statement is `require_admin()` (admin + `aal2`), and it writes the admin log. Not callable by guests. |

## Security hardening (P5A)

Migrations `20261110230000_p5a_security_hardening.sql` and `20261110231000_p5a_admin_code_24h.sql`, the shared Edge Function input check `supabase/functions/_shared/input.ts` (all 7 functions redeployed), website headers in `apps/web/next.config.ts`, phone session storage, GitHub settings, Auth inactivity timeout (2026-11-10).

### Database audit

Read live on 2026-11-10 (catalog queries for `anon`, `authenticated` and `service_role`, plus both Advisors):
- **Every table has RLS:** no table in `public` or `app_private` without it. There are no views.
- **Every function has a fixed search path:** none in `public` or `app_private` without one (extension functions excluded).
- **Guests reach only:**
  - the shop window and public reference functions: `browse_listings`, `get_listing`, `search_cities`, `check_text`;
  - the three public reference tables: `app_settings`, `legal_documents`, `policy_item_types` (SELECT only).
- **Signed-in users run elevated functions** only where the lists above already log a reason. Nothing was found to fix.
- **`app_private` helpers callable by `authenticated`:** `capture_report_evidence`, `check_text_field`, `is_blocked`, `photo_set_hash`, `report_target_user`, `suspension_message`. `app_private` isn't exposed through the API, so none of them can be called directly. They are granted because triggers and RLS policies run as the person writing need them. `is_blocked` (not listed before) is used by the `conversations` and `messages` policies and the chat triggers.
- **Storage:** four owner policies on `listing-photos`: read, insert, update, delete, each only for a listing the caller owns. Before P5A the bucket had no type or size limit. Fixed below.
- **Performance Advisor:** 11 foreign keys had no covering index. All 11 got one in this migration. Left as they are:
  - "unused index" (INFO): the new indexes have simply not been read yet. The two trigram search indexes are kept for search.
  - "Auth DB connections absolute" (INFO, 10 connections): an Auth setting, and P5A changes no Auth setting except the inactivity timeout.

### Terms and rate limits

- **Trigger `app_private.terms_and_limits`** (elevated, empty search path, EXECUTE revoked from `public`, `anon`, `authenticated`) on `messages`, `conversations`, `reports`, `saved_listings`, `saved_studios` and `listings`.
  - It acts only when the signed-in caller writes their own row, so server jobs and admins acting on other people's rows are not stopped.
  - It calls `app_private.require_current_terms`, then `app_private.enforce_rate_limit`. Both are elevated helpers, not callable through the API.
- **Rate counters:** `app_private.rate_counters` holds one row per person and action: window start and count. It has RLS and no grants to any API role (`service_role` included), and is removed with the account.
  - The limits are `rate_limit_*` rows in the closed `app_private.settings`.
  - A refused write rolls back its own count.
  - `queue_scan` uses the same helper for its photo-check cost guard: 30 an hour, was 20.
- **API test (2026-11-10):**
  - Test user 4 hadn't accepted the current terms. A message and a save were refused with the terms sentence. After `accept_legal('web')` the same message went through.
  - Test user 3 sent 30 messages within a minute, and the 31st was refused with "You're doing that too often. Try again in a bit."

### Chat messages

- The `messages_filter_text` trigger and `app_private.filter_message_text` are dropped. Nothing checks or logs chat text.
- `check_text(…, 'message')` answers null.
- Listings, profiles and report reasons are filtered exactly as before. The API test showed a filter-list word accepted in a chat message and refused in a listing title.

### Uploads

- `listing-photos` now has `allowed_mime_types` (`image/jpeg`, `image/png`, `image/webp`) and `file_size_limit` 10 MB.
- The insert and update policies accept only `{listing_id}/{random}.jpg` (16 to 64 of `A-Za-z0-9_-`), and still only for the uploader's own listing.
- **API test:**
  - `image/gif` was refused (Storage 415);
  - 10 MB + 1 KB was refused (Storage 413);
  - a `.png` name was refused (RLS 403).
  - Nothing was stored.
- **Accepted risk: photo metadata.** Both apps and the website re-encode photos before upload, which drops metadata such as location. A direct API upload isn't re-encoded and can keep it, because Storage doesn't strip metadata. Only a listing's owner can upload to its folder, so this can only expose the uploader's own data, through their own choice. Re-encoding on the server would need a processing step on every upload; not done.

### Edge Functions

- All 7 read their body through `readInput`. It accepts one JSON object, within a size limit (1 to 16 KB per function), and refuses unknown fields and missing required ones. The error is HTTP 400 or 413 with a plain sentence.
- `admin-actions` no longer returns the database's reply (`detail`) in errors. It also caps `reason` at 500 characters and `photo_ids` at 20.
- **Test:**
  - `delete-listing` refused an unknown field, a non-JSON body and a non-uuid id.
  - `export-my-data` and `delete-account` refused an unknown field.
  - `admin-actions` refused a non-admin (403).
  - `send-push`, `scan-listing` and `cleanup-files` refused a request without the secret (401).
  - The 31 database calls to `send-push` during the API test were all accepted (HTTP 200).

### Sessions (Supabase Auth, read back from the management API 2026-11-10)

| Setting | Value |
| --- | --- |
| Access token (JWT) lifetime `jwt_exp` | 3600 s (1 hour) |
| Refresh token rotation | on |
| Refresh token reuse interval | 10 s |
| Inactivity timeout `sessions_inactivity_timeout` | 720 hours (30 days). Set in P5A; was 0 (off). The only Auth setting changed |
| Time-box `sessions_timebox` | 0 (no fixed lifetime) |
| Single session per user | off |

Supabase checks the timeout when a session refreshes, so a session ends at most 30 days plus one access-token lifetime after its last use.

**Admin code every 24 hours:**
- `app_private.admin_code_fresh()` reads the session JWT's `amr` claim and is true when a TOTP check happened in the last 24 hours. The claim's format was checked on a real test-user token. Supabase updates the TOTP entry on each verify.
- `require_admin()` refuses with "Enter a new two-step code to keep using admin tools", and `is_admin()` is false, when the check is older.
- So the website, its server actions, `admin-actions` and direct API calls all follow the same rule. The website shows the code step and then reloads the page that was asked for.
- Checked with simulated claims: a TOTP entry 1 hour old passes; 25 hours old and password-only are refused.

### Phone session storage

- **Before P5A:** supabase-kt's default `SettingsSessionManager` kept the session in plain app storage: Android SharedPreferences and iPhone NSUserDefaults. Android backup was on.
- **Now:** `SecureSessionManager` in shared code, behind the `SecureStore` interface.
  - **Android:** AES-256-GCM, with the key generated in and never leaving the Android Keystore (alias `dzirent_session_key`). Only the ciphertext is in the private SharedPreferences `dzirent_secure_session`. The new `DzirentApplication` sets it up before any activity or the push service runs. `android:allowBackup="false"` (compliance gap 18).
  - **iPhone:** the Keychain through multiplatform-settings' `KeychainSettings`, service `com.dzirent.app.session`. **Not built yet:** iOS code can't compile on Windows; it's on the list for the Mac check.
- A session that an earlier version left in plain storage is moved over on first launch and deleted there, so nobody is signed out by the update.
- If the encrypted value can't be read, for example after a phone reset, it is deleted and the person signs in again.
- Unit tests run without secure storage and keep sessions in memory only.

### Website security headers (served by `next start` of the production build, 2026-11-10)

On every path (home and a listing page checked):
- `Content-Security-Policy`:
  - `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `frame-src 'none'`, `upgrade-insecure-requests`.
  - Scripts and styles: `'self' 'unsafe-inline'`.
  - Images: `'self' blob: data:` and the Supabase project.
  - Connections: `'self'`, the Supabase project and its `wss:` Realtime address.
  - Fonts, manifest, media and workers: self (media and workers also `blob:`).
  - On Vercel preview deployments only, the Vercel toolbar's addresses are added (`vercel.live`, `vercel.com`, `assets.vercel.com`, `ws-us3.pusher.com`).
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`, with no `preload`: that's a separate decision for the owner.
- `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`.
- `Permissions-Policy: camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), display-capture=()`.

**Accepted:** `'unsafe-inline'` for scripts. Next.js streams pages with inline scripts. Nonces would make every page dynamic, including the static legal pages. The rest of the policy still stops outside scripts, framing, plugins and form posts to other sites.

**Checked locally:**
- the listing page's photo links load from the allowed Supabase origin;
- sign-in through the site's own form returned 303 with the auth cookie, and the inbox then showed the user's chats.

**Not checked in a browser** (no browser was used): live chat over Realtime, uploads, the admin area. They use only the origins above.

### GitHub (`Vivek-k24/Dzirent`, set with `gh` 2026-11-10)

- Vulnerability alerts on (were off) and Dependabot security updates on (were off).
- Secret scanning and push protection were already on.
- CodeQL default setup configured for `actions`, `javascript-typescript`, `python` and `java-kotlin`. Swift is left out because it needs a macOS build of the shared framework.
- `.github/dependabot.yml`: npm (`apps/web`), Gradle (`mobile`), pip (`services/vision`) and GitHub Actions, weekly, one group each. Its pull requests target `main`, the default branch; the owner merges.

### Bot check (research only; no Auth setting changed)

- **What Supabase Auth supports:** hCaptcha and Cloudflare Turnstile. When captcha is on, Auth requires a captcha token on sign-up, password sign-in and password reset, for every client at once.
- **Website:** both work: the widget runs in the page and its token goes with sign-up.
  - It needs the provider's script and frame address added to the CSP above.
  - The privacy page would need to name the provider.
- **Android and iPhone:**
  - **hCaptcha** has official native SDKs: `hcaptcha-android-sdk` (Android) and `HCaptcha` (iOS, Swift Package or CocoaPods). The shared code would ask the platform for a token through an interface, like the age signals, and send it with sign-up.
  - **Turnstile** has no native mobile SDK. It would need a WebView hosting the widget on each phone.
- **Recommendation: hCaptcha.** It is the one service with native SDKs on both phones and support in Supabase Auth.
- **Why it stays off for now:**
  - Turning it on in Auth applies to all clients immediately, and the installed Android test app sends no token, so sign-up and sign-in would break there until the update reaches everyone.
  - The iPhone part needs the Mac session.
  - The provider must be added to the privacy policy and the store data forms.
  - The rate limits above and Auth's own IP limits cover the current preview audience.
- **Planned for P8C:** all three clients ship the token first, then captcha is switched on.

### Advisor run after both migrations (2026-11-10 22:36 UTC)

- **Security:** 67 findings, all intended:
  - 10 INFO "RLS on, no policies": the 9 already logged, plus `app_private.rate_counters`, closed to every API role and used only by the elevated rate-limit helpers.
  - 4 WARN guest-callable elevated functions: `browse_listings`, `get_listing`, `search_cities`, `check_text`, logged above.
  - 53 WARN signed-in-callable elevated functions, all logged above. No new function is in the list.
- **Performance:** no unindexed foreign keys left. 18 INFO "unused index" (the 11 new ones among them) and the Auth connection INFO, both explained above.

## Sharing and link previews (P5C)

Website routes `/listing/<id>/opengraph-image`, `/twitter-image` and the same under `/studio/<handle>`; `apps/web/src/lib/preview.ts`, `og.tsx`; `apps/web/public/.well-known/assetlinks.json`; Android app links; share buttons (2026-11-10).

- **Content-Security-Policy: not changed.**
  - The preview images are drawn on the server: Next.js `ImageResponse`, with the photo and the wordmark passed in as data URIs.
  - The browser never loads anything new for them, and preview bots (WhatsApp, iMessage, X) fetch the image address directly, where page CSP doesn't apply.
  - The Share button uses `navigator.share` and `navigator.clipboard`, which CSP doesn't govern.
  - The listing page's own images still come from the Supabase origin the policy already allows.
- **Guest data only:**
  - Every preview is built with an anonymous Supabase client (publishable key, no cookies). So it can show only what `get_listing` and `browse_listings` give a guest: title, price, city, studio name, handle and listing photos.
  - A signed-in sharer's view (their saved state, a blocked studio, their own paused listing) never reaches a preview.
  - No coordinates, email, account ids, measurements or messages are read.
- **Photos in the preview images:**
  - Fetched only from this project's public `listing-photos` URLs (the same check as `photoUrl`), with no redirects, a 5-second timeout and a 10 MB limit.
  - Only JPEG or PNG, by the file's first bytes. Anything else is left out and the image is drawn without it.
- **Studio previews for guests:**
  - They read the guest shop window (`browse_listings`, up to 10 pages of 30) and keep the cards whose handle matches.
  - That is the same data a guest already sees on Home. `get_studio` stays signed-in only, and no database change was made.
  - Cost: up to 10 small RPC calls per studio preview request.
- **"No longer available":** a paused, deleted, hidden or blocked listing, or a made-up id, returns the same plain page. It doesn't say which, so it reveals nothing about blocks or holds.
- **`/.well-known/assetlinks.json`:**
  - A static public file, served with `application/json` and kept out of the sign-in proxy (`proxy.ts` matcher), so it is never redirected and does no session work.
  - It lists only `com.dzirent.app.debug` with the debug key's SHA-256 (in `contract.md`). The debug key gives no access to anything: it only proves to Android which app may open dzirent.com links.
  - The release entry comes in P8A, the iPhone file in P8B.
- **Android:** the link filter accepts only `https://dzirent.com/listing/…` and `/studio/…`. The app reads only a UUID listing id or a handle of `A-Za-z0-9._-` from them and ignores any other link (`ShareLinks.parse`, unit-tested).
- **iPhone Keychain after a reinstall:**
  - Keychain items survive deleting the app.
  - On the first launch of an install, there's no marker in NSUserDefaults, which iOS deletes with the app. Then everything this app keeps in the Keychain is cleared before the session is read, and the marker is set.
  - So a reinstalled app starts signed out, and an old session isn't picked up. Not compiled yet; it's in the Mac check list.

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
| All 7 functions | Since P5A each checks its input with `_shared/input.ts` (one JSON object, size limit, unknown fields refused, plain errors without internal details); see "Security hardening (P5A)" | Deployed (P5A) |
| `scan-listing` | Gateway JWT check off: only the database calls it. Code requires the shared secret in `x-scan-listing-secret` (constant-time compare, 401 otherwise) and a scan ID that is `queued` (else 409). Uses the project's secret key only for the three server-only `vision_*` functions, and the `vision-invoker` key only to get an ID token for the vision service. Sends the vision service public photo URLs only. Any failure marks the scan failed (verdict review). Logs counts, verdicts and error codes only. Not changed in Step 8B; the automatic re-check calls it the same way. | Deployed (8A) |

## Secrets (Step 7A)

| Secret | Where it lives | Handling |
| --- | --- | --- |
| Shared secret (database to `send-push`) | Vault `send_push_secret` (read by the push trigger), Edge Function secret `SEND_PUSH_SECRET` | 32 random bytes generated inside the database by the Step 7A migration, so it is never in the repo. Copied from Vault to the function secret with the CLI through a temporary file in the agent's scratch folder, deleted right after; never printed. To rotate: replace the Vault value and run `supabase secrets set SEND_PUSH_SECRET` with the same value. |
| Firebase server key (service account `dzirent-17c88-firebase-adminsdk-fbsvc`) | Edge Function secret `FIREBASE_SERVICE_ACCOUNT_BASE64`; the file only in `H:\DziRent\secrets\` | Set with `supabase secrets set` from the file (base64), never printed or committed. Used only by `send-push` to get short-lived FCM access tokens. |
| `google-services.json` (Firebase app config) | `H:\DziRent\secrets\` (local builds, path in `GOOGLE_SERVICES_JSON`); GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (release workflow) | Not a server secret, but kept out of this public repo: `.gitignore` lists it, and Gradle reads it from the path without copying it into the repo. |

Vault also holds `send_push_url`, the function's address (public, not a secret).
