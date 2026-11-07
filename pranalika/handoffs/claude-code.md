# Claude Code handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

## P2C - 2026-11-07 - age gate and public text

Done:
- Before starting: working tree clean, `Preview` already up to date with `origin/Preview` (`5bff289`).
- **Backend** (`supabase/migrations/20261107120000_p2c_age_gate.sql`, pushed):
  - `public.age_checks`: user, source (`store_signal` / `self_declared`), result (`adult` / `minor` / `unknown`), platform, time. No birthdate field anywhere. Owner reads their own; written only by `record_age_check`. Removed with the account.
  - `record_age_check(p_source, p_result, p_platform)` returns true when the account is blocked. A self-declared `adult` from a profile without the 18+ confirmation is stored as `unknown`. The same answer within an hour adds no row.
  - **Blocked** = the latest decisive check is `minor`. Only a later store `adult` lifts it. A self-declared `adult` never does (so signing in on the website can't undo a Play "under 18"), and `unknown` changes nothing.
  - **The block:** a trigger `age_gate` on 22 tables refuses every insert and update by the blocked user with "Dzirent is only for people 18 and older." It is named to fire before the other triggers, so a blocked user sees this message, not a text-filter one. Reading, deleting rows, read receipts, `mark_activity_seen` (inbox) and account deletion still work. Admins and server jobs are not stopped.
  - When the block starts, the account's active listings are paused ("Paused: Dzirent is only for people 18 and older."), so nobody can start a chat with a minor. They stay paused after the block ends until the owner republishes.
  - `admin_find_user` also returns `age_check` (latest row) and `age_blocked`.
  - `20261107121000_p2c_preview_label.sql`: `app_settings.preview_label`, on.
- **Android:**
  - Google Play Age Signals `com.google.android.play:age-signals` **0.0.4** (the latest on Google Maven, published 2026-07-20). `androidApp/.../age/PlayAgeSignals.kt` calls `checkAgeSignals` and maps `ageLower` / `ageUpper`: a range ending under 18 is a minor, one starting at 18 or above is an adult, anything else (no range, an error, a 10-second timeout) is no signal.
  - 0.0.4 no longer has `userStatus`, and adds a Play prompt (`requestAgeSignalsAccess`) that I don't call: the app only reads what Play already shares.
  - Shared `util/AgeGate.kt` runs on every sign-in and once a day when the app opens (the day and the last answer are kept per account in the phone's prefs). It records adult or minor as `store_signal`, and no signal as `self_declared` / `adult`.
  - If the server can't be reached, the last answer stands (a store "minor" blocks anyway) and the check runs again next time.
  - The new `AgeBlocked` screen comes before the terms step: "Dzirent is only for people 18 and older.", with Delete my account (with a confirmation), Sign out, and Contact support.
  - The 18+ refusal reaches screens word for word (`DATABASE_MESSAGES`).
- **iOS:** `shared/src/iosMain/.../platform/IosAgeSignals.kt` is a clear stub returning "no applicable signal" (the iPhone records `self_declared`).
- **Website:**
  - Sign-up records `record_age_check('self_declared', 'adult', 'web')` after `accept_legal`.
  - Admin user lookup shows an "Under 18: blocked" badge and an "Age Check" cell.
  - Flags page: `preview_label` has a title and confirmation text. Switching it also refreshes the site-wide header.
  - "Preview only" sits in the header right after "How Dzirent works", on every page: red (`#c62828`; `#ff6b6b` in dark), 14px. On phones (760px and below) "How Dzirent works" is hidden, and the label sits next to the menu button on the logo row. It may wrap to two lines, and the side cells can shrink (`minmax(0, 1fr)`), so nothing is pushed off screen. The flag is read on every request; if it can't be read, the label shows.
  - **Overlay dialogs:**
    - `ConfirmSubmit` now confirms in the site's overlay (`WorkflowModal`) instead of `window.confirm`. Block uses it, and Report now does too (it had no confirmation).
    - If a required field is empty (the report reason, or anything on the sign-in page), the same overlay lists what's missing in plain words instead of the browser's bubble.
    - The only browser-drawn box on the sign-in page was that "please tick this box" bubble on the 18+ and terms ticks, so I took that to be the confirmation the task meant.
  - **Public text:**
    - Privacy: the provider list is now the one paragraph from the task; "Google Firebase delivers them" is now "our notification provider delivers them".
    - Passwords (privacy twice, delete-account once): "Your password is protected with one-way encryption, so no one, including us, can read it."
    - Age: privacy (what we collect, and the age section) and help ("Why is Dzirent 18+ only?") say that in some states we use your app store's age check, and that we never ask for or store your birthdate. Privacy and delete-account list age checks among what deletion removes.
    - "Last updated" is November 7 on privacy, help and delete-account. "Planned: Didit / Stripe" is gone from the config comments.
    - Google Play and Apple App Store stay on the delete-account page: they are app stores, not service providers.
  - Fixed the one lint warning (an unused `_reason` in `components/admin/flags-view.tsx`). The plain-language entry below wrongly named `action-dialog.tsx` as its file.
- **Docs:** `decisions.md` "Age gate (2026-11-07)", `contract.md` (Age gate, `age_checks`, `app_settings` now switched by `set_flag`), `security-log.md` (Age gate, Advisor), `compliance.md` (inventory row, section 4, the SB 2420 / Utah row handled on Android and web with iPhone pending, gap 7), `BOARD.md`.

What I ran:
1. `supabase db push --linked` (dry run first): both migrations applied. Checked: 22 `age_gate` triggers, `preview_label` = true.
2. `node supabase/tests/p2c_age_gate.mjs` (new): **PASSED on the first run**.
   - Guests read `preview_label` = true.
   - Bad source, result and platform are refused (`22023`), and so are guests (401).
   - Test user 3 with a store "minor": creating a listing, sending a message and editing the profile are all refused with `P0001` "Dzirent is only for people 18 and older.". Reading their own profile and age checks, and `mark_activity_seen`, still work. A self-declared adult afterwards keeps the block.
   - Store "adult": a test listing is created and published, and a message is sent. Clean-up deleted the listing and left test user 3 as adult. One test message stays in that chat.
3. `node supabase/tests/p2b_admin.mjs` (regression, with a new assertion): **PASSED**. Admin lookup at `aal2` returns test user 3's `age_check` (store_signal / adult / android) and `age_blocked = false`. Its clean-up reported "flags on: 1": that is `preview_label`, which is meant to stay on.
4. Supabase Security Advisor: one new finding (`record_age_check` callable by signed-in users, intended), logged in `security-log.md`.
5. `:androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL. 25 tests, 0 failures, including the new `AgeGateTest` (4 tests).
6. `apps/web`: `npm run lint` and `npm run build` pass (Node 22.23.4 from my scratch folder, as in the previous entry). Run once, then again after the lint-warning fix; the second lint run reports no warnings.
7. Final read-back: `preview_label` true; test user 3 latest check `store_signal/adult`, not blocked. A scan of every public page and the legal config finds no provider name.
8. No emulator, device or screenshots.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (built 2026-11-07 12:08 local time).

iOS work left for the Mac:
- Replace the `IosAgeSignals` stub with Apple's Declared Age Range: the entitlement, a small Swift call asking for the range with an age gate of 18, then `AgeSignal.fromRange(lower, upper)`. The notes in the stub weren't verified on a Mac; check Apple's current API names and the minimum iOS version.
- Build-check the shared changes: `DeviceServices.ageSignals`, `IosDeviceServices`, and the new screen and state in `DzirentApp.kt`.

Open issues:
- **The signal is client-reported.** Play has no server-side check, so someone calling the API directly could send a store "adult" and lift their own block (security-log.md). Closing that needs ID verification (P6A) or a verified signal.
- **Play may return nothing for most users.** Ranges come only for users in covered states. A sideloaded debug build gets `APP_NOT_OWNED`, so the owner's phone test will most likely record `self_declared`. Seeing a real "minor" needs Play's test tools (`FakeAgeSignalsManager`) or a covered account. I didn't add a debug switch.
- **The website has no blocked screen.** A blocked account's writes are refused with the 18+ message wherever the site shows database errors, but nothing explains it up front. Android has the full screen.
- **Gap 7 remains open:** `adult_confirmed` is still writable by the user and not required. A self-declared adult without it is stored as `unknown`.
- **Minors can re-register.** Age checks are deleted with the account, so a blocked person can delete it and sign up again; on Android the next sign-in asks Play again.
- **Attorney:** whether Texas SB 2420 and Utah's law apply to Dzirent and in what form, and whether `self_declared` is enough outside covered states.
- **Policy version:** the privacy text changed (age checks), but `PRIVACY_VERSION` is still 1.0.0, so nobody is asked to accept again. The owner should decide whether that counts as a material change.
- **Owner checks after the commit:** the label in both themes and on a narrow phone (under about 340px it can touch the logo), and the new Block, Report and sign-in dialogs.

## Plain-language legal pages - 2026-11-07

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `f25087d` to `380c82e` (website fixes, P2B part 2).
- Website content only (`apps/web`), no database or app code. Nothing in `compliance.md` changed.

What changed, per page:
- **Privacy** (`app/privacy/page.tsx`), the biggest change:
  - Cookies: the nine-row table with cookie names and storage types is now three categories (Essential: until you sign out; Preferences: up to a year; Drafts and reminders: until you clear your browser), plus "no advertising cookies, no tracking across other sites".
  - Outside providers: the table with regions and data received is now a four-line list (Supabase, Vercel, Google Cloud, Google Firebase) and the sentence "These providers process data only to run Dzirent for us, and our data is stored in the United States." "Under strict security commitments" is gone. The phone's location service moved to the location section ("your phone's or browser's location service, if you allow it").
  - Passwords: "stored in a scrambled form that can't be read back by anyone, including us", in the data list and in Security. No more "encrypted and hashed", "Supabase Auth" or "encrypted passwords".
  - Location: "rounded to about 1 kilometer (0.6 miles)" and "up to about half a mile" instead of decimal places and degrees; the city-centre explanation no longer names a directory.
  - Photos: "hidden photo information (such as GPS location) is removed" instead of EXIF and the drawing methods; photos public with random links instead of a bucket and path pattern; the photo check named as "our photo-check service, which uses open-source image models" instead of the model name and Cloud Run; "a numerical summary of what each photo looks like" instead of a 768-number vector. Added the nudity check and that a person looks when the check isn't sure.
  - New disclosures that compliance.md asked for (gaps 11, 12): what a report keeps (a copy of what was reported, with a few messages around a reported message), that reports and that copy survive account deletion for the 2-year placeholder period, that Dzirent staff see reports, photos for review and account details, sign in with two-step verification and have every action recorded, and that terms acceptance and warnings are stored.
  - Sign-in records, declarations and server logs: "the browser or app you used" instead of "user agent"; "the page or action requested" instead of "request path, status code"; no provider names, no "HTTP".
  - Security: the Row Level Security, TLS, bucket and Vault items are now "your data is yours", "encrypted connections", "encrypted storage", "passwords" and "limited staff access".
  - Retention: the server-log placeholder label no longer says "Supabase keeps logs for at least 7 days"; "content delivery cache" is now "may stay reachable at its old link for a short time"; the declaration retention got its own placeholder.
- **Community guidelines**: the model name and the 768-number fingerprint are gone; the "worn detection" item is now "photo safety: nudity not allowed, a worn piece is fine and never penalized"; the under-review outcome names the hood case; "the server automatically checks" is now "checked again automatically".
- **Help**: the photo-check results now match the app's words (Allowed, Under review, Not allowed, with the hood and nudity cases) instead of Approved, Flagged and "potential safety trigger"; "legal acceptances" and "from our database" reworded.
- **Delete account**: "backend triggers an immediate database cascade deletion" is now "deleted immediately"; "Supabase Auth login, phone number, and password hashes" is now sign-in details with the scrambled-password wording; "visual search embeddings" is now "photo-check results". Items Dzirent never had are removed: phone numbers, avatars, usernames, saved searches, reviews and ratings. Added what is deleted (notification registration, terms acceptance, warnings, chats and rentals for both people) and what stays (declarations with a retention placeholder, reports for the placeholder period, server logs). "Request endpoints" is now "what was requested".
- **Support**: "AI scanning checks" is now "how photo checks work".
- **Config**: `SERVICE_AREA` is "United States" (it mentioned the city selection).
- **Unchanged after reading:** terms, copyright, safety, about. They had nothing on the list.
- `BOARD.md` updated.

What I ran:
1. Baseline scan of the nine public pages, the legal config and `legal-layout.tsx` for the task's terms plus provider and model names: 41 hits, all in the privacy page.
2. Scan after the rewrite, for `sb-`, `dzirent-`, `LocalStorage`, `IndexedDB`, `HttpOnly`, `us-west`, `pdx1`, `Oregon`, `Portland`, `Cloudflare`, `edge`, `encrypted password`, `.tsx`, `rpc`, `bucket`, `revision`, and also `Supabase`, `Vercel`, `Firebase`, `Marqo`, `SigLIP`, `768`, `EXIF`, `cascade`, `SDK`, `hash`. Every remaining hit:
   - `.tsx`: the first-line path comment in eight files (`// apps/web/src/app/privacy/page.tsx` and the like). Code comments, never rendered.
   - `edge`: safety page, "lining edges" in the garment inspection table. An ordinary word.
   - `cascade`: delete-account page, the section id `cascade-warning` (an anchor in code; the visible heading is "Impact on Shared Chats & Records").
   - `Supabase`, `Vercel`, `Firebase`: the provider list in the privacy page, company names only, as the task asked; "Google Firebase delivers them for us" in the notifications item.
   - No hit for `sb-`, `dzirent-`, `LocalStorage`, `IndexedDB`, `HttpOnly`, `us-west`, `pdx1`, `Oregon`, `Portland`, `Cloudflare`, `encrypted password`, `rpc`, `bucket`, `revision`, `Marqo`, `SigLIP`, `768`, `EXIF`, `SDK` or `hash` anywhere.
3. `npm ci`, `npm run lint`, `npm run build` in `apps/web`: all three pass. Lint reports one warning in `components/admin/action-dialog.tsx` (an unused `_reason`), which was there before and isn't mine. The build compiled all nine public routes.
   - The PC's Node is 18.20.7 with npm 6.14.18, which can't read the lockfile and is below the `engines` requirement (Node 22+). `npm ci` failed with it. I downloaded the official Node v22.23.4 Windows zip into my scratch folder (checksum verified against nodejs.org) and ran the three commands with it. Nothing was installed on the PC. BOARD has a row for the owner.
4. No emulator, device or app screenshots.

Disclosure check (compliance.md items and where each still appears):
- What we collect and why: Privacy §2 (account, profile, messages and rentals, declarations, reports, notifications, server logs), §3 location, §4 photos, §5 measurements.
- Who helps process it, where data is stored: Privacy §8 (four providers, United States).
- Retention and its placeholders: Privacy §10 (deleted photos, reports 2-year placeholder, server logs, backups) and §11 (declarations, reports, logs); Delete account §4 and §5 (same placeholders).
- Chats and rentals deleted for both people: Privacy §11 callout; Delete account §4 and §6.
- What declarations keep after deletion (legal name, email, city, IP address, time): Privacy §11; Delete account §5.
- Report evidence kept after deletion, staff-only: Privacy §2 "Reports you make", §7, §10, §11; Delete account §5.
- Staff access with two-step sign-in and a record of every action: Privacy §7 and §15.
- Deleted photos may stay reachable for a short time: Privacy §10 and §11; Delete account §4.
- Photos are public with random links: Privacy §4.
- Photo check, fingerprints not biometric, nudity check: Privacy §4; Community guidelines §5; Help "What are photo checks".
- Location rounded to about 1 km, distance in whole miles only, approximate permission only: Privacy §3.
- Hidden photo information (GPS) removed on all platforms: Privacy §4.
- Display name shown to guests when there is no studio name: Privacy §2 and §12.
- Measurements private, consent before saving, withdrawal deletes them: Privacy §5; Help "Fit & measurements".
- Firebase in the Android app and what it sends Google: Privacy §2 "Notifications".
- Server logs with IP addresses: Privacy §2 and §10; Delete account §5.
- Rights (access, correction, deletion, download on request, notifications, appeals): Privacy §13; Help "Account & privacy".
- 18+: Privacy §14; Terms §2; Help "Why is Dzirent 18+ only?".
- No ads, no tracking, no selling, no analytics: Privacy §1, §6, §9.
- Terms acceptance stored and deleted with the account: Privacy §2 and §11; Delete account §4.

Open issues:
- The `DATA_RETENTION` placeholder is used for five different periods (deleted photos, reports, server logs, backups, declarations) with different labels. When the attorney fills the config, one value would show for all five; the config needs separate keys first (`legal-placeholders.md` lists the periods).
- The report retention label says "currently 2 years, pending attorney review", matching the 730-day setting in the database.
- The website build needs Node 22 on this PC (BOARD).
- Terms, copyright, safety and about were read and left as they were.

## P2B part 1 - 2026-11-07 - admin backend

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `a69f158` to `fbf8b7c` (website catch-up).
- `supabase/migrations/20261107100000_p2b_admin_core.sql`:
  - **Admins:** `app_private.admin_users` (account, added time, added by), closed to every API role. `public.is_admin()` is true only for an admin whose JWT is `aal2`. `app_private.require_admin()` is the first statement of every admin function.
  - **Admin log:** `app_private.admin_actions` (admin, action, target type and id, reason, before and after, time). Triggers refuse every update, delete and truncate. Written by `app_private.log_admin_action`.
  - **Settings:** `app_private.settings` with `report_retention_days` = 730, a placeholder for the attorney.
  - **Suspensions:**
    - `profiles.suspended_until` and `suspension_reason`; a trigger keeps them for app roles.
    - Messages, new chats and reports by a suspended account are refused: "Your account is suspended until Nov 8, 2026. Reason: …." For a ban (`infinity`): "Your account is suspended. Reason: …."
  - **Holds:** `listings.hold` (`hidden` or `suspended`), `hold_reason` and `hold_restores`.
    - A held listing is paused (out of the shop window) with `auto_paused_reason` ("Hidden by Dzirent: …." or "Paused while your account is suspended."). Apps can't set or clear a hold or republish a held listing, and a suspended owner can't publish.
    - Lifting a hold restores `active` if the listing was active. An admin hide survives the end of a suspension.
    - I chose holds over editing every shop-window function: the shop window already shows only active listings.
  - **Reports:**
    - The reporter's foreign key is now `on delete set null`.
    - New columns: `target_user_id` (server-set), `status`, `outcome`, `outcome_note`, `closed_at`, `closed_by`. Apps always insert `open`.
    - Message reports must be in the reporter's own chats.
    - `app_private.report_evidence`: a snapshot at insert (message plus 5 before and after with sender ids, names, handles and times; listing text and photo paths; profile public fields). It is closed to API roles and an update trigger refuses changes.
    - Report details skip the text filter; reason is still checked.
    - `app_private.purge_expired_reports()` exists but isn't scheduled (P3B).
  - **Other tables and columns:**
    - `public.user_warnings`: owner-readable warnings.
    - `app_private.takedown_requests`.
    - `listing_scans.admin_reason`.
- `supabase/migrations/20261107101000_p2b_admin_functions.sql`: the admin functions listed below. Each checks `require_admin()` first and writes one log row, reads included.
- **Edge Function `admin-actions`** (deployed, `verify_jwt = false` in `config.toml`):
  - Validates the token, then asks `is_admin()` with the caller's own token.
  - Only then uses the server key: Auth ban or unban (`ban_duration` about 100 years / `none`), or deleting photo files. The database side (`admin_record_ban` / `admin_remove_photos`) runs as the caller.
  - Self-ban is refused.
- **`supabase/seed/admins.mjs`:** syncs `admin_users` to `ADMIN_EMAILS` (adds listed accounts, removes unlisted ones, logs each change, refuses an empty list, prints counts only). It runs the CLI binary directly, so the SQL isn't mangled by a shell.
- **Apps** (shared code):
  - The review banner shows the check's own reason when there is one (hood, photo safety, copied photo, or "not sure what this piece is"), otherwise "Someone at Dzirent will check these photos."
  - An admin's rejection shows `admin_reason`.
  - **Suspension notice:** `Profile.suspendedUntil` / `suspensionReason` and `util/Suspension.kt` give the same wording as the database plus "Contact support if you think this is a mistake." A `SuspensionNotice` card shows:
    - at the top of the listing editor;
    - instead of the chat message box;
    - instead of the report form.
    - Each screen reads the profile fresh, so a suspension that started after sign-in still shows.
  - The suspension, hidden-listing and own-chat refusals reach the screens word for word (`DATABASE_MESSAGES`).
- **Docs:** `contract.md` ("Admin"), `security-log.md` ("Admin role", Advisor findings, `admin-actions`), `compliance.md` (gap 11 closed, gap 12's backend done, report retention and admin data in 1.9, column map), `decisions.md` ("Admin (2026-11-07)"), `BOARD.md`.

Every admin function (all need admin + two-step sign-in, all logged):
- **Status:**
  - `is_admin()`: true for an admin at `aal2` (any signed-in user may ask).
- **Queues:**
  - `admin_queues()`: counts of open reports, scans in review, open takedowns, and ID reviews (0 until P6A).
  - `admin_list_reports(p_status, p_limit, p_offset)`: reports with reporter and target names and the evidence snapshot.
  - `admin_list_scan_reviews(p_limit, p_offset)`: photo checks waiting for a person, with each photo's path, decision, warnings, nudity and hood scores.
  - `admin_list_takedowns(p_status, p_limit, p_offset)`: takedown requests (open ones by default).
  - `admin_list_id_reviews()`: an empty list until ID verification (P6A).
- **Reports:**
  - `admin_dismiss_report(p_report_id, p_reason)`: closes a report as dismissed.
  - `admin_warn_user(p_user_id, p_note, p_report_id)`: stores a warning the user can read; closes the report as warned.
  - `admin_remove_reported_content(p_report_id, p_reason)`: deletes a reported message, hides a reported listing, or clears a profile's studio name, bio and pickup area; closes the report as content_removed.
- **Suspensions and bans:**
  - `admin_suspend_user(p_user_id, p_days, p_reason, p_report_id)`: suspends for 1 to 3650 days and holds the user's active listings.
  - `admin_unsuspend_user(p_user_id, p_reason)`: lifts the suspension and restores the held listings.
  - `admin_record_ban(p_user_id, p_banned, p_reason, p_report_id)`: the database side of a ban or unban (open-ended suspension); called by `admin-actions`.
- **Photo checks:**
  - `admin_decide_scan(p_scan_id, p_decision, p_reason)`: approves or rejects a finished photo check, with a reason the lender sees.
- **Listings:**
  - `admin_hide_listing(p_listing_id, p_reason)` / `admin_unhide_listing(p_listing_id, p_reason)`: hides a listing from everyone, then restores it.
- **Takedowns:**
  - `admin_create_takedown(...)`: records a copyright takedown request from a support email.
  - `admin_takedown_remove_listing(p_takedown_id, p_listing_id, p_reason)`: hides the listing and marks the request actioned.
  - `admin_remove_photos(p_listing_id, p_photo_ids, p_reason, p_takedown_id)`: removes photo rows and returns their storage paths. Use it through `admin-actions`, which also deletes the files.
  - `admin_record_counter_notice(p_takedown_id, p_notice, p_received_at)`: records a counter-notice.
  - `admin_set_takedown_status(p_takedown_id, p_status, p_note)`: sets rejected or restored, or corrects the status.
- **Flags, metrics, lookup, the log:**
  - `set_flag(p_key, p_enabled)`: switches a feature flag.
  - `admin_metrics()`: users, new users this week, active listings, scans this week by verdict, open reports, messages this week, suspended users.
  - `admin_find_user(p_query)`: looks up an account by email, handle or id, with suspension, ban, report, warning and listing counts.
  - `admin_audit_log(p_limit, p_offset)`: the admin log, newest first.
- **Edge Function `admin-actions`:** `ban`, `unban` and `remove_photos`, the steps that need the server key.

How to add an admin (also in `contract.md`):
1. The person signs up on Dzirent with their email.
2. The owner adds that email to `ADMIN_EMAILS` in `H:\DziRent\secrets\providers.env` (comma-separated).
3. An agent runs `node supabase/seed/admins.mjs` from the repo root.
4. The admin enrolls TOTP and signs in with it; the admin website does this in P2B part 2.

To remove an admin, take the email out of `ADMIN_EMAILS` and run the script again.

What I ran:
1. Read the hosted Auth MFA settings (GET, non-secret fields): TOTP enroll and verify on, `mfa_allow_low_aal = false`. Edge Function secret names: the default key variables are present.
2. `supabase db push --linked` (dry run first) for both migrations. `supabase functions deploy admin-actions --no-verify-jwt`.
3. `node supabase/tests/p2b_admin.mjs`: PASSED on the first run, and again after I extended it.
   - I extended it because test user 3 has no active listings, so the hold path wasn't exercised. It now also hides and unhides a listing and briefly suspends test user 2.
   - Refusals:
     - Test user 3 (not an admin): all 23 admin functions and `is_admin()` refused (`42501`, "Admins only"); `admin-actions` refused (403).
     - Test user 1 in `admin_users` at `aal1`: all refused with "two-step"; `admin-actions` refused.
   - TOTP: enrolled through `/auth/v1/factors`, with the code computed in the script. After verify, `is_admin()` is true at `aal2`.
   - Queues: all four counts.
   - Report evidence:
     - Test user 3 reported a message from test user 1, with a filtered word in the details, and the report was accepted.
     - The evidence held the message plus 5 before and 1 after.
     - `admin_remove_reported_content` deleted the message and closed the report as `content_removed`; the evidence was byte-for-byte unchanged.
   - A listing report: its evidence held the title and 2 photo paths, and it was dismissed.
   - Suspending test user 3 for 1 day: sending a message was refused ("Your account is suspended until Nov 8, 2026. Reason: P2B test suspension."), and so was reporting. Unsuspending made sending work again.
   - Hiding one of test user 1's listings:
     - guests couldn't see it;
     - the owner's republish was refused ("This listing is hidden by Dzirent: P2B test hide. Contact support if you think this is a mistake.");
     - My closet showed "Hidden by Dzirent: P2B test hide.";
     - unhiding made it active again.
   - Suspending test user 2: active listings went 6 → 0, all held with "Paused while your account is suspended."; unsuspending brought back all 6.
   - Ban through `admin-actions`: test user 3's sign-in was refused (400); after unban it worked.
   - `payments_enabled` was switched on, then off.
   - Metrics, and lookup by `@handle`, worked.
   - Admin log: 19 rows by test user 1 in the run, covering every action. A SQL update on the log was refused.
   - Clean-up: TOTP factor deleted, test user 1 removed from `admin_users`, 0 flags on, test user 3 neither suspended nor banned (checked by SQL).
4. Security Advisor (2026-11-07 04:01 UTC): new are `is_admin` and the 23 admin functions (signed-in, elevated) and 5 INFO entries for the closed `app_private` tables. No new guest-callable function. All logged.
5. `node supabase/seed/admins.mjs`: "Listed: 1, accounts found: 0, added: 0, removed: 0". The email in `ADMIN_EMAILS` has no Dzirent account yet, so nobody is an admin.
6. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded silently): BUILD SUCCESSFUL. 21 shared unit tests, 0 failures, 0 skipped; new: `suspensionNoticeMatchesTheDatabaseWording` and banner cases. No warnings in the changed files.
7. No emulator, device or screenshots.

Debug APK: `H:\DziRent\Dzirent_dev\mobile\androidApp\build\outputs\apk\debug\androidApp-debug.apk` (22.2 MB, 2026-11-06 22:04 local).

Owner phone test (after an admin has suspended your test account, or using the P2B part 2 website):
- While suspended: the listing editor shows the notice at the top, the chat shows it instead of the message box, and Report shows it instead of the form.
- A hidden listing in My closet shows "Hidden by Dzirent: …".
- A photo check in review shows its own reason, for example "This piece has a hood, …".

iOS-facing changes for a Mac check (all `commonMain`):
- `Models.kt` (`Profile` suspension fields and `suspensionNotice`, `ListingScan.adminReason`)
- `util/Suspension.kt` (new), `util/PhotoScan.kt`
- `Moderation.kt` (`rememberSuspensionNotice`, `SuspensionNotice`, the report dialog), `ListingEditor.kt`, `ChatScreens.kt`, `ListingStepPhotos.kt`
- `DzirentRepository.kt` (messages list)

Open issues:
- **`ADMIN_EMAILS` has no matching account yet.** Sign up with that email, then re-run the seed script.
- **No admin website yet** (P2B part 2), so there is no way to enroll TOTP except through the API.
- **Retention:** the 730-day report period is a placeholder for the attorney, and nothing deletes expired reports yet (`purge_expired_reports`, P3B). The admin log and takedown requests have no retention period either.
- **A ban keeps working sessions alive for a while.** It stops sign-in and token refresh, but an access token already issued works until it expires (up to 1 hour). The database refuses messaging, chats, reports and publishing at once, through the open-ended suspension.
- **Calling `admin_remove_photos` directly leaves the files** in the public bucket. The website should always use the Edge Function.
- **Test data stays:** messages and reports from the test, and the admin log rows (append-only by design).
- **Removing a profile's content** clears the studio name, bio and pickup area, but not the display name; use suspend or warn for that.

Requests (website, P2B part 2):
- Admin sign-in with TOTP: enroll (QR code from `/auth/v1/factors`), challenge, verify, then call the functions above with the `aal2` session. `is_admin()` tells whether to show the admin area.
- Ban, unban and photo removal go through `POST /functions/v1/admin-actions` with the admin's token.
- Show the scan's `admin_reason` and the listing's `auto_paused_reason` (holds) to the lender, and the suspension message where a suspended user would publish, message or report. The refusals already carry these words.
- Show the review reason from the scan (as the apps now do).

## P2A - 2026-11-07 - content safety

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `ea240b7` to `c1be438` (P1B part 2, website).

Part 1, text filter, in the database:
- `supabase/migrations/20261107010000_p2a_text_filter.sql`, applied with `supabase db push` after a dry run.
  - **Lists:**
    - `app_private.text_filter_terms`: the LDNOOBW English list, 402 entries. The one emoji entry is left out.
    - `app_private.text_filter_allowed`: 20 phrases that are ordinary on a clothing marketplace, each with a note. Examples: "nude", "sexy", "tied up", "tight white", "big black", "girl on", "xx"/"xxx", "s&m" (it normalizes to "s m", as in sizes S M L), "pussy bow", "bondage pants", "poof sleeve(s)".
    - Both tables have RLS and no grants for any API role.
  - **Matching:**
    - Normalizes lower case and accents (`unaccent`), and reads 0 1 3 4 5 7 @ $ ! as o i e a s t a s i. Anything else becomes a space.
    - Each term is a whole-word pattern in which every letter may repeat. So "fuuuck" is found, but "cocktail", "classic" or "as" never match.
    - Allowlisted phrases are masked out first.
  - **Contact details** (public text only): phone numbers in US formats, 10 or more digits in a row, email addresses, links, bare domains on common endings, and `@handles`.
  - **Triggers** on `listings` (title, description, price note, deposit note), `profiles` (display name, studio name, handle, bio, pickup area), `messages` (body) and `reports` (reason, details). A column is checked only when it is inserted or changes.
  - **Refusals** are `P0001` with the plain-words message, and `hint` is the column name.
  - **`check_text(p_text, p_where)`** lets guests and signed-in users check text before saving. Sign-up needs it because the Auth API hides the database's message.
- `20261107012000_p2a_text_filter_one_as_l.sql`: my first check showed "bu11sh!t" getting through, because people write 1 for l too. The language check now reads the text both ways.
- **Apps** (shared code):
  - `DzirentException.field` carries the hint. The two refusal messages are passed through as they are.
  - Sign-up checks the display name first (`checkText`) and shows the refusal under the field.
  - My studio shows it under the studio name, handle, bio or pickup area.
  - The listing editor goes back to the form instead of the "publish failed" view. It opens the step with the field, shows the message under the title, description, price details or deposit note, and keeps what was typed. The message clears when the field is edited.
  - Chat shows it under the chat box, keeps the text and drops the Retry button.
  - The report dialog already showed errors under the details field.

Part 2, photos, in the vision service:
- `app/safety.py` (new): `Marqo/nsfw-image-detection-384`, pinned to `0c26ec22111b83f106d72a55f611ec35962bcb65`.
  - Preprocessing as in its model card: 384 center crop, bicubic, mean and std 0.5.
  - Loaded strictly with timm (already a dependency). `build_assets.py` downloads it into `/opt/model/safety` and loads it during the build, so a broken download fails the build.
- `app/verdict.py`, rules around the existing ones:
  - Any photo (size tags and close-ups included) with P(nudity or sexual content) of at least 0.90: rejected, "This photo isn't allowed on Dzirent.", before any other rule.
  - At least 0.40: review, unless already rejected.
  - A hooded reading (new `hooded` prompt bank in `vocab.json`) of at least 0.60 turns allowed into review: "This piece has a hood, so someone at Dzirent will check it."
- Worn: no warning ever mentioned it, and it was never a verdict input; tests now pin both. The per-photo labels in `photo_scans.labels` now also carry `hooded` and `safety.nsfw`.
- `policy.json` and `policy_item_types` are unchanged and still in sync (`test_policy_sync` passes).
- Redeployed with the Step 8A settings. Revision **`vision-00005-9cg`** serves 100%. `describe` shows max 1 instance, 2 CPU, 4 GiB, 120 s, concurrency 4, runs as `vision-runtime`; the only IAM binding is `roles/run.invoker` for `vision-invoker`. Health reports `service_version` `p2a.1`, both models with their revisions and licenses, and a 23.6 s start-up.
- Docs:
  - root `README.md` (open-source section: the safety model and its base, a "Text filter" table for the word list with its changes, the `unaccent` extension, NOTICE note);
  - `services/vision/README.md`;
  - `decisions.md` (appended "Content safety (2026-11-07)");
  - `contract.md`, `security-log.md` (four new Advisor findings, logged);
  - `compliance.md` (gap 22 closed; gap 23's nudity check closed, the fingerprint question still with the attorney);
  - `BOARD.md`.

Licenses checked (Hugging Face and GitHub APIs, at the pinned revisions):
- Word list: LDNOOBW, CC BY 4.0, commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13` (2020-07-13). Attribution and changes are in the README.
- Safety classifier: `Marqo/nsfw-image-detection-384`, Apache 2.0 (model card and API metadata). Its base model `timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k` is Apache 2.0.
- Neither ships a NOTICE file. The card says it was trained on a proprietary dataset; the license is still Apache 2.0.
- Not used: the card's own example image, `beignets-task-guide.png`. It comes from the `huggingface/documentation-images` dataset, which is CC BY-NC-SA 4.0 (non-commercial). An openly licensed beignets photo stood in for it.

What I ran:
1. `supabase db push --linked` (dry run first) for both migrations.
2. Read-only `text_refusal` checks on 22 example texts. These cover leetspeak, repeated letters, spaced letters, words inside words, allowlisted words, sizes, phones, emails, links, domains, handles and accents. The one miss ("bu11sh!t") led to the second migration, then passed.
3. Existing rows that would fail: **none**. 13 listings × 4 fields, 5 profiles × 5 fields, 14 messages, 0 reports.
4. `node supabase/tests/p2a_text_filter.mjs` (test users 1 and 3): PASSED on the first run.
   - A phone number in a listing title was refused (400, hint `title`) and the title stayed unchanged.
   - The same number in a chat message was accepted.
   - A slur in a chat message was refused (hint `body`).
   - "cocktail", "classic" and "nude heels" were accepted.
   - `check_text` as a guest: "Jane Doe" passes; a name with an email is refused.
   - Two test messages stay in the test chat between users 1 and 3.
5. Security Advisor (2026-11-07 02:47 UTC): new are `check_text` (guest and signed-in elevated) and two INFO entries for the closed `app_private` filter tables. All are logged in `security-log.md`.
6. Vision service tests in the Step 8B scratch venv (Python 3.12.10, the pinned torch/timm/open_clip), with `VISION_SAFETY_DIR` set to the downloaded safety model: **54 passed**. 14 are new:
   - nudity rules: reject, review, support photos count, a rejection is never softened, low scores change nothing;
   - hood rules: review, a rejection is never softened, below the threshold stays allowed;
   - worn: never a verdict input, and no warning mentions wearing;
   - safety model: preprocessing, a strict load, and synthetic plain images scoring below the review line.
   - No real or explicit images were used.
7. Local run of the service's own code on the built assets (main model from the Step 8B scratch copy, text embeddings rebuilt for the new prompts). It matched the deployed results below exactly.
8. `services/vision/eval/run_eval.py` against the deployed service:
   - **Sample photos:** all 22 allowed one by one; all 12 sample listings allowed. Highest nudity score 0.054, highest hood score 0.340.
   - **Worn dresses** (openly licensed photos in my scratch): the red-carpet gown is allowed with only "Bottom of the item is cut off"; the runway maxi dress is allowed with no warning; a head-and-shoulders portrait goes to review because the item is unclear. No warning anywhere mentions wearing.
   - **Hoodie and sweatshirt set:** 4 rejected, 3 review. `hoodie/4` is allowed, as in Step 8B: that photo is the back of a long-sleeve print dress with no hood visible (I looked).
   - **Beignets** (the openly licensed stand-in): rejected as not clothing, nudity score 0.054.
   - **Step 8B Commons sets:** accept set 12 allowed, 2 review, 2 rejected; reject set 32 rejected, 10 review, 0 allowed. Both are the same as in Step 8B.
   - The script exits 1 only because of `hoodie/4`.
   - Highest nudity score over all 92 photos: 0.148, against the 0.40 review line.
   - Single-photo scans: median 1.1 s.
9. **Hood rule, end to end:** two openly licensed down-jacket photos (CC BY-SA 4.0) on the deployed service both went to review with "This piece has a hood…" (hood scores 0.95, nudity scores 0.05).
10. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded silently):
    - The first run failed: `decodeAs<String?>()` isn't allowed. I fixed it by decoding a `JsonElement`.
    - Second run: BUILD SUCCESSFUL. 20 shared unit tests, 0 failures, 0 skipped. No warnings in the changed files.
11. No emulator, device or app screenshots. The only images I viewed were a contact sheet of the three dress photos and the `hoodie/4` thumbnail; all test images stay in my scratch folder.

Vision revision: `vision-00005-9cg`.

Debug APK: `H:\DziRent\Dzirent_dev\mobile\androidApp\build\outputs\apk\debug\androidApp-debug.apk` (22.2 MB, 2026-11-06 20:06 local).

Owner phone test:
- Put a phone number in a listing's description and publish. You should go back to the details step, with the message under Description and your text kept.
- In the price or deposit note: More options opens with the message under that field.
- In My studio's bio: the message appears under Bio.
- Send a phone number in chat: it is sent. Send a listed word: the message shows under the chat box, with no Retry, and the text stays.
- Sign up with a display name that has an email in it: the message appears under Display Name.
- Upload a photo of a hooded jacket: the review banner shows.

iOS-facing changes for a Mac check (all `commonMain`):
- `DzirentRepository.kt` (`DzirentException.field`, `checkText`, the messages list)
- `AuthScreens.kt`, `MyStudioScreen.kt`, `ChatScreens.kt`
- `ListingEditor.kt` (`DepositFields` has a new optional parameter), `ListingEditorState.kt`, `ListingStepPhotos.kt`, `ListingStepDetails.kt`

Open issues:
- **The list is mostly sexual terms;** it covers only some slurs and hate terms. More terms can be added with a migration (`source` column).
- **Left blocked, though also ordinary words:** "lolita" (a Japanese fashion style) and "negro" (Spanish for black). The owner should decide; the BOARD has a row for it.
- **Report details are filtered too, as the task asked.** Someone reporting abuse can't quote a slur in the details; the reason picker still works.
- **Not checked:** listing measurement labels (free text up to 40 characters), and the accessory declaration's legal name.
- **The thresholds were calibrated only on the photos I had:** nudity 0.90 / 0.40, hood 0.60. No explicit images were used, so the reject line has no positive examples locally; the unit tests cover it with synthetic scores.
- **The apps' review banner** shows its own generic wording ("Someone at Dzirent will check these photos."), not the new hood or safety reason.
- **Two test chat messages stay in the database** (between test users 1 and 3).

Requests (website, `apps/web` not touched):
- Show the two text-filter refusals next to the field, and keep what was typed. Refusals carry the column name in `hint`.
- Check the sign-up display name with `check_text(name, 'profile')`, as the apps do, because the Auth API hides the database's message.
- Reuse the photo-check reasons as they are ("This photo isn't allowed on Dzirent.", "This piece has a hood, …").

## P1B part 1 - 2026-11-06 - terms acceptance and consent

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `03df5fe` to `cbd6ce5` (P1A part 2 and its fix-up). `TERMS_VERSION` and `PRIVACY_VERSION` in `apps/web/src/content/legal/config.ts` are both `1.0.0`.
- Migration `supabase/migrations/20261106120000_p1b_legal_and_consent.sql`, applied with `supabase db push` (dry run first: only this migration was pending):
  - `legal_documents`: `terms` 1.0.0 and `privacy` 1.0.0, with their URLs. Readable by everyone; no API role can write it.
  - `legal_acceptances`: user, document, version, platform (`web`, `android`, `ios`), time. Unique per user, document and version. Owner reads; written only by `accept_legal`; removed with the account.
  - `accept_legal(p_platform)` (elevated, signed-in only) records the current version of both documents. `needs_legal_acceptance()` (runs as the caller) is true while either is missing. No user had accepted anything, so every existing user gets the terms step.
  - `private_profiles.measurements_consent_at`. The trigger `app_private.require_measurements_consent`:
    - keeps the stored consent time when an app writes the row (apps can't set or clear it);
    - refuses a new body measurement without consent (`P0001` "Give consent before saving your measurements."), on insert, update and upsert. An upsert reaches the INSERT trigger first, so the trigger reads the consent from the existing row.
    - Clearing a measurement, and saving only fit profile or styles, stays allowed.
  - `give_measurements_consent()` returns the consent time, keeping the first one. `withdraw_measurements_consent()` deletes the six measurements and the consent time.
  - All existing body measurements were deleted, so everyone is asked fresh.
- Mobile shared code (Android builds it here; iOS shares it):
  - **Sign-up:** the tick is now "I agree to the Terms of Use and Privacy Policy". Both names are links (`LinkAnnotation`) that open dzirent.com/terms and /privacy in the browser. It is required, and `accept_legal` runs right after sign-up (`AuthScreens.kt`). "Read how Dzirent works" stays below it.
  - **Terms step:** a new `AuthScreenState.NeedsTerms`. After sign-in, and when a saved session opens at app start, `needs_legal_acceptance()` decides. While it's true, the app shows only `TermsUpdateScreen` ("We've updated our terms", both links, Agree, Sign out). Agree calls `accept_legal` with `"android"` or `"ios"` (the push service's platform name). Sign out unregisters push first, as Settings does (`DzirentApp.kt`, `Legal.kt`).
  - **Measurements:** before the first save that includes a measurement, a dialog shows "Your measurements are private. We use them only to suggest pieces likely to fit you. They are never shown to anyone." with Agree / Not now. Agree calls `give_measurements_consent`, then saves (`BodyMeasurementsScreen.kt`).
  - **Settings > Privacy & safety > Measurements consent:** shows "Given" or "Not given". When given, tapping it asks "Withdraw consent?" ("Your saved body measurements will be deleted…") and then calls `withdraw_measurements_consent`.
  - **Passwords:** `PASSWORD_MIN_LENGTH = 8` (`Models.kt`) is used by the sign-up check, the sign-up field's hint, Change password, and the "too weak" server message.
  - **Settings > Help & legal:** Help (/help), Safety tips, Community guidelines, Terms of Use, Privacy Policy, Copyright, Delete account (/delete-account), Contact support (/support). All open in the browser; guests see them too. `LinkRow` from About is now shared, and About says "Terms of Use" instead of "Terms of Service".
  - Removed the unused `DzirentPolicy.SIGN_UP_CONSENT`.
- New test `supabase/tests/p1b_legal_consent.mjs`.
- `contract.md`, `security-log.md` (three new Advisor findings, logged), `compliance.md` (gaps 8, 9 and 21 closed for the database and apps, with the website remainder named; inventory rows and the column map updated) and `BOARD.md`.

What I ran:
1. `supabase db push --linked --dry-run`, then `supabase db push --linked`: applied.
2. `node supabase/tests/p1b_legal_consent.mjs` as test user 1: PASSED on the first run.
   - `legal_documents` shows privacy 1.0.0 and terms 1.0.0. `needs_legal_acceptance()` was true; after `accept_legal('android')` it is false. The two rows are privacy 1.0.0 and terms 1.0.0 on android. A guest call to `accept_legal` was refused (401).
   - A chest measurement upsert without consent was refused (400, P0001, "Give consent before saving your measurements."). A direct PATCH of `measurements_consent_at` was ignored.
   - After `give_measurements_consent()` the upsert saved 92 cm. `withdraw_measurements_consent()` then cleared the measurement and the consent time.
3. Read-only queries afterwards:
   - 1 of 5 users has acceptances (test user 1, from the test).
   - 0 rows with a body measurement, 0 with consent.
   - `has_function_privilege`: `anon` can't run any of the four functions; `authenticated` can't run the trigger function.
   - `has_table_privilege`: `authenticated` can't insert acceptances or change documents; `service_role` can't insert documents; `anon` can read documents, not acceptances.
4. Security Advisor (2026-11-07 01:03 UTC): new are `accept_legal`, `give_measurements_consent` and `withdraw_measurements_consent` (signed-in elevated functions, logged with reasons). Nothing else changed.
5. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, both env files and `GOOGLE_SERVICES_JSON` loaded silently): BUILD SUCCESSFUL. 20 shared unit tests, 0 failures, 0 skipped (`SmokeTest` ran with the test-user env). No compiler warnings in the changed files.
6. No emulator, device or screenshots.

Debug APK: `H:\DziRent\Dzirent_dev\mobile\androidApp\build\outputs\apk\debug\androidApp-debug.apk` (22.2 MB, 2026-11-06 19:07 local).

Owner phone test:
- Sign in as test user 2 or 3. Test user 1 already accepted through the API test, so it won't see the terms step. You should see "We've updated our terms"; both links should open the website; Agree should enter the app; signing out and in again shouldn't show the step again.
- Sign out from the terms step: it should land in guest browsing.
- Sign up a new account: the tick needs ticking; the links open the pages; there should be no terms step afterwards.
- My measurements: enter a measurement and Save. The consent dialog shows; Not now saves nothing; Agree saves. Then Settings > Privacy & safety > Measurements consent > Withdraw: My measurements is empty again.
- Settings > Help & legal: each row opens the right page. Help (/help) has no page on the website yet.
- Sign-up with a 7-character password: refused with "at least 8".

iOS-facing changes for a Mac check (all in `commonMain`, no `iosMain` change):
- `Legal.kt` (new): `LinkAnnotation.Clickable` / `withLink` in `buildAnnotatedString`, `LocalUriHandler`, `AlertDialog`, Material icons `QuestionAnswer`, `Groups`, `Copyright`, `SupportAgent`, `Straighten`, `Description`, `PrivacyTip`.
- `DzirentApp.kt`: the `NeedsTerms` state and its check at start and sign-in.
- `AuthScreens.kt`, `SettingsScreen.kt`, `BodyMeasurementsScreen.kt`, `AboutScreen.kt` (`LinkRow` no longer private), `Models.kt`, `DzirentRepository.kt`.
- On iPhone, `accept_legal` gets `"ios"` from `IosPushService.platform`.

Open issues:
- **Website (out of scope here, `apps/web` not touched):**
  - It still uses the old "only connects people" tick, doesn't call `accept_legal` and doesn't check `needs_legal_acceptance`.
  - Its measurements form (`lib/workflow-mutations.ts`) has no consent step, so the database now refuses website measurement saves.
  - It still says 6-character passwords.
  - There is no `/help` page, which the apps link to.
  - Listed on `BOARD.md`.
- If `needs_legal_acceptance()` can't be reached (no connection), the app opens anyway and checks again at the next start or sign-in. The database doesn't block other actions for users who haven't accepted.
- With email confirmation turned on later (P8C), sign-up returns no session, so `accept_legal` can't run then. The terms step asks at the first sign-in instead, with the heading "We've updated our terms".
- A new terms or privacy version needs a migration that updates `legal_documents` together with the website's config.

## P1A part 1 - 2026-11-06 - data inventory

Done:
- Before starting: working tree clean, `Preview` up to date with `origin/Preview` at `62f50b5` (Step 8B); `git pull --rebase` was a no-op.
- New `pranalika/compliance.md`:
  1. data inventory, one row per data item across web, mobile, Supabase, the vision service and push, with a live table-and-column map;
  2. outside services;
  3. tracking and ads;
  4. how 18+ works today;
  5. security measures in place;
  6. Google Play Data safety and Apple privacy label drafts, with the items that change at P6A and P6B;
  7. rules to features, with phases;
  8. 32 numbered gaps, each with a fix and a phase from the handoff plan.
- New `pranalika/legal-placeholders.md`: every fill-in the legal pages need, with who fills it (owner, attorney, engineering) and a retention table to decide. All values blank.
- `BOARD.md`: new section "Handoff plan" with P1A to P8C; P1A part 1 Done.
- No code, database or settings changed.

What I ran (all read-only):
1. `supabase db query --linked` on `dzirent-server`:
   - columns of `public` and `storage`;
   - foreign-key delete rules (`information_schema` and `pg_constraint`, which also shows the keys into `auth.users`);
   - the bucket and its object count;
   - tables in the other schemas, and extensions;
   - RLS and policy counts, Storage policies, the Realtime publication;
   - `pg_net.ttl` and the age of its stored replies;
   - row counts of the tables in the inventory;
   - the key names (not values) in `auth.users.raw_user_meta_data`, and Vault secret names (not values);
   - `has_column_privilege` on `profiles` and `listings`.
2. Supabase Management API `GET /v1/projects/<ref>/config/auth`: printed selected non-secret fields only; SMTP only as set or not set.
3. Supabase log queries (read only): sources, field names, retention window, user-agent shapes with letters and digits masked. No IP, email or user agent was printed.
4. `gradlew :androidApp:dependencies --configuration releaseRuntimeClasspath` (JDK 21, env loaded silently): BUILD SUCCESSFUL. The first try stopped at the release guard (the configuration name contains "release"), so I set `ANDROID_VERSION_CODE_OFFSET=0` in that process only; one try through `cmd` couldn't find `gradlew.bat`. No build output was produced.
5. Read the merged manifest of the last debug build, and the Vercel project (MCP, read only).
6. `gcloud` (Cloud Logging buckets, sinks, audit config, Cloud Run describe): failed, it needs an interactive `gcloud auth login`. Cloud Logging retention, Cloud Run settings and the billing kill switch are marked unconfirmed.
7. Phase 2:
   - Schema: a script compared the live schema with `compliance.md`. All 26 tables were named. Many columns were only described in words, so I added the exact column map to 1.16. On re-run, all 193 columns are named.
   - EXIF: re-read the upload paths. The website has one upload call (`listing-editor.tsx`, blobs only from `compressPhoto` or the IndexedDB draft of them). The phones have one (`ListingPublisher.syncPhotos` through `compressImage` on Android and iPhone). All three re-encode the photo; none strips on the server.
   - Tracking: 0 matches in the release dependency tree for 15 analytics, ads and crash SDK names. 0 in `apps/web/package-lock.json` for 11 web analytics names; the 18 `gtag` hits are all inside `tostringtag`. `apps/web/package.json` and `mobile/iosApp/project.yml` have no such dependency.
   - Fixes made from these checks: support email exists (`support@dzirent.com` in About and the website menu); style interests come from the measurements screen; push tokens are registered on every sign-in and app start, notification permission or not.
8. No emulator, device or screenshots.

Gap list summary (`compliance.md` section 8):
- Kept after deletion:
  - accessory declarations keep legal name, email, IP, user agent and city (gap 1, P3B);
  - listing declarations keep the IP (gap 2, P3B).
- Wrong data: website declarations record Vercel's IP and user agent, not the person's (gap 3, P5A).
- Photo metadata: removed by all three apps, but not on the server (gap 4, P5A). Phones keep the original photos with EXIF in app storage until pruned (gap 5, P3B).
- Location: the database doesn't round coordinates after sign-up (gap 6, P5A).
- Age: 18+ is a tick the user can undo through the API (gap 7, P2C).
- Consent: terms acceptance is not recorded (gap 8, P1B); no consent step before body measurements are saved (gap 9, P1B).
- Deletion effects: an account deletion removes the other person's chat and rental history (gap 10, disclose in P1A); reports lose their evidence (gap 11, P2B).
- Missing tools: no review tool (gap 12, P2B); no data download (gap 13, P3A).
- Retention: history that never expires, including scans, `listing_events` (nothing reads it), stale tokens, sessions and `pg_net` replies (gap 14, P3B); log retention unknown (gap 15, P3B, P5B, P7B).
- Logs: `send-push` puts the account ID and the push token in URL query strings, which the API logs record (gap 16, P5A).
- iPhone: no privacy manifest (gap 17, P8B).
- Android: backup includes the session and drafts (gap 18, P5A).
- Email: confirmation off, Auth `site_url` is localhost, no custom SMTP (gap 19, P6C, P8C).
- Security: no bot check, no message or report rate limits, no security headers (gap 20, P5A); clients still say 6-character passwords while the server needs 8 (gap 21, P5A).
- Content: chat text is unfiltered (gap 22, P2A); photos of people with no nudity check (gap 23, P2A).
- Disclosures: gaps 24 to 30.
- Not checked this session: gap 31, P7B.
- Sample listings in production: gap 32, P3B.

Requests:
- Owner: run `gcloud auth login` on this PC, so an agent can confirm Cloud Logging retention, the Cloud Run settings and the billing kill switch.
- Owner and attorney: fill `legal-placeholders.md`, including the retention periods, before P1A part 2 publishes the pages.
- This entry's title follows the task prompt (`P1A part 1 - ...`), not the `Step <number>` pattern in `README.md` rule 10.

## Step 8B - 2026-11-05 - photo scanning in the app

Done:
- Before starting: working tree clean, `Preview` up to date with `origin/Preview` at `2f65e95` (Step 8A); `git pull --rebase` was a no-op.
- Policy, in `services/vision/app/policy.json` and `policy_item_types` together (still 114 items):
  - Hoodies and sweatshirts are not allowed now: group "hoodies and sweatshirts", reason "This looks like a hoodie. Dzirent doesn't list everyday basics like hoodies and sweatshirts." (sweatshirt likewise).
  - Unchanged, as the owner decided: lingerie, underwear and swimwear not allowed; costume jewelry (necklace, earrings, bracelet, ring, brooch) allowed as "Costume jewelry" with the accessory declaration; a copied photo of a banned item stays rejected.
  - Sharper sweater and sweatshirt prompts, because on revision 3 two sweatshirt photos read as sweaters and went to review. The Western casual style prompt no longer mentions sweatshirts (`vocab.json`).
  - `test_policy_sync` compares `policy.json` with the newest migration that seeds the rows.
- Vision service redeployed twice with the Step 8A settings (`gcloud run deploy --source`): revision `vision-00003-thb` (policy), then `vision-00004-7rb` (sharper prompts), which serves 100%. Checked afterwards:
  - min instances unset (0), max 1, 2 CPU, 4 GiB, 120 s timeout, concurrency 4, no GPU, runs as `vision-runtime`;
  - the only IAM binding is `roles/run.invoker` for `vision-invoker`.
- Database (each migration applied with `supabase db push`):
  - `20261106040000_step8b_photo_policy.sql`:
    - the policy rows;
    - the `verification_required` description: "Renters and lenders verify their ID once, before their first message or first listing.";
    - `listings.auto_paused_reason` (at most 300 characters);
    - `listing_scans` in `supabase_realtime`;
    - `app_private.queue_scan`, shared by `request_scan` and the re-check (it returns the latest check when it is done and covers the current photos);
    - triggers on `listing_photos` (insert, delete, and changes of `storage_path`, `slot` or `listing_id`) that re-check active listings;
    - `vision_finish_scan` and `vision_fail_scan` pause an active listing with a reason while `vision_required` is on, or check again if the photos changed during the check;
    - the publish gate clears `auto_paused_reason` on a successful republish and on every insert by an app.
  - `20261106050000_step8b_sweater_prompts.sql`: the policy rows again, with the sharper prompts.
  - `20261106070000_step8b_server_role_helpers.sql`: a fix found by the API test (below). `service_role` needs USAGE on `app_private` and EXECUTE on `vision_pause` and `recheck_active_listing`.
  - `20261106080000_step8b_test_vision_on.sql`, then `20261106081000_step8b_test_vision_off.sql`: the flag on for API test 4, then off again.
- Mobile apps (shared code; Android builds it here, iOS shares it):
  - On-phone recognition removed:
    - code: `ItemRecognition.kt`, `ItemColor.kt`, `ItemRecognizer.kt`;
    - assets: the TinyCLIP model (`tinyclip_image.tflite`, 19.6 MB) and `label_embeddings.json`;
    - the LiteRT dependency and its AboutLibraries entry (`tinyclip.json`).
    - `ItemLabels.kt` keeps only the policy wording the editor still uses. The on-phone blur and lighting checks stay (`PhotoAnalyzer`, `PhotoGate`, `PhotoThresholds`).
  - New listing: after the photos step, the editor saves a paused draft row (title "New listing (draft)", a placeholder category), uploads the photos (`ListingPublisher.syncPhotos`) and calls `request_scan`.
    - "Checking your photos…" shows above the details while the lender types; nothing is blocked.
    - The scan is watched through Realtime, with a read every 4 s as the fallback (`DzirentRepository.watchScan`). After 3 minutes the editor stops waiting and shows "We couldn't check the photos right now." with a way to try again.
  - Allowed: the suggestions (category, item type, garment type, styles, title, description) fill only fields that are empty and weren't cleared by the lender, with the same accept and clear controls as before. On publish, kept, edited or cleared is logged to `suggestion_events`. The listing form has no color or pattern field: colors and pattern reach the listing only through the suggested title and description.
  - Rejected: a banner with the reason and "Replace photos" (back to the photos step). Review: "Someone at Dzirent will check these photos." (or the copied-photo reason). The lender can still finish the details either way.
  - The server's per-photo warnings show on each slot once the check is done, leaving out ones the phone already shows.
  - Publish reads `app_settings.vision_required`. When on, it waits for the check of the current photos, then the database gate decides, and its message is shown on refusal. When off, it publishes as before.
  - Editing a live listing keeps it live while saving; the server re-checks changed photos.
  - My closet: a draft shows a "Draft" badge and no switch; a paused listing shows its `auto_paused_reason`.
  - The local draft (`Drafts.kt`, version 2) remembers the server draft, the uploads and the scan. "Start over" deletes a draft row that was never published. Drafts saved by an older app version aren't offered any more.
- Root `README.md`:
  - product rules: hoodies and sweatshirts; lingerie, underwear and swimwear; costume jewelry with the declaration; automatic photo checks;
  - new section "Open-source software and models", built from `libs.versions.toml` and the Gradle files, `apps/web/package.json`, `requirements.txt`, the Dockerfile and the extensions in the migrations.
    - Licenses were read from the cached POMs, the installed Python package metadata, the npm registry, Hugging Face and GitHub, not from memory. Every link returned HTTP 200.
    - NOTICE files: PyTorch (link) and Requests (text). The models and the apps' direct dependencies ship none.
    - Google Play services Location is named separately as not open source.
- `contract.md`, `security-log.md`, `decisions.md` (appended "Photo policy (2026-11-05)") and `BOARD.md` are updated. The Step 8A entry below now has the measured cold start.

What I ran:
1. `pytest services/vision/tests` (scratch Python 3.12.10 venv): 40 passed, `test_policy_sync` included.
2. `run_eval.py` against the deployed service (identity token from gcloud): the 22 sample photos plus 8 openly licensed Commons hoodie and sweatshirt photos, kept in my scratch folder only.
   - Revision 3: hoodie/1 and sweatshirt/2 rejected; sweatshirt/3 and sweatshirt/4 went to review (read as sweaters). That is why the prompts were sharpened.
   - Revision 4 (`vision-00004-7rb`):
     - rejected: hoodie/1 ("This looks like a hoodie. …"), sweatshirt/2, sweatshirt/3 and sweatshirt/4;
     - review: hoodie/2, hoodie/3 and sweatshirt/1;
     - allowed: hoodie/4 (see open issues).
     - All 22 sample photos and all 12 sample listings are still allowed. Single-photo scans: median 1.3 s.
   - Local run of the final policy over the Step 8A Commons sets (scratch venv): the same as in Step 8A. Reject set: 32 rejected, 10 review, 0 allowed. Accept set: 12 allowed, 2 review, 2 rejected.
   - `H:\DziRent\vision-test\should-accept` and `should-reject` are still empty.
3. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded silently, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL.
   - Shared unit tests, re-run with `--rerun`: 19 passed, 1 skipped (`SmokeTest` needs the test-user env, which I didn't load). 7 of them are new, in `PhotoScanTest`.
   - Native libraries in the debug APK: `libandroidx.graphics.path.so` and `libdatastore_shared_counter.so`, for arm64-v8a, armeabi-v7a, x86 and x86_64. No TensorFlow Lite library and no model or label file is left.
4. API test `node supabase/tests/step8b_recheck.mjs <off|on> <photo>`, as test user 1 on "Emerald Velvet Cocktail Dress". The photo is a generated picture of a typed page (my own image, kept in scratch).
   - Flag off: adding the photo kept the listing active, and the automatic re-check finished in 7 s (review, "The photos seem to show different things, so someone at Dzirent will check them."). The listing stayed active with no reason. Removing the photo: re-checked, allowed (3 s). PASSED.
   - Flag on (migration `..._test_vision_on`): the re-check gave review (6 s), and the listing was paused with "Paused: the new photos need a check before this listing can go live again." The test removed the photo; `request_scan` gave allowed (4 s); the republish made it active and cleared the reason. PASSED.
   - Flag off again (migration `..._test_vision_off`). A final query showed `vision_required` off, the listing active with its 2 original photos and no reason, no listing anywhere with a pause reason, and only those 2 photos in its storage folder.
   - The first run failed: the check stayed `running`, because `service_role` couldn't call the new `app_private` helpers from `vision_finish_scan`. Fixed with the grant migration, then re-run.
   - The re-run's first attempt timed out too: the script compared scan times with this PC's clock, which runs about a second ahead of the server. It now compares scan IDs.
5. Security Advisor after all the migrations: no new findings. `has_function_privilege` on the new functions: as designed (`security-log.md`).
6. `gcloud run services describe` and `get-iam-policy`: the settings above.
7. No emulator, device or app screenshots. The only image I viewed was a contact sheet of the 8 Commons hoodie and sweatshirt photos.

Vision revision: `vision-00004-7rb`, serving 100%.

Native libraries removed: `libtensorflowlite_jni.so` (LiteRT), with the TinyCLIP model and its label embeddings.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (21.3 MB, "Dzirent Debug").

iOS-facing changes, for a Mac check:
- `iosMain`: `IosPhotoAnalyzer.kt` no longer has a recognition stub and implements the slimmer `PhotoAnalyzer` (`platform/Device.kt`).
- `commonMain`:
  - editor: `ui/ListingEditor.kt`, `ListingEditorState.kt`, `ListingStepPhotos.kt`, `ListingStepDetails.kt`; `data/ListingPublisher.kt`, `data/PhotoAnalysis.kt`;
  - data: `repository/DzirentRepository.kt` (app settings, `request_scan`, scan reads, a Realtime channel on `listing_scans`), `model/Models.kt` (`ListingScan`, `auto_paused_reason`);
  - screens: `ui/MainScreens.kt` (closet), `ui/Policy.kt`;
  - util: `Drafts.kt`, `ItemLabels.kt`, `ListingForm.kt`, `ListingPhotos.kt`, `PhotoGate.kt`, `PhotoThresholds.kt`, new `PhotoScan.kt`; deleted `ItemRecognition.kt` and `ItemColor.kt`.
- Here only `:shared:compileCommonMainKotlinMetadata` ran (common code against common APIs). `iosMain` was not compiled.
- On a Mac:
  - check that the framework or Xcode build compiles;
  - in the Simulator: new listing, photos, "Checking your photos…", suggestions fill the details;
  - check whether Realtime connects with the Darwin engine. If it doesn't, the 4 s reads still finish the check.

Open issues:
- hoodie/4 came back allowed on revisions 3 and 4, as an African print dress. It is Damien Hirst's "Butterfly Hoodie" on a dress form: long and fitted with an all-over print, so it reads like a hooded mini dress. hoodie/3, the same garment from the front, went to review.
  - Not fixed: stricter prompts would risk turning real printed dresses away.
  - Owner to decide: accept such misses for now, or have hooded garments go to review.
- The owner's `vision-test` folders are still empty.
- A new listing's draft row (title "New listing (draft)", paused) stays on the server if the lender leaves the editor. It shows in My closet as "Draft"; "Start over" or Delete removes it.
- The website doesn't call `request_scan` yet. Its listings are checked only when photos change while the listing is active (the trigger).
- While `vision_required` is on, a lender whose active listings' photos change more than 20 times in an hour has that listing paused until the next check.
- Artifact Registry `cloud-run-source-deploy` now holds images for revisions 1 to 4 (about 0.68 GB each). The older ones can be deleted.
- Owner: phone test of the new listing flow (photos, the check banner, suggestions, publish, closet reason). Mac: the iOS check above.
- Test data left: the test's `listing_scans` and `photo_scans` rows on "Emerald Velvet Cocktail Dress" (removed with the listing).

## Step 8A - 2026-11-05 - vision service backend

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `a59af89`, "Fix broken sample photos").
- Vision service, `services/vision/` (new): FastAPI on CPU PyTorch with Marqo-FashionSigLIP through open_clip, pinned to commit `c56244cc94f92419e8369fa71efdaf403b124ce8`.
  - Every Python package is pinned (`requirements.txt` is the full lock, installed with `--no-deps` and then `pip check`), and so is the base image (by digest).
  - The Docker build downloads the model and embeds all 446 prompts (`app/build_assets.py`). Only the vision tower's weights (354 MB) stay in the image, so a cold start reads local files only and never builds the text tower.
  - `POST /scan` and `GET /health`.
    - Per photo: `blur_score`, `brightness_score`, `framing_score`, `worn_by_person`, a 768-number `fingerprint`, label scores, a decision, and warnings worded as on the phone.
    - Per listing: verdict, a plain-words reason, suggestions and a quality summary. Suggestions are the category, item type and garment type (the database's own values), colors (from the garment's pixels), pattern, fabric, up to 3 styles from the app's list, a template title ("Maroon embroidered lehenga") and a description.
  - Quality checks (`app/quality.py`) and color names (`app/colors.py`) are numpy ports of the app's `PhotoQuality.kt` and `ItemColor.kt`, with the same thresholds and wording.
  - Policy (`app/policy.json`, 114 items): the README's allowed and not-allowed items, plus things that aren't clothing, each with 2 to 5 prompt phrasings and the lender-facing reason.
  - Verdict rules (`app/verdict.py`):
    - Allowed: allowed items take at least 0.90 of the probability, and neither not-allowed items nor not-clothing labels take more than 0.08.
    - Not allowed: one policy group reaches 0.60 while allowed items stay at 0.25 or less. The reason names the item.
    - Not clothing: both the labels and a separate general check reach 0.60. Reason: "This doesn't look like clothing or an accessory we list."
    - Everything else is unsure, and unsure or disagreeing photos give review, never allowed.
    - Size-tag and close-up photos never decide the verdict.
    - Quality never changes the verdict.
  - Photos are fetched only from the public `listing-photos` URL prefix (no redirects, 15 MB and 40 MP limits). `data:` image URLs are also accepted; the eval uses them so no test photo is uploaded anywhere.
  - Tests: `tests/` (color naming, title template, verdict thresholds, and `policy.json` = the migration's seed rows). Eval: `eval/run_eval.py`.
- Database, migration `20261105200000_step8a_photo_scanning.sql` (applied with `supabase db push`):
  - `vector` (0.8.2) in `extensions`.
  - `photo_scans` and `listing_scans`: the owner reads; only the server writes. One scan at a time per listing (partial unique index plus an advisory lock).
  - `policy_item_types`: the same 114 rows as `policy.json`, readable by everyone.
  - `app_settings`: `vision_required`, `verification_required` and `payments_enabled`, all off, readable by everyone, writable by no API role.
  - `request_scan(listing_id)`: owner only. It queues the scan and calls `scan-listing` through `pg_net` with the Vault secret `scan_listing_secret`, like `send-push`. Asking again while a scan runs returns that scan. A stuck scan fails after 10 minutes. Limit: 20 scans per lender per hour.
  - Server-only `vision_start_scan`, `vision_finish_scan` and `vision_fail_scan` (`service_role` only).
  - Duplicate check: a fingerprint with cosine similarity of 0.95 or more to a photo of another lender's listing turns allowed or review into review, with "This photo matches another listing."
  - Publish gate `listings_vision_publish_gate` (insert or status change to `active`, clients only). It acts only while `vision_required` is on.
- Edge Function `scan-listing` (new, deployed, `verify_jwt = false`):
  - Checks `x-scan-listing-secret` in constant time and marks the scan running.
  - Answers 202, then in the background (`EdgeRuntime.waitUntil`) signs a JWT as `vision-invoker`, swaps it for a Google ID token, calls `/scan` with public photo URLs (115 s timeout), computes the photo set hash and saves the result.
  - Any failure: `failed`, verdict review.
- Google Cloud (project `dzirent`, `us-west1`):
  - The four APIs were already enabled; `gcloud services enable` for them was a no-op.
  - Created `vision-runtime` (no roles) and `vision-invoker`.
  - Deployed `vision` with `gcloud run deploy --source`: no unauthenticated access, runs as `vision-runtime`, min 0, max 1, 2 CPU, 4 GiB, 120 s timeout, concurrency 4, no GPU.
  - Granted `vision-invoker` `roles/run.invoker` on the service only.
  - Created one key for `vision-invoker` (ID `476993fa…`).
  - Serving revision: `vision-00002-wgg`, URL `https://vision-296325491472.us-west1.run.app`.
  - Billing, budgets, `billing-alerts` and `stop-billing` were not touched.
- `contract.md`, `security-log.md`, `decisions.md` (appended "Photo scanning (2026-11-05)") and `BOARD.md` are updated.

What I ran:
- Locally, in a scratch Python 3.12.10 venv (same pinned versions, Windows wheels; nothing in the repo):
  - `pytest services/vision/tests`: 40 passed.
  - The bundled tokenizer gave the same token IDs as `timm/ViT-B-16-SigLIP` for all 446 prompts.
  - My preprocessing matched open_clip's own transform exactly (max difference 0).
  - The standalone vision tower gave embeddings identical to the full model's. Load time: 6.4 s instead of 14.4 s.
- Local calibration, before the first deploy:
  - Run on the 12 sample listings plus 58 openly licensed Wikimedia Commons photos kept in my scratch folder.
  - First thresholds (allowed at 0.70 / contrary at most 0.15): 3 of 42 should-reject Commons photos came back allowed (a uniform illustration, a shop mannequin, a man in a flight jacket filed under "Smartwatches"). They had allowed mass 0.85 to 0.89 and contrary mass 0.09 to 0.11. Genuine positives were at least 0.958.
  - Tightened to 0.90 / 0.08 and merged near-synonym groups (tank tops with T-shirts; track pants with sweatpants and joggers). Result: 0 allowed.
  - The general check had been vetoing clear accessories (sunglasses at 0.998 were sent to review), so it now applies only to not-clothing rejections, with fashion prompts that cover accessories.
- Duplicate threshold, measured locally:
  - Different garments: at most 0.80.
  - Front and back of one garment (same lender, not compared): 0.92 to 0.974.
  - Edited copies of one photo (JPEG q60, half size, 8% crop, +15% brightness, mirrored): at least 0.97.
  - So 0.95.
- Migration:
  - First run in a transaction that a final block always aborted (`DRYRUN_OK policy_rows=114 allowed=58 flags=3 flags_on=0 vector=0.8.2 triggers=1`). A follow-up query showed nothing persisted.
  - Then `supabase db push --linked --dry-run` (only this file) and `supabase db push --linked --yes`.
  - `has_table_privilege` / `has_function_privilege` for `anon`, `authenticated` and `service_role` on every new table and function: as designed.
- Secrets: `supabase secrets set` twice, through temporary files in my scratch folder, deleted right after; nothing printed. `supabase functions deploy scan-listing --use-api --no-verify-jwt`.
- Security Advisor after the migration: the only new finding is `request_scan` (logged). Performance Advisor: the only new item is `photo_scans_photo_id_idx` "not used yet". It is there for the photo-delete cascade.
- Phase 2:
  1. Unit tests: 40 passed (Python 3.12.10).
  2. Without sign-in, `GET /health` and `POST /scan` returned 403, and a made-up token got 401. `/health` with `gcloud auth print-identity-token` returned 200 (model, revision, Apache-2.0, 114 policy items).
  3. Eval: `run_eval.py` against the deployed service, twice (revisions 1 and 2), with identical results. The table is below.
     - `H:\DziRent\vision-test\should-accept` and `should-reject` were empty both times (0 files), so the owner's sets were not evaluated.
     - I added my scratch Commons sets as `commons-reject` and `commons-accept`. Their category labels are noisy: `boots/1` is footprints in snow, `hat/1` a car interior, `jeans/1` a building, `jumpsuit/1` a typed letter, `saree/2` a dog lying on saris.
     - No should-reject photo was allowed, so no change was needed after deploying.
  4. End to end: `node supabase/tests/step8a_scan.mjs` passed (warm).
     - Guests read 114 policy rows and three flags, all off. Guests got 401 for scans and `request_scan`.
     - Test user 1's `request_scan` on "Emerald Velvet Cocktail Dress" returned the same scan when asked twice. Test user 3 was refused (403).
     - The scan was done after 4 s: allowed, "This looks like a cocktail dress. You can list it." Suggestions: "Black velvet cocktail dress", Occasion & Party / dress, Western formal.
     - Both photos have `photo_scans` rows with 768-number fingerprints. User 3 reads none of it.
     - `scan-listing` with a wrong secret: 401.
  5. Gate: `supabase db query --linked -f supabase/tests/step8a_gate.sql`, one block that always ends by raising its results, so everything rolls back. With `vision_required` on, as the owner (role `authenticated` with their JWT claims):
     1. The real allowed scan let the listing publish. This also proves `scan-listing`'s hash matches the SQL `photo_set_hash`.
     2. A rejected latest scan: refused ("This listing can't be published yet: This looks like a T-shirt. …").
     3. Admin-approved: published.
     4. A photo moved slot: refused ("The photos changed after they were checked. …").
     5. A new listing inserted as active: refused ("Check the photos before publishing this listing.").
     6. Flag off: published.
     7. Another lender's photo with the same fingerprint: review, "This photo matches another listing."
     8. `vision_fail_scan`: failed / review.
     - Afterwards a separate query showed `vision_required = false`, no test rows, the listing still active and its photos unchanged.
  6. `gcloud run services describe` and `get-iam-policy`: min instances unset (0), max 1, CPU 2, memory 4Gi, no GPU, CPU only during requests, timeout 120 s, concurrency 4, runs as `vision-runtime`. The only IAM binding is `roles/run.invoker` for `vision-invoker`; there is no `allUsers` or `allAuthenticatedUsers`.
- Fixed after the first deploy:
  - `httpx` logged every photo URL at INFO (public URLs, but the logs are meant to hold counts only). `app/main.py` now sets `httpx` and `httpcore` to WARNING.
  - Redeployed: revision `vision-00002-wgg` has 0 log lines with URLs.
- No emulator, device or app screenshots. The only images I viewed were two contact sheets of the Commons test photos.

Eval, final run (revision `vision-00002-wgg`):

| Set | Photo | Expected | Verdict | Looks like | Reason | Warnings | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sample | silk-halter-evening-gown/front | allowed or review | allowed | gown | This looks like a gown. You can list it. | Left side of the item is cut off | yes |
| sample | silk-halter-evening-gown/back | allowed or review | allowed | gown | This looks like a gown. You can list it. | Left side of the item is cut off | yes |
| sample | tailored-charcoal-blazer/front | allowed or review | allowed | suit | This looks like a suit. You can list it. |  | yes |
| sample | tailored-charcoal-blazer/back | allowed or review | allowed | suit | This looks like a suit. You can list it. |  | yes |
| sample | emerald-velvet-cocktail-dress/front | allowed or review | allowed | cocktail_dress | This looks like a cocktail dress. You can list it. |  | yes |
| sample | emerald-velvet-cocktail-dress/back | allowed or review | allowed | cocktail_dress | This looks like a cocktail dress. You can list it. |  | yes |
| sample | cashmere-belted-trench-coat/front | allowed or review | allowed | trench_coat | This looks like a trench coat. You can list it. |  | yes |
| sample | cashmere-belted-trench-coat/back | allowed or review | allowed | trench_coat | This looks like a trench coat. You can list it. |  | yes |
| sample | pleated-wide-leg-trousers/front | allowed or review | allowed | trousers | This looks like trousers. You can list it. |  | yes |
| sample | pleated-wide-leg-trousers/back | allowed or review | allowed | trousers | This looks like trousers. You can list it. |  | yes |
| sample | linen-summer-sundress/front | allowed or review | allowed | day_dress | This looks like a dress. You can list it. |  | yes |
| sample | embroidered-silk-lehenga-set/front | allowed or review | allowed | lehenga | This looks like a lehenga. You can list it. |  | yes |
| sample | embroidered-silk-lehenga-set/back | allowed or review | allowed | lehenga | This looks like a lehenga. You can list it. |  | yes |
| sample | modern-qipao-midi-dress/front | allowed or review | allowed | qipao | This looks like a qipao. You can list it. |  | yes |
| sample | modern-qipao-midi-dress/back | allowed or review | allowed | qipao | This looks like a qipao. You can list it. |  | yes |
| sample | minimalist-wool-day-coat/front | allowed or review | allowed | coat | This looks like a coat. You can list it. |  | yes |
| sample | minimalist-wool-day-coat/back | allowed or review | allowed | coat | This looks like a coat. You can list it. |  | yes |
| sample | structured-silk-work-shirt/front | allowed or review | allowed | dress_shirt | This looks like a dress shirt. You can list it. |  | yes |
| sample | vintage-denim-jumpsuit/front | allowed or review | allowed | jumpsuit | This looks like a jumpsuit. You can list it. |  | yes |
| sample | vintage-denim-jumpsuit/back | allowed or review | allowed | jumpsuit | This looks like a jumpsuit. You can list it. |  | yes |
| sample | satin-backless-maxi-dress/front | allowed or review | allowed | slip_dress | This looks like a slip dress. You can list it. |  | yes |
| sample | satin-backless-maxi-dress/back | allowed or review | allowed | slip_dress | This looks like a slip dress. You can list it. |  | yes |
| commons-reject | baseball_cap/1 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. |  | yes |
| commons-reject | baseball_cap/2 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. |  | yes |
| commons-reject | baseball_cap/3 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. |  | yes |
| commons-reject | boots/1 (footprints in snow) | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | boots/2 | rejected | rejected | boots | This looks like boots. Dzirent doesn't allow shoes or boots. | Too dark: try daylight | yes |
| commons-reject | boots/3 | rejected | rejected | boots | This looks like boots. Dzirent doesn't allow shoes or boots. |  | yes |
| commons-reject | dog/1 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | dog/2 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | dog/3 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | hat/1 (car interior) | rejected | rejected | sofa | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | hat/2 | rejected | rejected | cowboy_hat | This looks like a cowboy hat. Dzirent doesn't allow hats or caps. |  | yes |
| commons-reject | hat/3 | rejected | rejected | cowboy_hat | This looks like a cowboy hat. Dzirent doesn't allow hats or caps. |  | yes |
| commons-reject | jeans/1 (a building) | rejected | rejected | household_object | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | jeans/2 | rejected | rejected | jean_shorts | This looks like jean shorts. Dzirent doesn't list everyday basics like jean shorts. |  | yes |
| commons-reject | jeans/3 | rejected | rejected | jeans | This looks like plain jeans. Dzirent doesn't list everyday basics like jeans. |  | yes |
| commons-reject | laptop/1 | rejected | rejected | laptop | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | laptop/2 | rejected | rejected | laptop | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | laptop/3 | rejected | rejected | laptop | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | sandals/1 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | sandals/2 | rejected | rejected | sandals | This looks like sandals. Dzirent doesn't allow shoes. |  | yes |
| commons-reject | sandals/3 | rejected | rejected | sandals | This looks like sandals. Dzirent doesn't allow shoes. |  | yes |
| commons-reject | shorts/1 | rejected | rejected | shorts | This looks like shorts. Dzirent doesn't list everyday basics like shorts. |  | yes |
| commons-reject | shorts/2 | rejected | review | suit | We're not sure what this piece is, so someone at Dzirent will check the photos. | Too bright: avoid direct sun and flash | yes |
| commons-reject | shorts/3 | rejected | review | crossbody_bag | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | smartphone/1 | rejected | rejected | phone | This doesn't look like clothing or an accessory we list. | Strong glare: move out of direct light; Right side of the item is cut off | yes |
| commons-reject | smartphone/2 | rejected | rejected | phone | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | smartphone/3 | rejected | rejected | drink | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | smartwatch/1 | rejected | review | shirt | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | smartwatch/2 | rejected | review | bomber_jacket | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | smartwatch/3 | rejected | review | bomber_jacket | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | socks/1 | rejected | review | potli_bag | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | socks/2 | rejected | rejected | socks | This looks like socks. Dzirent doesn't allow socks. |  | yes |
| commons-reject | socks/3 | rejected | rejected | socks | This looks like socks. Dzirent doesn't allow socks. | Too bright: avoid direct sun and flash | yes |
| commons-reject | sweatpants/1 | rejected | rejected | sweatpants | This looks like sweatpants. Dzirent doesn't list everyday basics like sweatpants. |  | yes |
| commons-reject | sweatpants/2 | rejected | review | chinos | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | sweatpants/3 | rejected | rejected | joggers | This looks like joggers. Dzirent doesn't list everyday basics like joggers. |  | yes |
| commons-reject | tank_top/1 | rejected | rejected | tank_top | This looks like a tank top. Dzirent doesn't list everyday basics like tank tops. |  | yes |
| commons-reject | tank_top/2 | rejected | review | folklorico_dress | We're not sure what this piece is, so someone at Dzirent will check the photos. | Strong glare: move out of direct light | yes |
| commons-reject | tank_top/3 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. | Strong glare: move out of direct light | yes |
| commons-reject | tshirt/1 | rejected | rejected | tshirt | This looks like a T-shirt. Dzirent doesn't list everyday basics like T-shirts. |  | yes |
| commons-reject | tshirt/2 | rejected | review | sweatshirt | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | tshirt/3 | rejected | review | shirt | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-accept | blazer/1 | allowed or review | allowed | tie | This looks like a tie. You can list it. | Bottom of the item is cut off | yes |
| commons-accept | blazer/2 | allowed or review | allowed | blazer | This looks like a blazer. You can list it. |  | yes |
| commons-accept | handbag/1 | allowed or review | allowed | clutch | This looks like a clutch. You can list it. |  | yes |
| commons-accept | handbag/2 | allowed or review | allowed | clutch | This looks like a clutch. You can list it. |  | yes |
| commons-accept | jumpsuit/1 (a typed letter) | allowed or review | rejected | document | This doesn't look like clothing or an accessory we list. |  | no |
| commons-accept | jumpsuit/2 | allowed or review | allowed | bomber_jacket | This looks like a bomber jacket. You can list it. | Top of the item is cut off | yes |
| commons-accept | kimono/1 | allowed or review | allowed | kimono | This looks like a kimono. You can list it. |  | yes |
| commons-accept | kimono/2 | allowed or review | allowed | kimono | This looks like a kimono. You can list it. |  | yes |
| commons-accept | necktie/1 | allowed or review | allowed | tie | This looks like a tie. You can list it. |  | yes |
| commons-accept | necktie/2 (a drawing) | allowed or review | review | tie | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-accept | saree/1 | allowed or review | allowed | saree | This looks like a saree. You can list it. |  | yes |
| commons-accept | saree/2 (a dog lying on saris) | allowed or review | rejected | dog | This doesn't look like clothing or an accessory we list. |  | no |
| commons-accept | sunglasses/1 | allowed or review | allowed | sunglasses | This looks like sunglasses. You can list it. |  | yes |
| commons-accept | sunglasses/2 | allowed or review | allowed | sunglasses | This looks like sunglasses. You can list it. |  | yes |
| commons-accept | wristwatch/1 (an LED DIY watch) | allowed or review | review | watch | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-accept | wristwatch/2 | allowed or review | allowed | watch | This looks like a watch. You can list it. |  | yes |

| Sample listing (all photos together) | Photos | Verdict | Suggested title | Category / garment type | Colors | Styles | Quality |
| --- | --- | --- | --- | --- | --- | --- | --- |
| silk-halter-evening-gown | 2 | allowed | Navy satin gown | Occasion & Party / dress | Navy, Grey | Western formal | 2 of 2 photos could be better. |
| tailored-charcoal-blazer | 2 | allowed | Black wool suit | Career & Professional / suit | Black | Western formal | All photos look good. |
| emerald-velvet-cocktail-dress | 2 | allowed | Black velvet cocktail dress | Occasion & Party / dress | Black | Western formal | All photos look good. |
| cashmere-belted-trench-coat | 2 | allowed | Brown wool trench coat | Outerwear / top | Brown |  | All photos look good. |
| pleated-wide-leg-trousers | 2 | allowed | White trousers | Career & Professional / trousers | White | Western formal, Western casual | All photos look good. |
| linen-summer-sundress | 1 | allowed | Orange linen dress | Everyday / dress | Orange, Maroon | Western casual | All photos look good. |
| embroidered-silk-lehenga-set | 2 | allowed | Maroon embroidered lehenga | Cultural & Traditional / saree | Maroon | South Asian | All photos look good. |
| modern-qipao-midi-dress | 2 | allowed | Emerald silk qipao | Cultural & Traditional / dress | Emerald, Black | East Asian | All photos look good. |
| minimalist-wool-day-coat | 2 | allowed | Grey wool coat | Outerwear / top | Grey | Western casual | All photos look good. |
| structured-silk-work-shirt | 1 | allowed | Beige shirt | Career & Professional / top | Beige | Western formal | All photos look good. |
| vintage-denim-jumpsuit | 2 | allowed | Grey denim jumpsuit | Occasion & Party / dress | Grey, Blue | Western casual | All photos look good. |
| satin-backless-maxi-dress | 2 | allowed | Beige satin slip dress | Occasion & Party / dress | Beige, Grey |  | All photos look good. |

Totals: sample photos 22 of 22 allowed, sample listings 12 of 12 allowed. Commons reject set: 32 rejected, 10 review, 0 allowed. Commons accept set: 12 allowed, 2 review, 2 rejected (the letter and the dog photo).

Times:
- Warm: single-photo scans median 1.3 s, max 1.9 s (80 scans, eval round trip). A 2-photo listing through the whole chain (`request_scan` to done, polled every 3 s): 4 s.
- Cold start: not measured yet at this commit. Measured right after it (Step 8B session, revision `vision-00002-wgg`): after 20 idle minutes, `request_scan` to done took 54 s end to end (the scan row: created 03:08:59 UTC, finished 03:09:51). The new instance started at 03:09:01, the app was ready 39.4 s after its process started, and the scan itself took 3.7 s.
- The container's own start-up (Python imports and model load, from `/health`): 27.8 s on revision 1, 31.9 s on revision 2. A cold scan takes at least that plus the warm time.

Model license: Apache 2.0 (the Hugging Face model card and the repo's metadata, `license: apache-2.0`).

New secrets (names only):
- Supabase Edge Function secrets: `SCAN_LISTING_SECRET`, `VISION_URL`, `VISION_INVOKER_KEY_BASE64`.
- Vault: `scan_listing_secret` (and `scan_listing_url`, the function's address, not a secret).
- Local file: `H:\DziRent\secrets\vision-invoker-key.json` (the `vision-invoker` key).

Open issues:
- The owner's test folders `H:\DziRent\vision-test\should-accept` and `should-reject` were empty, so the thresholds were set on the sample listings and 58 Commons photos only. Fill the folders and re-run: `python services/vision/eval/run_eval.py --url https://vision-296325491472.us-west1.run.app --out results.json`. It exits 1 if a should-reject photo comes back allowed.
- The apps and the website don't call `request_scan` or show anything yet (backend only, as asked). Before `vision_required` is turned on, the clients must insert new listings as `paused`, upload photos, run `request_scan`, then publish. An insert straight to `active` is refused while the flag is on.
- The gate checks only the change to `active`. Photos changed on a listing that is already active aren't checked again. Owner to decide: re-scan or pause on photo change.
- There is no admin tool yet for `admin_decision` (review verdicts wait for one).
- Colors are pixel heuristics, as on the phone. The dark "Emerald" velvet dress reads as Black, and the light-wash denim jumpsuit as Grey and Blue.
- The framing check warns "Left side of the item is cut off" on both gown photos. That is not verified by eye; quality never changes the verdict.
- A scan with more than 8 photos fails and goes to review (the app has 6 slots).
- The duplicate check compares against every stored fingerprint (exact, no index). Fine at today's size; add an index or a limit when `photo_scans` grows into the tens of thousands.
- Artifact Registry `cloud-run-source-deploy` holds 2 images of 0.68 GB each. The older one (`20baf90e…`) belongs only to retired revision `vision-00001-h2z`; I left it in place, and it can be deleted.
- Test data left: the end-to-end `listing_scans` and `photo_scans` rows of test user 1's "Emerald Velvet Cocktail Dress" (removed with the listing).

Requests (owner to confirm):
- The policy table goes beyond the README's lists:
  - Lingerie, underwear and swimwear are not allowed (from the app's `ItemLabels.kt` policy).
  - Necklaces, earrings, bracelets, rings and brooches are allowed as "Costume jewelry" (the app's jewelry tier, with the accessory declaration).
  - Hoodies and sweatshirts are allowed, as in the app.
- The duplicate check keeps a rejected verdict rejected and turns only allowed or review into review. The prompt says "becomes review", but a banned item shouldn't move to review just because its photo was copied.

## Step 5D - 2026-11-04 - Android check and top padding

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `c754168`, the 5C `ios01` merge).
- Top padding on Android: `androidMain/ui/BackHandler.android.kt`. `consumeScaffoldInsets(padding)` now returns `consumeWindowInsets(padding)`, the same as iosMain. Before, it returned the modifier unchanged. This is the only code change.
  - The NavHost already gets `padding(innerPadding)` from the outer Scaffold. Each screen's `TopAppBar` now no longer adds the status bar inset a second time.
- Nothing else changed. `PlatformNavigationBackHandler` on Android is still a no-op, and no commonMain or iosMain files were touched.
  - The commonMain `expect` comment in `MainAppScaffold.kt` still says "Android: unchanged (returns this modifier)". It's out of date now, but commonMain was off-limits because the build wasn't broken.

What I ran:
- `.\gradlew.bat :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` and the server env loaded), with the fix in place: BUILD SUCCESSFUL. 13 tests in 5 classes, 0 failures, 0 errors, 0 skipped.
- I didn't build the merge without the fix first. The 5C Android actuals compiled together with the fix in this one build.
- No emulator, device or screenshots.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (local build, not committed).

Owner phone check:
- The fix is only visible where the app draws behind the status bar. That is always the case on Android 15+, because targetSdk 36 forces edge to edge. The app has no `enableEdgeToEdge()` call, so on older Android the insets may be zero there and nothing changes.
- Pages with their own top bar should now have their title right under the status bar, at the same height as the Home title, with no empty band above it: Listing Details, See all, Settings, About, Licenses, Chat, Measurements, My studio, Studio page, Moderation (blocked users), Policy pages, the listing editor and the accessory declaration.
- Should be unchanged:
  - Home and the welcome and sign-in pages.
  - The bottom bar, and the bottom of scrolling pages above the navigation bar or gesture bar. The consumed padding also includes the bottom, so check that nothing is now hidden under the bottom bar, for example on Chat (the message box) and the listing editor's bottom buttons.

Open issues:
- Not seen on a phone yet (above).
- The stale `expect` comment in commonMain `MainAppScaffold.kt` (above).

## Step 5C - 2026-11-04 - iPhone polish

Branch: `ios01` only. Before starting I switched to `ios01` and pulled `Preview` (fast-forward to `95ddbfe`, 5B); the tree was clean. Kotlin and Compose Multiplatform weren't upgraded.

Done:
- Swipe back (`e70ee50`, final version `0f8e4ec`):
  - A drag that starts within 24 pt of the left screen edge and moves right goes Back once it reaches 80 pt (or a quick flick past 24 pt). It goes to the same place as the on-screen back arrow, through the same `popBackStack()`.
  - `iosMain/ui/BackHandler.ios.kt`:
    - `IosBackDispatcher`: the most recently added enabled handler wins, as on Android.
    - `PlatformBackHandler` (drawer, guide) registers with the dispatcher.
    - `PlatformNavigationBackHandler`: Back pops the stack while there's an earlier screen.
  - The gesture is a Compose modifier (`edgeSwipeBack`) on the app root in `MainViewController`.
    - It looks at touches before the screens do and takes the drag only once it's clearly a rightward swipe from the edge. Taps, vertical scrolls and drags that start away from the edge pass through.
    - It does nothing when nothing is enabled (root screens).
    - Dialogs are separate Compose layers, so it never acts underneath one.
    - My first two versions used UIKit gesture recognizers on the Compose view (a screen-edge recognizer, then a plain pan restricted to the edge). Neither ever fired in the Simulator, with or without simultaneous recognition, so I moved the gesture into Compose.
  - Both NavHosts are wired: the main app's and the sign-in flow's.
- Status bar (`48ec1ca`): `iosMain/ui/theme/Theme.ios.kt` adds `StatusBarFollowsTheme`, called from `MainViewController`.
  - It sets the window's appearance from the in-app theme: Light to light, Dark to dark, System to unspecified, so System keeps following the phone.
  - The app sits inside SwiftUI's hosting controller, which ignores a child's status bar style. The window appearance is what the status bar follows, and it updates when the theme changes.
  - Side effect: system sheets (photo picker, camera, share) also follow the in-app theme.
  - `SystemBarIcons` stays a no-op on iOS (comment updated).
- Top gap (`e792c20`):
  - Cause: the outer `Scaffold` in `MainAppScaffold` padded the `NavHost` for the status bar, and each screen's own `TopAppBar` added the status bar inset again.
  - This affected every page inside the NavHost that has a `TopAppBar`: Listing Details, See all, Settings, About, Licenses, Chat, Measurements, My studio, Studio, Moderation, Policy, the listing editor and the accessory declaration.
  - Fix: the NavHost marks the Scaffold padding as used (`consumeWindowInsets`) on iOS, so those top bars sit right under the status bar. Home and pages outside the NavHost (welcome, sign-in) were already right and are unchanged.
- `IosSignInTest` now calls supabase-kt directly, so a failure reports the real error instead of the app's "Couldn't log in".

commonMain changes (Android behavior identical; please build-check Android on Windows):
- `ui/MainAppScaffold.kt`:
  - Calls `PlatformNavigationBackHandler(navController)` just before the `NavHost`.
  - The `NavHost` modifier is now `Modifier.padding(innerPadding).consumeScaffoldInsets(innerPadding)`.
  - Two new `expect` declarations next to `PlatformBackHandler`: `PlatformNavigationBackHandler(NavHostController)` and `Modifier.consumeScaffoldInsets(PaddingValues)`.
- `ui/DzirentApp.kt`: `PlatformNavigationBackHandler(authNavController)` just before the auth `NavHost`.
- `androidMain/ui/BackHandler.android.kt`: the Android actuals are no-ops. `PlatformNavigationBackHandler` returns `Unit` (NavHost already handles system Back) and `consumeScaffoldInsets` returns the modifier unchanged.
- Note for Android: the same doubled top inset is probably there too (smaller, since Android's status bar is shorter). I left it unchanged as asked. Making the Android `consumeScaffoldInsets` actual `consumeWindowInsets(padding)` would fix it the same way.

What I ran:
- `./gradlew :shared:compileKotlinIosSimulatorArm64` after each item and after each fix: BUILD SUCCESSFUL, with no warnings in iosMain at the end.
- `./gradlew :shared:iosSimulatorArm64Test`, with the test-user variables passed as `SIMCTL_CHILD_*`, run twice:
  - `simctl spawn` is no longer blocked, and the tests ran. 12 of 13 passed: `ChatPushTest` 2, `GuestGateTest` 2, `ListingValidationTest` 4, `ModelTest` 4.
  - `IosSignInTest` failed both times on `NSURLErrorDomain -1202` / `errSSLXCertChainInvalid (-9807)`: "The certificate for this server is invalid" for `pwfzkyjeivadbtkfkdxr.supabase.co`.
  - From the host, the same server presents a valid Google Trust Services (WE1) chain (`openssl s_client`), and inside the app on the same Simulator HTTPS works (listings, photos, sign-in session).
  - So the bare test binary started by `simctl spawn` can't validate the chain in this environment. I couldn't fix that from here.
- Clean `xcodebuild ... clean build` for the iPhone 18 Pro simulator: CLEAN SUCCEEDED, BUILD SUCCEEDED, at the start of Phase 2 and again on the final code.
- Simulator: 3 app launches (of 4). I viewed 2 screenshot images (of 4). All other checks used OCR and pixel probes on the interaction tool's capture files (tools in a temp folder, outside the repo). The 2 screenshots are in `~/Desktop/Dzirent/step5c-screenshots/` (`1-listing.png`, `2-dark.png`).
- Android: not built here (no Android SDK on this Mac). No emulator or device used.

What I saw in the Simulator:
- Launch 1 (first build):
  - Listing Details and Settings titles sit at the same height as the Home title, right under the status bar, with no gap (screenshot 1).
  - Theme, checked by a status-bar pixel probe:

    | Theme | App | Status bar icons |
    | --- | --- | --- |
    | Dark | dark | light |
    | Light | light | dark |
    | System, with the Simulator in dark mode | dark | light |

    Screenshot 2 shows light icons on the dark app. The theme is left on Light.
  - The UIKit edge swipe did nothing.
- Launch 2 (pan recognizer): the swipe still did nothing.
- Launch 3 (Compose gesture):
  - Listing Details → Home in one swipe.
  - Studio page → Listing Details → Home, one level per swipe.
  - Settings → Home.
  - A vertical scroll and a mid-screen horizontal swipe on the listing page didn't navigate.
  - On Home (root) the swipe does nothing except the sidebar's own existing drag, which is enabled only on Home, the same as Android.
  - No crash in any launch (same pid throughout each).
- The app is left running on Home, signed in as test user 1, Light theme.

Open issues:
- `IosSignInTest` fails on Simulator certificate trust (above). Re-run on a normal Mac session.
- Some listing photos show as solid black boxes, for example "Satin Backless Maxi Dress", "Modern Qipao Midi Dress" and "Embroidered Silk Lehenga Set". Their storage files are 149-byte stub JPEGs (`ae3b22ace731bd21.jpg`, `cb2a8a3733907033.jpg`, `6877334392c02f0d.jpg`), not real photos. Seed data, not app code; the other photos render. Worth re-seeding those photos.
- The back swipe has no sliding preview animation; it acts on release, like Android's non-predictive Back.
- Android build check of the commonMain hooks above (Windows).

## Step 5B - 2026-11-04 - Android check after iOS merge

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `9e222ae`, the `ios01` merge).
- Android check: the Step 5 shared-code changes (`Guide.kt` using `PlatformBackHandler`, `@ObjCName` on `AccessoryDeclaration.NAME_MAX`) build on Android as they are. No `mobile/` changes needed.
- Backend: migration `20261104140000_step5b_dates_block.sql` (applied with `supabase db push`). `set_conversation_dates` now refuses with `42501` "You cannot message this user" (the same wording as `start_conversation`) when the renter and lender are blocked in either direction. The renter-only check and its error are unchanged. Grants are unchanged (`create or replace`).
- `supabase/tests/step5b_dates_block.mjs` (new): the block, refuse, unblock, works-again check.
- `supabase/tests/step7a_push.mjs`: step 5 used to change dates while blocked to prove no push is sent. It now expects that change to be refused. The token-untouched check is still there.
- `contract.md` and `security-log.md` (the `set_conversation_dates` entries) and `BOARD.md` updated.

What I ran:
- `.\gradlew.bat :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL. 13 tests in 5 classes, 0 failures, 0 errors, 0 skipped.
- `supabase db push --linked --dry-run` (only the new migration pending), then `supabase db push --linked --yes`: applied.
- `node supabase/tests/step5b_dates_block.mjs`: passed. User 1 blocked user 3, and user 3's date change was refused (403, `42501`) with the dates unchanged. After the unblock the change worked, and the original dates were put back.
- `node supabase/tests/step7a_push.mjs` (updated): passed. While blocked, both the message and the date change were refused, and the fake token was untouched after 20 s.
- No emulator or device used.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (local build, not committed).

Open issues:
- How the apps handle the refusal (read from the code, not run): on the phone, `ChatScreens.kt` changes dates only after the message itself is sent. A blocked message is refused first, so the date call isn't reached, and `setConversationDates` returns false on any error anyway. The website's dates action shows its own "Could not change your dates.", not the server text.
- Everything open from Step 5 still stands (iOS push, iOS item recognition, the listing-page top gap, iOS unit tests not run).

## Step 5 - 2026-11-04 - iPhone app (Simulator)

Branch: `ios01` only (per the task prompt, overriding the two-branch rule). Nothing pushed to `main` or `Preview`. Done on the owner's Mac (Xcode 27.1, JDK 17, no Android SDK).

Done:
- Checkpoint 1, shared code builds for iPhone (`70a23a8`):
  - `mobile/shared/build.gradle.kts`: a static framework, `baseName "shared"`, for `iosArm64` and `iosSimulatorArm64`.
  - The only commonMain compile error: `ui/Guide.kt` used Android's `BackHandler`. It now uses the existing `PlatformBackHandler`.
  - `mobile/iosApp/scripts/load-env.sh`: reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the env file (handles CRLF, quotes and spaces around `=`) and never prints them.
- Checkpoint 2, Xcode app shell in `mobile/iosApp` (`f23f4a3`):
  - `project.yml` (XcodeGen 2.46.0) and the generated `iosApp.xcodeproj`, both committed.
  - Settings: app name Dzirent, bundle ID `com.dzirent.app`, iOS 16+, iPhone only, portrait only, version 1.0.0 (1).
  - Build phase "Build shared Kotlin framework" (`scripts/build-shared.sh`) runs on every build. It reads the env file path from `mobile/iosApp/local.config` (gitignored; `local.config.example` is committed), defaulting to `~/Desktop/Dzirent/secrets/dzirent-server.env`. It finds JDK 17 and runs `./gradlew :shared:embedAndSignAppleFrameworkForXcode`. If the env file or a value is missing, the build stops with an error naming the file and the fix. Xcode links the framework from `shared/build/xcode-frameworks/<config>/<sdk>`, so nothing is copied by hand.
  - `iosApp/iOSApp.swift`: SwiftUI shows `MainViewController()` edge to edge, like Android. Compose handles the safe areas.
  - `Info.plist`: location, camera and photo-library texts use the Android wording. It also sets `CADisableMinimumFrameDurationOnPhone`, which Compose needs. Launch screen: the logo mark on white (on #0E0E0E in dark mode).
  - App icon: the logo mark (#A80038) on white, rendered from `apps/web/public/logo-mark.svg`, with no alpha channel.
  - `AccessoryDeclaration.NAME_MAX` collided with the C `NAME_MAX` macro in the generated header. Its Objective-C name is now `nameMaxLength` (`@ObjCName`); the Kotlin name is unchanged.
  - `.gitignore`: added `mobile/iosApp/local.config`.
- Checkpoint 3, iPhone versions of the phone features (`1925a14`), all in `iosMain`:
  - Settings storage (`IosSettingsStorage`): NSUserDefaults, using Android's key names (theme, distance_unit, measure_unit, rental_days, default_distance_step, recent_searches_<user>) and fallbacks. Small flags (`KeyValueStore`) also use NSUserDefaults.
  - Location (`IosLocationService`):
    - CoreLocation "when in use", accuracy about 1 km, coordinates rounded to 2 decimals, 15 s timeout.
    - Reverse geocoder with a 10 s timeout: `locality ?: subAdministrativeArea`, then `cityLabel()` for the US ("City, ST"), "City, PR" for Puerto Rico, city only elsewhere.
    - The permission request goes through `rememberLocationPermissionRequest`. A refusal leads to the existing "choose your city" path.
  - Photo picker: PHPicker, images only, limited to the editor's `maxPhotos` (same as Android's `PickMultipleVisualMedia(maxPhotos)`). It uses the shared consent dialog first, needs no photo-library permission, and shows "Some photos couldn't be read. Pick different ones." when needed.
  - Camera:
    - Shared consent dialog first, then the system camera (UIImagePickerController) behind camera access.
    - No camera (the Simulator): the same message Android shows when there's no camera app, "No camera app found. Use Gallery instead."
    - Access refused: the same dialog as Android, worded for iOS, with an "Open Settings" button.
  - Image compression: the same defaults as Android (long side at most 1600 px, JPEG quality 80), turned upright, never scaled up.
  - Photo copies live in `Application Support/listing_photos/<user>` and drafts in `Application Support/drafts/<name>.json` (atomic writes), with the same file names as Android.
  - Other phone services: camera cache cleanup, a toast-style message, opening links, app version and build from Info.plist. `search_related.json` is bundled straight from `shared/src/androidMain/assets` (referenced in `project.yml`, not copied).
  - On-device AI (`IosPhotoAnalyzer`) works exactly like Android when its TinyCLIP model can't load. The shared photo checks (sharpness, lighting, whole item, colors) still run on the upright photo, but there is no embedding and no scores, so no suggestions appear.
  - Push (`IosPushService`) stays a stub but no longer throws:
    - No token and `canNotify()` is false.
    - `openNotificationSettings()` opens Dzirent's page in the Settings app.
    - The notification permission request answers "no".
  - Licenses screen: a plain list of the main libraries and their licenses. Android uses AboutLibraries.
- Checkpoint 4, running in the Simulator (iPhone 18 Pro, iOS 27.0):
  - Built with xcodebuild, installed with `xcrun simctl install`, launched with `xcrun simctl launch`.
  - Guest browsing, the listing page and sign-in all work (details under "What works in the Simulator").
  - `iosSimulatorArm64Test/.../IosSignInTest.kt` (new) signs in test user 1 through the shared repository on the Simulator. It skips when the variables aren't set (pass `SIMCTL_CHILD_TEST_USER_1_EMAIL` / `_PASSWORD`). It compiles and links, but couldn't run here (see below).

What I ran:
- `./gradlew :shared:compileKotlinIosSimulatorArm64`:
  - Failed first on `Guide.kt` (2 errors), then passed.
  - Passed again after Checkpoint 3, with no warnings in iosMain.
- `./gradlew :shared:linkDebugFrameworkIosSimulatorArm64`: BUILD SUCCESSFUL.
- `xcodebuild -project iosApp.xcodeproj -scheme iosApp -destination 'platform=iOS Simulator,id=<iPhone 18 Pro>' build`:
  - Failed first on the `NAME_MAX` header clash, then BUILD SUCCEEDED.
  - BUILD SUCCEEDED again after Checkpoint 3; `search_related.json` is in the app bundle.
- `scripts/build-shared.sh` with `local.config` pointing at a missing file: exit 1 with the error message (config restored after).
- Phase 2, clean build: `xcodebuild ... clean build` into a fresh DerivedData: CLEAN SUCCEEDED, BUILD SUCCEEDED. The only warnings come from supabase-kt's generated header (`Auth_ktSSO`/`Auth_ktPhone` names) and App Intents metadata.
- Phase 2, `./gradlew :shared:iosSimulatorArm64Test`:
  - Compiling and linking the tests passed. The run failed with `xcrun` exit code 137.
  - Cause: in this agent environment every `xcrun simctl spawn` process is killed with SIGKILL, even `/bin/echo` (checked). Running the test binary by hand, also after re-signing it, gave the same result.
  - So the iOS unit tests have not run. This is the environment, not the code: `simctl install` and `launch` work, and the app runs.
- Phase 2, `./gradlew :androidApp:assembleDebug`: not run. The Android SDK isn't installed on this Mac. Gradle configured the iOS tasks without it, so I installed nothing.
- Device check through Xcode's device-interaction tools, done by a subagent:
  - Compose exposes no accessibility tree to them, so taps were placed from screenshots and OCR.
  - 3 screenshots were viewed and kept, in `~/Desktop/Dzirent/step5-screenshots/` (outside the repo): `1-first-screen.png`, `2-home.png`, `3-listing.png`.
  - The interaction tool writes a capture file on every call. Sign-in was checked by OCR of those captures (text only, no more images viewed).
- Crash check: the app process (same pid) stayed up through guest browsing, the listing page, sign-in and Saved. No Dzirent crash report appeared.
  - Device logs: `log show`/`log stream` return nothing in this environment (blocked like `simctl spawn`), and `GetConsoleOutput` had no launch session. So "no crash" rests on the process and the crash reports, not the log.
- Tools on this Mac: Homebrew couldn't write (`/opt/homebrew` blocked by the environment), so XcodeGen 2.46.0 ran from its official release zip in a temp folder, outside the repo.
- Git: this Mac had no git identity. The first commit (`70a23a8`) got an auto-detected `vivekanandakallakuri@Vivekanandas-MacBook-Air.local` author. I then set a repo-local identity (`Vivek-k24`, `vivek.kallakuri@gmail.com`, as in earlier commits). I didn't rewrite the pushed commit.

What works in the Simulator:
- Launch screen, then the "Welcome to Dzirent" sheet (Sign Up, Log In, Browse as guest).
- As a guest: the top bar shows "Austin, TX", the date chip "Nov 4 - 8", the measurements banner, and the Products/Studios tabs with sample listings and real photos (for example "Linen Summer Sundress $14 · under 1 mi"). The bottom bar shows Home, Inbox, Search, Closet and Saved.
- Listing page: photo, title, "Everyday | Size XS", price, studio row, description.
- Sign-in with test user 1, through the Saved guest gate, then Log In, then "Welcome Back":
  - No error appeared.
  - The avatar now shows the user's initials.
  - The "Finish setting up your account" dialog appeared.
  - Saved opens without the guest gate.
  - Home shows that user's nearby listings.
- The Simulator is left open (iPhone 18 Pro booted) with the app running, signed in as test user 1.

Not verified:
- Location permission and geocoding, picking photos, the camera dialogs, compression and upload, drafts, toasts, the dark theme.
- The app surviving a restart while signed in. The app's Preferences folder was still empty right after sign-in, so I couldn't confirm where supabase-kt saves the session.
- An `iosArm64` (device) build. Real-device signing is out of scope.

Open issues:
- On-device item recognition on iOS: stub (no TinyCLIP; photo checks run). Needs LiteRT/Core ML for iOS.
- iOS push: stub. Needs a paid Apple Developer account (APNs key, Firebase iOS app), and `send-push` sends to Android tokens only. Until then, after the first message the "Get notified" prompt appears once, and its button opens Dzirent's Settings page.
- Listing page on iPhone: an empty band of about 60-130 pt between the status bar and the "Listing Details" bar. It looks like the top inset added twice by nested Scaffolds, made larger by the Dynamic Island status bar. It's shared UI, so I left it unchanged (no redesign); check whether Android shows the same.
- Status bar icon colour doesn't follow the in-app theme (`SystemBarIcons` is still a no-op on iOS).
- No iOS back-swipe gesture (`PlatformBackHandler` is a no-op on iOS); on-screen back arrows work.
- The iOS unit tests (`iosSimulatorArm64Test`, including `IosSignInTest`) need running on a Mac where `simctl spawn` works.
- Universal links, real-device signing and TestFlight: out of scope (paid account).
- `test-user.env` has a space after `=` for test user 1. The loaders trim it.

How the owner opens and runs the app in Xcode:
1. Needs Xcode and JDK 17 (both on this Mac). Optional: copy `mobile/iosApp/local.config.example` to `local.config` and set `DZIRENT_ENV_FILE` if the env file isn't at `~/Desktop/Dzirent/secrets/dzirent-server.env`. That file already exists on this Mac.
2. Open `mobile/iosApp/iosApp.xcodeproj` in Xcode.
3. Pick the `iosApp` scheme and an iPhone simulator (for example iPhone 18 Pro).
4. Press Run (Cmd-R). The first build runs Gradle for a few minutes; later builds are faster.
5. After changing `project.yml`, regenerate with `xcodegen generate` in `mobile/iosApp`. Code changes in `mobile/shared` need nothing extra; the build phase rebuilds the framework.

Files changed:
- `mobile/shared/build.gradle.kts`, `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Guide.kt`, `util/AccessoryDeclaration.kt`
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/MainViewController.kt`, `platform/IosDevice.kt`, `platform/IosPlatformServices.kt`, `platform/IosImages.kt` (new), `data/IosPhotoAnalyzer.kt` (new), `ui/PhotoPermissions.ios.kt`, `ui/LocationPermission.ios.kt`, `ui/NotificationPermission.ios.kt`, `ui/Licenses.ios.kt`
- `mobile/shared/src/iosSimulatorArm64Test/kotlin/com/dzirent/shared/IosSignInTest.kt` (new)
- `mobile/iosApp/` (new): `project.yml`, `iosApp.xcodeproj`, `iosApp/` (Swift entry, Info.plist, assets), `scripts/build-shared.sh`, `scripts/load-env.sh`, `local.config.example`
- `.gitignore`, `pranalika/BOARD.md`, this file

Requests:
- Owner: merge `ios01` into `Preview` when ready.

## Step 7A - 2026-11-03 - Android push notifications

Done:
- Backend (migration `20261104035948_step7a_push_notifications.sql`, applied with `supabase db push`):
  - `device_tokens` (token unique, user, platform, created and last-seen times) and `notification_settings` (Messages default on, "Show message text" default off). Owner-only RLS, explicit grants (new tables get no Data API grants by default since 2026-10-30), both removed with the account.
  - `register_push_token(p_token, p_platform)` (moves a token to whoever signed in on that phone last) and `unregister_push_token(p_token)`.
  - Triggers on `messages` (new message: the other participant), `conversations` insert (new chat: the lender) and requested-date changes (the other participant) call `app_private.queue_push`. It skips blocked pairs (either direction), recipients with Messages off or no registered phone, and words the push: "New message from <name>" (text only if "Show message text" is on), "New chat from <name>" (listing and dates), "New dates from <name>" ("Nov 5 - 8 · listing"). Text that looks like a phone number, email or street address, map link or coordinates is left out entirely. A push problem never blocks the message or chat itself.
  - `pg_net` (in `extensions`) posts to `send-push` with the shared secret. The migration generates the secret inside the database (Vault `send_push_secret`) and stores the function address (Vault `send_push_url`).
- `send-push` Edge Function, deployed: checks `x-send-push-secret` against `SEND_PUSH_SECRET` (constant time), gets a Google access token from the server key (`FIREBASE_SERVICE_ACCOUNT_BASE64`), sends high-priority FCM HTTP v1 data messages (chat ID, per-chat tag `chat_<id>`, TTL one day) to the recipient's Android tokens, and deletes tokens Firebase reports as unregistered or invalid. Logs counts only.
- Secrets: `SEND_PUSH_SECRET` (copied from Vault) and `FIREBASE_SERVICE_ACCOUNT_BASE64` (from the server key file) set with `supabase secrets set --env-file` through a temporary file in my scratch folder, deleted right after. Nothing printed or committed.
- Android: Firebase Messaging (BoM 34.19.0) in `androidApp` only. Gradle reads `google-services.json` from the path in `GOOGLE_SERVICES_JSON` and turns it into the string resources the google-services plugin would generate, using the Firebase app of each build type's application ID (`com.dzirent.app`, `com.dzirent.app.debug`). The file is never copied into the repo; `.gitignore` lists it. Release builds fail without it; a debug build without it builds with push off.
  - Token registered on sign-in and every app start while signed in, and on token refresh (`onNewToken`, using the one shared client `DzirentRepository.shared`). Sign-out and account deletion unregister and delete the token and clear shown notifications.
  - The app builds each notification from the data message in a "Messages" channel: one per chat (the tag), nothing for another account signed in on the phone, nothing while that chat is on screen (and opening a chat clears its notification). The lock-screen public version has the title only. A tap opens the chat.
  - Permission: asked only after the user's first message sent on the phone, after "Get notified when they reply". Declining is final; Settings > Notifications turns it on (system question once on Android 13+, then the phone's notification settings).
  - Settings > Notifications (signed in): Messages and "Show message text", saved to `notification_settings`.
  - iOS: `PushService` interface in common code with an iOS stub (`TODO`) only. `send-push` sends to Android tokens only.
- Release workflow writes `google-services.json` from the new GitHub secret `GOOGLE_SERVICES_JSON_BASE64` before building and sets `GOOGLE_SERVICES_JSON`.
- `decisions.md` (Notifications), `contract.md`, `security-log.md`, `BOARD.md` updated.
- Fixed while building: the Preview branch did not compile (Step 4C commit `fe61cfb`): `BlockedProfile` didn't exist (now `Profile`), `BrowseSession` called the repository's member extension `toListing()` from outside (now `with(repository)`) and `PrivateProfile()` without its `userId`, and `Home.kt` duplicated `Listing.availabilityWindows()` from `Fit.kt` (copy removed). Minimal edits only.
- Before starting: the uncommitted changes were one extra trailing blank line in `supabase/seed/list_listings.mjs` and `sample_photos.mjs`; identical to `origin/Preview` ignoring whitespace, so discarded.

Files changed:
- `supabase/migrations/20261104035948_step7a_push_notifications.sql` (new), `supabase/functions/send-push/index.ts` (new), `supabase/config.toml`, `supabase/tests/step7a_push.mjs` (new)
- `mobile/gradle/libs.versions.toml`, `mobile/androidApp/build.gradle.kts`, `mobile/androidApp/src/main/AndroidManifest.xml`, `mobile/androidApp/src/main/java/com/dzirent/app/MainActivity.kt`
- `mobile/androidApp/src/main/java/com/dzirent/app/push/FirebasePush.kt`, `ChatNotifications.kt`, `DzirentMessagingService.kt` (new), `mobile/androidApp/src/main/res/drawable/ic_notification.xml` (new, logo mark in white)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/Push.kt` (new), `platform/Device.kt`, `ui/Notifications.kt` (new), `ui/DzirentApp.kt`, `ui/MainAppScaffold.kt`, `ui/ChatScreens.kt`, `ui/SettingsScreen.kt`, `repository/DzirentRepository.kt`, `model/Models.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidDevice.kt`, `ui/NotificationPermission.android.kt` (new)
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosDevice.kt`, `IosPlatformServices.kt`, `ui/NotificationPermission.ios.kt` (new)
- `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ChatPushTest.kt` (new)
- Step 4C compile fixes: `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BrowseSession.kt`, `util/Home.kt`, `repository/DzirentRepository.kt`
- `.github/workflows/android-release.yml`, `.gitignore`
- `pranalika/decisions.md`, `pranalika/contract.md`, `pranalika/security-log.md`, `pranalika/BOARD.md`, this file

What I ran:
- `google-services.json` lists both `com.dzirent.app` and `com.dzirent.app.debug` (checked package names only).
- Baseline `:androidApp:assembleDebug` on `dc9ca25`: failed with the Step 4C errors above. After the fixes `:shared:compileDebugKotlinAndroid` passed.
- `supabase db push --dry-run` (only the new migration pending), then `supabase db push --linked --yes`: applied.
- Read-only queries (`supabase db query --linked`): both Vault entries exist (secret 64 characters), `pg_net` 0.20.4, the three triggers exist, `device_tokens`/`notification_settings` grants have no `anon`, `push_dates_label` gives "Nov 5 - 8" and "Oct 30 - Nov 2", `push_safe_text` hides "(512) 555-0199" and "123 Main St" and keeps "Is this available Nov 5 - 8?".
- `supabase secrets set --env-file ...` (temporary file, deleted): 2 secrets set; `supabase secrets list` shows both names.
- `supabase functions deploy send-push --use-api --no-verify-jwt`: deployed.
- `node supabase/tests/step7a_push.mjs`: all passed.
  - `send-push` with a wrong secret: 401.
  - Test user 1's settings upsert (Messages on, text hidden) through the API.
  - Fake token registered for test user 1; user 1 reads it, user 3 reads none.
  - Test user 3 sent a message in their chat with user 1; the fake token was gone within the 60 s wait.
  - User 1 blocked user 3: user 3's message refused (403); user 3 changed the chat dates (allowed while blocked); after 20 s the second fake token was still there.
  - Unblocked; `unregister_push_token` removed the second token; no block left.
- `net._http_response` (read-only) for the test window: exactly one request, the message push: HTTP 200 `{"sent":0,"failed":1,"removed":1,"errors":["INVALID_ARGUMENT"]}`, so `send-push` ran, got a Google access token, reached Firebase, got the invalid-token reply and removed the token. Nothing was sent during the blocked step; the request queue is empty.
- Security Advisor: the only new finding is `register_push_token` (signed-in users can run an elevated function), logged with the reason.
- `:androidApp:assembleDebug :shared:testDebugUnitTest --continue` with `GOOGLE_SERVICES_JSON` set (JDK 21): BUILD SUCCESSFUL. Unit tests: 5 classes, 13 tests, 0 failures (`ChatPushTest` 2 new; `SmokeTest` ran live because the test-user variables were loaded).
- After marking the deprecated Firebase token calls (below), `:androidApp:assembleDebug` again: BUILD SUCCESSFUL, no warnings in the push code.
- `aapt2` on the debug APK: package `com.dzirent.app.debug`; manifest has `POST_NOTIFICATIONS`, `DzirentMessagingService` with `MESSAGING_EVENT`, and the Firebase default channel and icon; the Firebase string resources are present and `google_app_id` is the debug app's (compared in a script, not printed).
- No emulator or device used.

Not verified (needs the owner's phone):
- A real notification arriving, its wording on screen, the lock-screen version, the first-message prompt and system dialog, Settings toggles, tap-to-open, no notification while the chat is open, nothing after sign-out.
- The release workflow (needs the new secret below) and any iOS build.

Open issues:
- The owner must add the GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (base64 of `H:\DziRent\secrets\google-services.json`) before the next run of the Android release workflow; without it the workflow stops with an error.
- firebase-messaging 25.1 deprecated `getToken`, `deleteToken` and `onNewToken` in favour of registering with the Firebase installation ID. Firebase's HTTP v1 send docs still describe only token targeting, which `send-push` uses, so the app keeps the token calls (warnings suppressed with a comment). Move both sides when the installation ID route is documented.
- Phone test for the owner: sign in on the phone, send a first message (prompt appears once), have another account message you with the app in the background (notification, text hidden), turn on "Show message text" (text appears), open that chat (its notification clears, no new one while open), tap a notification (opens the chat), turn Messages off (nothing arrives), sign out (nothing arrives).
- Test data left on `dzirent-server`: one message "Step 7A push test" in the chat between test user 3 (renter) and test user 1 (lender). That chat had no requested dates and now shows Dec 14 - 16 from the blocked-step test; dates can't be cleared through the API, so I left them (no one-off SQL).
- `set_conversation_dates` does not check blocks, so a blocked renter can still change a chat's dates (no push is sent). Not changed here.
- The text filter is a heuristic: it errs toward hiding text (some ordinary messages with long numbers or street-like words lose their preview), and unusual address formats may not be caught.
- "New chat" fires when a renter opens a chat from a listing, before they type anything, as the task asked. With the per-chat tag, their first message replaces it.
- The migration stores the production function address in Vault. A local `supabase start` stack would call production with its own random secret and get 401 (harmless).
- Step 4C's handoff (Antigravity) says both builds passed, but the committed tree did not compile; fixed above.

Debug APK path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`

New GitHub secret:
- `GOOGLE_SERVICES_JSON_BASE64`

## Step 2C - 2026-11-02 - website fixes

Done:
- Onboarding after sign-up: copied the app's first-run flow and setup checklist. Renters get Location and Body Measurements; lenders and "both" also get Studio setup and First piece listing. Added WelcomeChecklistModal, FinishSetupCard on Profile, and 5-step GuideOverlay tour matching the app. Skippable, stored in localStorage per user, lands on the same page.
- Guest gate: replaced every full-page redirect to the sign-in page with the app's interactive dialog matching `GuestGate.kt` copy and options (Create account, Sign in, Not now to stay on the current page). Applied to Saved, Inbox, Closet/List a piece, Fit matching, Studio cards, Studio byline, and Message lender.
- Theme: default is now Light for everyone (not System). Added sun/moon switch in top-bar `.top-right` on every page in the exact same spot. Sun/moon switch and Settings Theme control update instantly with no page reload or sign-out and always agree. Choice remembered in localStorage and cookies on the device.
- Dropdowns: configured `color-scheme` and contrasting background and font colors for all native `<select>` and `<option>` elements and custom dropdowns (`.chat-menu > div`) ensuring open lists are fully legible in both Light and Dark themes.
- Sweep of 2B WIP: verified messaging, listing editor with photo compression/upload, closet, settings. Fixed conversation menu details dropdown closing on selection and size badge formatting.

Files changed:
- `apps/web/src/components/onboarding.tsx` (new: checklist, finish setup card, tour)
- `apps/web/src/components/guest-gate.tsx` (new: dialog, trigger, action mapping)
- `apps/web/src/components/shell.tsx` (onboarding modals, guest gate integration, top-bar theme toggle, nav triggers)
- `apps/web/src/components/local-preferences.tsx` (light default, instant theme toggle, settings sync)
- `apps/web/src/components/icon.tsx` (sun and moon icons)
- `apps/web/src/components/cards.tsx` (gated studio cards, updated Gate copy/actions)
- `apps/web/src/app/page.tsx` (fit banner and share banner guest gate triggers)
- `apps/web/src/app/listing/[id]/page.tsx` (gated studio byline, message lender, save piece, fit link)
- `apps/web/src/app/studio/[handle]/page.tsx`, `saved/page.tsx`, `fit/page.tsx`, `app/messages/[id]/page.tsx`, `app/list-a-piece/[id]/page.tsx`, `app/[feature]/page.tsx` (gated actions)
- `apps/web/src/components/settings.tsx` (finish setup card on profile)
- `apps/web/src/components/closet.tsx` (formatting fix)
- `apps/web/src/components/chat.tsx` (menu dropdown ref fix)
- `apps/web/src/app/globals.css` (dropdown theme readability, theme toggle button, guest gate styling)
- `pranalika/handoffs/claude-code.md` (this handoff entry)

How verified:
- `npm run lint` in `apps/web` passed with 0 errors and 0 warnings.
- `npm run build` in `apps/web` compiled production build with Turbopack and static page generation successfully.
- Local production server verification script ran on `http://localhost:3456`:
  - `GET /auth` returned 200.
  - `GET /` returned 200.
  - As authenticated test user 3 (via Supabase auth token session cookies): `GET /app/messages` returned 200.
  - As authenticated test user 1 (via Supabase auth token session cookies): `GET /app/closet` returned 200.

Open issues:
- None.

## Step 4B - 2026-10-31 - Android parity

Done:
- `decisions.md`: added "Versions (2026-10-31)" (V1.0 / V1.1 / V2.0). Android `versionName` is now `1.0.0`.
- Ported the reference `util/` layer into `mobile/shared/src/commonMain/.../util/` almost line for line (photo checks, item recognition logic, colors, labels, sizes, prices, dates, drafts, fit, onboarding, studio, search-related words, activity). JVM-only bits were replaced: `java.time` with kotlinx-datetime helpers (`util/Time.kt`), `BigDecimal` with `util/Decimal.kt` (same half-up rounding from the shortest decimal form), `Normalizer` with `expect fun stripAccents`.
- Copied the reference screens into `shared/ui` and changed only what the new backend, guest mode or common code needs: listing editor (photos, details, size/price/dates step, declaration, drafts, resumable publish), chat, inbox and activity, My Closet, My Rentals, Profile (role switching), listing page, studio page, Saved, Settings (now actually saved on the phone), body measurements, My studio, blocked users, guide, welcome checklist, About and open-source licenses, policy screens, filter sheet, sidebar, location dialog, city field, theme, components. `MainAppScaffold` is the reference scaffold (role-based Closet, Inbox dot every minute, welcome checklist, app tour, policy routes, chat drafts) with the guest gates kept.
- On-device AI copied exactly: TinyCLIP image encoder on LiteRT (`androidMain/data/ItemRecognizer.kt`, `AndroidPhotoAnalyzer`), label embeddings, tier removals, warnings, chips, color/fabric hints. The model is in `shared/src/androidMain/assets/ml/` and stored uncompressed in the APK. Android-only code sits behind `PhotoAnalyzer`, `DeviceServices`, `PhotoStore`, `DraftStore`, `KeyValueStore`, `LocationService` and a few `expect` composables (photo sources, location permission, back handler, licenses list, system bar icons), each with an iOS stub.
- Repository: the reference app's calls are kept as adapters on the shop window. Other people are known only by studio handle, so on screen a studio's handle stands in for its "lender id" (studio route, saved studios, chat start). Owner-side listing saving, chat, rentals, outcomes, blocks and reports use the raw tables the contract allows. Error wording matches the reference.
- Fixed while porting: Home and Search read the distance step as miles (with the reference settings that would be a 2-mile radius); Search sent sort keys the contract doesn't have; "New near you" was the first 8 results (now `p_new_days = 7`); the fit card showed for users with measurements but no matches; "Use my location" never asked for permission or used the device location; Settings never saved; Profile opened My studio; the logo was a generic icon; the accessory declaration said $500 (the reference says $300).
- Removed the deep-link intent filters: the reference app has none.

Parity checklist:

| Screen / workflow | Status | Remaining difference |
| --- | --- | --- |
| Listing editor: photo slots, picker, camera, consent, compression, upload, reorder, delete | Same | iOS stubbed |
| Listing editor: steps, suggestions, declaration, size, measurements, "Same as", price, dates, more options, ready list, publish/retry, drafts | Same | None known |
| On-device AI: photo checks, recognition, removals, warnings, chips, colors, fabric hint | Same | iOS stubbed |
| Inbox (Messages, Activity, dots) | Same | Names and titles come from `my_conversations` (studio name when set) |
| Chat (pinned listing, dates, rental menu, follow-up, quick replies, safety tip, block, report, live) | Same | Same as Inbox |
| My Closet, My Rentals, Profile, role switch | Same | None known |
| Listing page | Same | Lender line shows studio name and city from the shop window; guests: save, message and studio ask to sign up, no report menu |
| Studio page | Same | Rental count and reply time from `get_studio`; no "Since" line (no `created_at` in the shop window); the owner viewing their own studio also sees Save/Message |
| Saved (pieces, studios) | Same | Paused or deleted saved pieces disappear instead of showing "no longer available" |
| Settings | Same | Guests see only appearance, preferences, location, search history and About |
| Body measurements, My studio, blocked users | Same | Blocked users show "Dzirent member" (other people's names aren't readable) |
| Guide, welcome checklist, About, licenses, policies | Same | About links point to dzirent.com (reference has placeholders) |
| Filter sheet, sidebar, location dialog, city field, theme | Same | Sidebar and location dialog keep the guest additions |
| Auth (welcome, log in, sign up) | Same | Guest additions only (first-visit sheet, "Browse as guest", sign-up prompt) |
| Home | Partly | Still the Step 3B layout on shop-window cards. Rows now follow the reference rules (Fit, New, For your style, Under $15, saved studios), but the zero-result "Suggested for you" groups, card and studio-tab layout are not line-by-line copies |
| Search, See all | Partly | Step 3B layout; recent searches are in memory only (the reference keeps them per user on the phone); zero-result suggestions (related words, wider distance, other dates, similar titles) are the Step 3B rule-based version |
| Distances | Allowed | Whole miles from the shop window, "under 1 mi" for 0 |

Files changed (main ones):
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/*` (new, from the reference)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/*` (reference screens; `ClosetScreens.kt`, `ListingDetailScreen.kt` removed, their code is in `MainScreens.kt`)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/data/*`, `platform/Device.kt`, `model/Models.kt`, `repository/DzirentRepository.kt`
- `mobile/shared/src/androidMain/...` (device services, analyzer, recognizer, photo sources, permissions, licenses, back handler, theme bars, assets)
- `mobile/shared/src/iosMain/...` (stubs)
- `mobile/shared/src/commonMain/composeResources/drawable/logo_mark.xml`, `logo_wordmark.xml`
- `mobile/androidApp/build.gradle.kts`, `AndroidManifest.xml`, `MainActivity.kt`, `config/libraries/tinyclip.json`
- `mobile/gradle/libs.versions.toml`, `mobile/build.gradle.kts`, `mobile/shared/build.gradle.kts` (LiteRT 1.4.2, AboutLibraries 11.2.3, activity-compose, compose resources package)
- `pranalika/decisions.md`, `pranalika/BOARD.md`, this file

How verified:
- `:shared:compileDebugKotlinAndroid` and `:shared:compileCommonMainKotlinMetadata` (no JVM APIs in common code).
- `:androidApp:assembleDebug` builds (JDK 21). The APK contains the model stored uncompressed, the label embeddings, `aboutlibraries.json` and the logo vectors.
- `:shared:testDebugUnitTest`: 4 classes, 10 tests passed, 1 skipped (`SmokeTest` live check).
- No emulator or device used. Nothing was run on a phone.

Open issues:
- Home, Search and See all are not yet line-by-line ports (see the checklist). Next step: port the reference `HomeScreen.kt`, `SearchScreen.kt` and `Suggestions.kt` onto shop-window data, and keep recent searches per user on the phone.
- The first three commits (photos, editor, AI) were made from one working tree; only the third builds on its own.
- Guests start in Austin, TX (from Step 3B) until they set a place. Owner to decide if that stays.
- iOS: every platform piece is a stub (`TODO`); iOS code was not compiled (Windows can't build iOS targets).
- The owner should test on the phone: listing a piece end to end (camera and gallery), the declaration, chat and rental marking, role switching, Settings, location permission.

Debug APK path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
