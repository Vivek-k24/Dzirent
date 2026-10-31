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

