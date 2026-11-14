# Locked decisions

Agents do not reopen these. Raise disagreements under **Requests** in your handoff.

## Platform (2026-10-30)

- One repo, `Dzirent`, holds the website, Android, iOS, shared code and backend.
- `dzirent-server` becomes the production database. The `Dzirent_Android` repo and Supabase project are reference only and are retired after all three clients work. Existing users are test users and are not migrated.
- Workflows and product rules: the Android reference is the source of truth unless a decision here overrides it. Rebuild cleanly; do not copy its flaws.
- Backend is a modular monolith on Supabase. Business rules live in the database (rules, constraints, functions), not in the apps, so all three clients behave the same. Edge Functions handle server-side jobs. AI features come later as separate container services. Apps never call paid AI or LLM services.

## Branches and deploys (2026-10-30)

- Two branches only: `main` (production, dzirent.com) and `Preview` (dzirent.vercel.app, visible only to the owner).
- All work happens on `Preview`. The owner merges `Preview` into `main` by PR, only for finished features.
- Vercel builds only `main` and `Preview`. Root Directory `apps/web`. Functions run in Portland, next to `dzirent-server` (us-west-2).

## Repo layout (2026-10-30)

- `supabase/` backend: migrations, functions, seed, tests, `reference/` snapshot.
- `apps/web/` website.
- `mobile/shared/`, `mobile/androidApp/`, `mobile/iosApp/` Kotlin Multiplatform.
- `pranalika/` coordination.
- Root `README.md`: features and workflows only. No setup steps, no plans.

## Guest browsing and data access (2026-10-30)

- Raw tables are readable and writable only by their owners. Guests have no access to any raw table.
- Everyone else reads through a small set of read-only database functions (the shop window) that return only safe fields. All three clients use the same functions.
- Guests see: home rows, search, filters, listing page with all photos, garment measurements, availability, price, deposit note, city, distance, studio name and handle.
- Sign-up is asked only when a guest tries to save, message, open a studio page, add a listing or use fit matching. The fit row shows guests one card inviting them to add measurements.
- Never returned to anyone but the owner: coordinates (the database returns distance only), account IDs of other users (handle instead), personal measurements, messages, rentals, saved items, blocks, reports, declarations, paused listings.
- Studio pages (bio, style tags, pickup area, rental count, reply time) are for signed-in users only.
- Profile rows are readable only by their owner. Public profile information comes only through the shop window.
- Blocked pairs never see each other's listings or studios.
- Every shop window request returns a capped page (about 30 results).
- Photo bucket stays public for speed. Photo paths never contain user IDs. Deleting a listing deletes its photos.
- Guests have no account at all. Supabase anonymous sign-in is not used.

## Security (2026-10-30)

- Every database function has a fixed search path. Functions that run with elevated rights are used only where needed, check the caller, and are not callable by guests unless they are part of the shop window.
- Internal helper and trigger functions are not callable through the API.
- Leaked-password protection is on.
- `delete-account` verifies the user in its own code.
- Every Security Advisor warning is fixed or logged in `security-log.md` with a reason. Never silently dismissed.

## Secrets (2026-10-30)

- Code reads environment variables only. Values live in GitHub secrets (Actions), Vercel environment variables (website), and `H:\DziRent\secrets\` (local agents).
- Agents never create users or passwords. The owner creates test users.

## Agent work (2026-10-30)

- Every prompt has two phases: Phase 1 writes, changes or deletes code. Phase 2 tests what Phase 1 changed.
- No emulators, simulators or devices. Builds and unit tests only.
- Keep tests minimal and token use low.
- Coordination lives in `pranalika/`. No JIRA.

## Step 3A (2026-10-31)

- Chat participants can see each other's account IDs in chat rows. Accepted: every table is owner-only, so an ID grants no access.
- The Android app keeps applicationId com.dzirent.app so the new app updates the existing Play testing app.

## Task assignment (2026-10-31)

- The owner assigns each step to one agent. There is no permanent folder ownership; each prompt lists the folders the agent may change.
- Each agent writes only in its own handoff file, with entries titled by step number.
- Agents read the root `README.md` (product features and rules) only for feature or screen work.

## Versions (2026-10-31)

- V1.0: the reference app's features exactly, nothing new.
- V1.1: multiple availability date ranges per listing, notifications.
- V2.0: one-time ID verification, before the public launch.

## Website UI (2026-11-03)

- The website and the apps may differ in UI. Features and workflows stay the same.

## Notifications (2026-11-03)

- All push notifications go through Firebase Cloud Messaging (Firebase project `dzirent-17c88`). The database decides when one is due and the `send-push` Edge Function delivers it. Apps never send pushes.
- Lock screens show no message text unless the user turns on "Show message text" in Settings > Notifications (off by default).
- Rental reminders wait for a decision on a "confirm rental" step.

## Photo scanning (2026-11-05)

- Photo checks run on the server: the open-source model Marqo-FashionSigLIP (Apache 2.0) on Cloud Run (CPU only), called only by the `scan-listing` Edge Function. Apps never call the model.
- When the check is unsure, the listing goes to review, never allowed.
- Photo quality never rejects a listing; it only adds warnings to that photo.
- Feature flags start off: `vision_required`, `verification_required`, `payments_enabled`. They change only through migrations.

## Photo policy (2026-11-05)

- Hoodies and sweatshirts are not allowed (everyday basics).
- Lingerie, underwear and swimwear stay not allowed.
- Costume jewelry (necklaces, earrings, bracelets, rings, brooches) is allowed, with the accessory declaration.
- A copied photo of a banned item stays rejected: a photo matching another listing sends the listing to review, but never turns a rejection into a review.
- Changed photos are checked again: any change to the photos of an active listing queues a new check on the server, and the listing stays active while it runs. While `vision_required` is on, a result that isn't allowed pauses the listing with a plain reason (`listings.auto_paused_reason`), cleared when the owner republishes. While the flag is off, photos are re-checked only, never paused.

## Listing rules (2026-11-06)

- Photos of the item being worn are allowed: hanger, mannequin, flat-lay or worn are all fine. If you appear in a photo, it is public like every listing photo. Do not include other people without their permission. Keep no text, prices, phone numbers, social handles or watermarks on photos.
- Counterfeits and replicas, and damaged or dirty items, are prohibited. Keep them in the prohibited list.
- The category name is "Everyday" exactly as in the app. Remove "Everyday Special Pieces" and any other renamed category; every category name must match the app.

## Content safety (2026-11-07)

- The text filter lives in the database, so the website, Android and iPhone get the same rules. It matches whole words only, after normalizing case, accents, repeated letters and common character swaps; a listed word inside another word ("cocktail") never matches. The word list is LDNOOBW English (CC BY 4.0), with a small allowlist for words that are ordinary on a clothing marketplace.
- Language that isn't allowed (slurs, hate terms, sexually explicit terms) is refused everywhere people write: listing title, description, price and deposit notes; display name, studio name, handle, bio and pickup area; chat messages; report reason and details.
- Contact details and outside links (phone numbers, email addresses, URLs, @handles) are refused in public text only (listings and profiles). Chat allows them.
- Refusals say why in plain words without repeating the word: "This text includes language that isn't allowed on Dzirent." or "Please remove contact details from your listing; people can message you in Dzirent." (profile: "…from your profile…"). Existing rows are not changed.
- Photos: clear nudity or sexual content is rejected ("This photo isn't allowed on Dzirent."); uncertain goes to review. The safety model is open source with a permissive license (Marqo/nsfw-image-detection-384, Apache 2.0), built into the vision service.
- A photo the model reads as a hooded garment goes to review instead of allowed (a rejection stays a rejection).
- A piece being worn is never penalized: it never adds a warning and never changes the verdict.

## Admin (2026-11-07)

- Admin tools require two-step sign-in: an admin is an account in `admin_users` signed in with Supabase MFA (TOTP, `aal2`). Every admin function checks both first and refuses otherwise. Admins are added and removed only through `ADMIN_EMAILS` and the seed script.
- Every admin action, reads included, is written to an append-only admin log that nobody can change or delete.
- Every report saves an evidence snapshot when it is made (a message with up to 5 messages before and after it, a listing, or a profile). The snapshot never changes. Reports and their evidence survive either person's account deletion for a retention period (a placeholder of 2 years until the attorney sets it).
- Report details are not filtered, so people can quote abuse; everything else stays filtered. This replaces "report reason and details" in "Content safety" for details only.
- Feature flags are switched by admins (`set_flag`, logged), no longer only by migrations. This replaces "They change only through migrations" in "Photo scanning (2026-11-05)".
- A suspended account can't publish, message, start chats or report, and its listings leave the shop window until the suspension ends. A ban is an Auth ban plus an open-ended suspension.

## Age gate (2026-11-07)

- Dzirent never asks for or stores a birthdate. An age check stores only the source (`store_signal` or `self_declared`), the result (`adult`, `minor`, `unknown`), the platform and the time, in `age_checks`, written only by `record_age_check`.
- Android asks Google Play Age Signals (`com.google.android.play:age-signals` 0.0.4) on every sign-in and once a day when the app opens. A range under 18 records `minor`; 18 or older records `adult`; no applicable signal records `self_declared` (the 18+ confirmation at sign-up stands). The app never shows Play's own age-sharing prompt.
- iPhone: a stub that behaves like "no applicable signal" until Apple's Declared Age Range is wired up in the Mac session.
- The website records the 18+ tick at sign-up as `self_declared`.
- A store's `minor` blocks the account. Only a later store `adult` lifts it; a self-declared `adult` never does, and `unknown` changes nothing.
- A blocked account can only read its own data and delete itself: every write by that user is refused with "Dzirent is only for people 18 and older." Its active listings are paused when the block starts and stay paused after it ends until the owner republishes them.
- Admins see the latest age check and the block in user lookup.
- `preview_label` (`app_settings`, default on) shows "Preview only" in red in the website header; admins switch it on the Flags page.

## Security (2026-11-10)

- The current Terms of Use and Privacy Policy are enforced in the database: publishing a listing, starting a chat, sending a message, saving a piece or studio, and filing a report are refused until the person has accepted the current versions. Reading stays allowed.
- Rate limits live in the database, in the closed settings table: messages 30 a minute, new chats 30 a day, reports 20 a day, new listings 20 a day, photo checks 30 an hour per person.
- Listing photo uploads: JPEG, PNG or WebP only, up to 10 MB, only at `{listing_id}/{random}.jpg` for a listing the uploader owns.
- People are signed out after 30 days without using Dzirent (Supabase Auth inactivity timeout).
- Admins enter a fresh two-step code when their last one is more than 24 hours old.
- On the phones the sign-in session is kept in encrypted storage: the Android Keystore and the iPhone Keychain, never plain app storage.

## Chat (2026-11-10)

- Chat messages are not filtered: no language check and no logging. People report, block or ignore. This replaces "chat messages" in "Content safety (2026-11-07)"; listings, profiles and studio fields keep the filter.

## Price (2026-11-11)

- A listing's price is its price for one day (`listings.price_usd`, `price_unit` = `per_day`, the only unit for now). Cards show "$X/day · distance"; the listing page shows "$X/day" and, with dates chosen, "<n> days · $total". Editors label the field "Price per day".
- Days count both the first and the last day (Nov 5 - Nov 8 is 4 days). The total is price per day times days; the database returns both (`browse_listings`, `get_listing`).

## Errors and retries (2026-11-11)

- Every error and warning people can see has a code from one catalog, `contracts/error-codes.json` (`DZ-E####` errors, `DZ-W####` warnings, families 1xxx account to 9xxx system). Kotlin, the website and the Edge Functions use code generated from it; the generated files are committed and a check fails when they are out of date.
- The database starts every refusal with its code and keeps its words; the field goes in the HINT. Edge Functions answer `{ code, message }` with the catalog's status. Clients show the catalog's words with the code in brackets, else the server's words, else `DZ-E9999` "Something went wrong. Please try again.".
- Background calls to `send-push` and `scan-listing` go through an outbox (`app_private.async_jobs`): retried after 1, 5, 30 and 120 minutes, dead after 5 attempts. A photo check whose job dies ends as review. Admins see dead jobs and can retry one (logged).
- Clients retry reads only (2 retries, 0.5 s then 2 s), never writes.

## Rentals (2026-11-13)

- A rental is requested, answered and tracked in the app: the renter requests dates in the chat ("Request to rent"), the lender accepts or declines within 48 hours (no answer means expired), the lender marks it picked up and returned. States: requested, accepted, declined, expired, awaiting_payment, paid, picked_up, returned, completed, cancelled, claimed, disputed. awaiting_payment, paid, claimed and disputed are used only while payments_enabled is on; while it is off, accept goes straight to accepted and returned straight to completed.
- Rentals change only through database functions that check who may act and from which state; apps can't insert or update rentals. Every change is recorded with who made it, when, and the note given.
- The price per day, days and total are fixed when the rental is requested (USD).
- A request must fall inside the listing's availability (a listing with no availability windows can't be rented). One listing can't be booked twice for the same day; days count both ends, so a rental may start the day after another ends.
- The renter cancels a request; before pickup either person can cancel; after pickup the rental can only be returned.
- Blocking stops new requests, answers and pickups between the two people; cancelling and returning stay possible so a block never leaves a rental stuck.
- At pickup and at return the lender adds at least 2 photos of the piece; the renter may add theirs. Condition photos are private to the two people and to admins handling a report, and are kept for a period the attorney sets (placeholder 1 year after the rental ends).
- Rental reminders: the day before a pickup or return and once a day for up to 3 days when a return is overdue, at 9 AM Austin time, to both people. A "Rental reminders" switch (on by default) turns them off; requests, answers and completion follow the Messages switch. This replaces "Rental reminders wait for a decision on a 'confirm rental' step" in "Notifications (2026-11-03)": accepting a request is that step.
- Account deletion waits while a rental is in progress (from accepted until completed or cancelled); a request alone doesn't block it.
- A studio's rental count counts completed rentals.
## Rentals follow-ups (2026-11-13)

- A rental that is accepted (or paid) but not marked picked up within 2 days after its start date is cancelled automatically, with a timeline event, the cancellation refund rule (counted as a late cancellation by the renter) and a "rental cancelled" push to both people. The number of days is a setting.
- A listing with no availability windows is always available: any dates from today can be requested, and date searches include it. Windows the lender adds still limit the dates. This replaces "a listing with no availability windows can't be rented" in "Rentals (2026-11-13)".
- New pushes: "rental cancelled" to the other person (to both when Dzirent cancels) and "request expired" to both. This replaces "Cancelling, declining-by-expiry and pickup send no push" from C3 for cancelling and expiry; pickup still sends none.
- Admins can end a stuck rental (for example when the lender is banned) as cancelled, or as completed once it was picked up, with a reason, two-step sign-in and a log entry. With a payment, the admin chooses the refund and what happens to a deposit hold.

## Payments (2026-11-13)

- Payments use Stripe Connect as designed in `architecture.md` Appendix A: lenders get Express accounts; each rental is one destination charge to the lender's account with Dzirent's fee as `application_fee_amount`; the deposit is a separate manual-capture hold on the same card, placed at pickup. Dzirent never stores card numbers or bank details.
- Payments stay switched off (`payments_enabled`) until the real keys are set and the C5 screens ship. While it is off, or any of the three keys is blank, every payment function answers "Payments aren't available yet." and rentals work as before.
- With payments on: accepting waits for payment; a succeeded payment makes the rental paid; pickup needs the deposit hold when the listing has a deposit; a return opens the claim window; with no claim by its end the hold is released and the rental completes; an accepted claim captures up to the claimed amount; a disputed claim waits for an admin's decision. A rental without a deposit completes at return.
- A claim is the lender's, during the window, for up to the deposit, with a reason and at least one return photo. The renter accepts or disputes; admins decide disputed (or unanswered) claims for 0 up to the claimed amount.
- Cancellation refunds: a renter cancelling at least 48 hours before the start date gets a full refund; after that the lender keeps the rental price; a lender cancellation always refunds in full. The cut-off and the late refund share are settings.
- The pilot fee is 0%, the claim window 48 hours, sales tax off (a hook that adds $0 until the tax adviser decides). Each is a setting marked for the business owner or the attorney in `legal-placeholders.md`.
- Card holds last about 7 days: a hold that would end while the piece is still out is replaced by a new one, and both people are told. A claim after a hold has ended is charged to the saved card instead, never above the deposit.
- Every money step runs on the server through the outbox, with an idempotency key; Stripe's webhooks are verified on the raw body and processed once.

## Settings (2026-11-13)

- Every business number and rule lives in the closed settings table, never in code or env files: fee, claim window, refund cut-off, automatic cancel, request expiry, rate limits, retention periods, reminder hour and time zone. Each has a type, unit, range, plain description and who decides it (owner, business owner or attorney); a value outside its range is refused.
- Admins change settings on the admin website with a reason; every change is logged. Settings the legal pages state are marked, and the website warns that the pages may need updating. Changing the reminder hour reschedules the reminders.
- The admin website shows, for each outside service, only "configured" or "not configured". It never shows, accepts or stores a secret.
- Technical constants stay in code: the outbox retry schedule, the 24-hour freshness of an admin's two-step code, the photo-check timeout and job cadences.
