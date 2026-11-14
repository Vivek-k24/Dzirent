# Testing

How Dzirent is tested, how an agent runs each suite on this PC, and what CI runs on every pull request. Added in C2.

## The rule

**Integration and load tests never touch the live project (`dzirent-server`).**
- They run against the local backend (Docker) by default, and in CI.
- `--live` (or `DZIRENT_TEST_TARGET=live`) points the integration scripts at `dzirent-server`. It prints a warning, needs `H:\DziRent\secrets\`, and writes to the live test users' data. Use it only when a prompt asks for a live check.
- Load tests never run live.
- Read-only checks of the live project (`supabase db query --linked` selects, the Advisors) are still fine.

## Suites

| Suite | Covers | Where | Run locally | CI job |
| --- | --- | --- | --- | --- |
| Error-code and code-reference freshness | Generated Kotlin, website and Edge Function copies match `contracts/error-codes.json`; C5: `pranalika/code-reference.md` matches the source (`tools/gen-code-reference.py --check`, run by `generate.mjs --check`; needs Python and git, skipped with a note on a PC without Python, a failure in CI) | `contracts/generate.mjs`, `tools/gen-code-reference.py` | `node contracts/generate.mjs --check` | `contracts` (and the website's `prelint`) |
| Website | ESLint (jsx-a11y), catalog lookups and fallbacks, read retries, price lines, rental rules (C3: totals, actions per state and role, groups, request dates; C5: no windows = every day from today, the server's request hours, every payment state's actions and labels, payments off shows no payment step, claim limits, the listing deposit, receipt totals, payout states), the admin Settings page's value checks (C4), the email templates (C5: `supabase/functions/_shared/email-templates.test.ts`: every template renders, no message text, claim reason, measurements or places, values escaped, chat links only to dzirent.com), the production build | `apps/web`, `supabase/functions/_shared` | `npm run lint`, `npm test`, `npm run build` (Node 22) | `website` |
| Android / shared Kotlin | Shared unit tests (catalog, freshness, price, retries, models, photo checks, sessions, rental rules (C3; C5: the same cases as the website's) ...) | `mobile/shared/src/*Test` | `./gradlew :shared:testDebugUnitTest` | `android` |
| Vision | Policy sync, verdicts, colours, text, image preprocessing; tests marked `model` need the real weights | `services/vision/tests` | `.venv/Scripts/python -m pytest -m "not model" tests` | `vision` |
| Database (pgTAP) | RLS per role (guest, signed-in, owner, other user, admin without / stale / fresh two-step); shop window never returns coordinates, emails or account ids; every refusal family's DZ code and field hint; rate limits; outbox retry schedule, dead-letter and Retry; report evidence frozen; current terms enforced; age block; cleanup jobs count only; rentals (C3, `10_rentals`: every allowed and refused transition per role, blocked / suspended / age-blocked / no-terms callers, no direct writes, availability, overlap and back-to-back, expiry, bucket rules, reminders once a day and none for blocked pairs, the delete-account check, booked days in the shop window, rental reports, the export, the rate limit; C4, `11_payments`: settings typed and ranged (refused for non-admins, stale sessions and out-of-range values, a valid change logged and in effect, the reminder job rescheduled), no-window listings requestable and in date browsing, the automatic cancel after 2 days, expiry and cancel pushes, `admin_end_rental` (non-admin, stale, fresh), the payment state rules with `payments_enabled` on in the transaction (awaiting payment, paid once per event, pickup needs the hold, the claim window), every claim rule (who, window, amount, photos, once, accept / dispute, admin decision), the cancellation refund rule, admin refunds, webhook events, and that owners can't read other people's payout or customer rows; C5, `12_c5`: the payment deadline setting and its range, `payment_due_at` 24 hours after acceptance, the automatic cancel past it (event by Dzirent, `rental_cancelled` to both, the unpaid PaymentIntent cancelled, a payment in time never cancelled), `rental_settings()` for guests, no-window dates, emails queued with the pushes (request, accepted, declined, receipt, pickup reminder), `email_prepare` holding no messages, measurements or places, `send_email` jobs marked skipped (not failed) when send-email skips them, a finished email never sent twice, the "Email me about rentals" switch (none queued, then skipped when turned off later; the push still goes), the account-deleted email (address cleared when its job dies), the admin views (template only), the export's emails) | `supabase/tests/database/*.test.sql` | `supabase test db supabase/tests/database` | `database` |
| Integration | The phase scripts through the real API and Edge Functions, in order (`supabase/tests/run-all.mjs`): guest REST, Step 1B-8B, P1B, P2A-P2C, P3A, P3B, C1, C3 (`c3_rentals.mjs`, local only: a full rental with photos uploaded through Storage, signed links, delete-account refused, pushes in the stub, plus a decline, a cancel and an expiry; it removes what it made), C4 (local only: `c4_payments_off.mjs` with the Stripe keys blank, `c4_payments.mjs` against stripe-mock, below), C5 (local only: `c5_payments_email.mjs` against stripe-mock with the email key blank: one rental from the request to a decided claim through the real functions, the pushes in the stub and the six emails queued, every email and job skipped by send-email; send-email's secret and input checks; `rental_settings` for guests; onboarding returning to My studio; the email switch; the payment deadline cancel with pushes to both), and `delete-listing` with mocks | `supabase/tests/*.mjs`, `guest_rest.py` | `node supabase/tests/run-all.mjs` | `database` |

Not automated (still by hand): Android Lint and the APK build (`:androidApp:assembleDebug`, run by agents per rule 15), iPhone builds and tests (Mac session), the vision eval (`services/vision/eval`), device tests (the owner), and (C5) Stripe's own payment sheets: they need Stripe test keys, so their end-to-end checks are the rehearsal checklist in `pranalika/stripe-rehearsal.md`.

**C5 email locally:** both env files keep `EMAIL_API_KEY` and `EMAIL_FROM` blank and set `EMAIL_JOB_SECRET=local-email-secret` (the seed puts the same value and `send_email_url` = the locally served `send-email` in the Vault). So every email goes through the outbox to the real function and comes back skipped; no email leaves the PC.

## The local backend

- **Start it:** `supabase start` from the repo root. It runs the whole stack from `supabase/config.toml` in Docker, with every migration applied from scratch and then `supabase/seed.sql`.
  - `supabase status -o env` prints the local URL and keys. These are the built-in defaults, the same on every machine, and not secrets.
- **Start over:** `supabase db reset`. On this PC, `supabase db reset --local` needs approval; `supabase stop --no-backup` followed by `supabase start` does the same.
- **Stop it:** `supabase stop`. Add `--no-backup` to drop its data.
- **RAM (16 GB):** never build Android while the local backend runs. Stop it before any Gradle work.

**Local seed** (`supabase/seed.sql`; local only, because `db push` never seeds):
- **Users:** `test1@dzirent.local` (Studio Rostova, 6 listings), `test2@dzirent.local` (Atelier Maya, 6 listings), `test3@dzirent.local` (Jordan Bell, role both, body measurements with consent), and the admin `admin@dzirent.local`. Passwords are in `supabase/tests/local.env` (throwaway, local only).
  - All four have accepted the current terms.
  - The admin still needs two-step sign-in: TOTP is on locally in `config.toml`, and tests enroll a factor through the Auth API.
- **Listings:** the 12 sample listings, with the same ids and titles as the live sample data, so scripts that name one work. Each has two photo rows, 90 days of availability and measurements.
- **Photo files:** `supabase/tests/lib/local_photos.mjs` uploads the files from `supabase/seed/images/` as each owner (the runner does this).
- **Vault:** the six background-call entries point to local stand-ins.
  - The migrations create these entries with the **live** addresses, so a fresh local database would otherwise call production. The seed always overwrites all six.

**Stubs** (`supabase/tests/stubs/server.mjs`): a small Node server in the container `dzirent-stubs`, on the local Supabase network.
- **Start or stop it:** `node supabase/tests/stubs/run.mjs start|stop`.
- `POST /push` stands in for `send-push` and Firebase. It checks the secret and the required fields like `send-push`, then records what it would send.
- `POST /scan` stands in for `scan-listing` and the vision service. It starts the check, answers by photo file name (`reject` → rejected, `review` → review, anything else → allowed, with a fixed suggestion), and saves the result.
- `GET /log` shows what was recorded; `DELETE /log` clears it.

**Payments (C4): stripe-mock, never Stripe.**
- **stripe-mock** is the official `stripe/stripe-mock` image, pinned by digest (0.206.0, in `supabase/tests/stubs/run.mjs` and `ci.yml`). It checks every request against Stripe's API definition and answers with fixtures; it keeps no state (statuses stay `requires_payment_method`, metadata isn't echoed).
- **Locally** `run.mjs start` runs it as the container `dzirent-stripe-mock` on the local Supabase network; **in CI** it is a service container joined to that network under the same name (`DZIRENT_STRIPE_MOCK=external`).
- **The stub server's `/stripe/...`** passes each call to stripe-mock and records method, path, idempotency key and form fields (never headers); `GET /log` shows them under `stripe`. Like Stripe, a repeated POST with the same idempotency key gets the first answer back.
- **Keys:** `local.env` keeps the three Stripe keys blank (every payment function answers `DZ-E4030`). `supabase/functions/local.stripe-mock.env` has placeholders only stripe-mock accepts (`sk_test_stripemock`, `pk_test_stripemock`), the local webhook test secret `whsec_local_test_secret`, and `STRIPE_API_BASE` pointing at the stub. No Stripe key exists anywhere.
- **The runner** serves the functions itself with a known env file and restarts them for a script that asks for another (`functionsEnv` in `run-all.mjs`): `c4_payments_off` runs with `local.env`, `c4_payments` with the stripe-mock file.
- **State changes** come from signed test events (`supabase/tests/lib/c4.mjs` `signedEvent`), as real Stripe's do: payment succeeded, hold capturable, refunded, account updated.
- **What the scripts check:** with the keys blank (flag on and off) every payment function answers "Payments aren't available yet."; the Integrations check says payments "not configured" and holds no secret; the flag off with keys set also answers `DZ-E4030`; onboarding (one account however often asked, a link each time), payment (destination, fee, saved for off-session, one PaymentIntent however often asked), webhooks (unsigned, wrong secret and stale refused; a repeat processed once), the hold (manual capture, off-session; pickup refused without it), a claim (refusals, accepted, captured through the outbox, a retried step makes no second Stripe call), release when the claim window ends, a full refund on an early cancel.
- **This PC:** Windows sometimes reserves 54243-54342 (WinNAT), which blocks the default local ports. Then start the stack with the CLI's `SUPABASE_API_PORT`, `SUPABASE_DB_PORT`, `SUPABASE_DB_SHADOW_PORT`, `SUPABASE_DB_POOLER_PORT`, `SUPABASE_STUDIO_PORT`, `SUPABASE_LOCAL_SMTP_PORT`, `SUPABASE_ANALYTICS_PORT` set to free ports (55xxx) in the same shell; every script reads the URL from `supabase status`. Run the integration scripts with Node 22 (`.tools`); `delete_listing.test.mjs` needs it.

**Edge Functions:**
- **Run them:** `supabase functions serve --env-file supabase/functions/local.env`. The file holds non-secret local values only.
- **What's local:** the user-facing functions run for real against the local stack, and `cleanup-files` is reached from the local Vault.
- **Not tested locally:** the Google and Firebase calls inside `send-push` and `scan-listing`. Their addresses are fixed in the code, so those parts are covered by the stubs.

## How an agent runs everything

```
supabase start
supabase test db supabase/tests/database          # pgTAP
node supabase/tests/run-all.mjs                   # stubs + functions serve + every integration script
supabase stop                                     # before any Gradle work
cd mobile && ./gradlew :shared:testDebugUnitTest  # JDK 21, SUPABASE_URL/KEY set (local values are fine)
cd apps/web && npm test && npm run lint && npm run build
cd services/vision && .venv/Scripts/python -m pytest -m "not model" tests
```

**Runner options** (`run-all.mjs`):
- `--only=step1b,p2b` runs some of the scripts.
- `--keep` leaves the stubs and functions running.
- `--live` targets the live project (see the rule).

**Writing tests:**
- **pgTAP:** wrap each file in `begin; ... rollback;`. Switch roles with `set local role` and `set_config('request.jwt.claims', ..., true)`.
  - A temp table made as `postgres` needs `grant select ... to authenticated` before a test reads it under that role.
  - The claims stay set after `reset role`, so clear them for a "server" write.
- **Integration scripts:** import everything from `supabase/tests/lib/config.mjs`.
  - Don't depend on another script's leftovers.
  - Expect the local seed, not live data.

## CI (`.github/workflows/ci.yml`)

**When it runs:** on pull requests to `Preview` and `main`, on pushes to `Preview`, and by hand.

| Job | What it runs |
| --- | --- |
| `contracts` | the freshness check |
| `website` | `npm ci`, lint, test, build |
| `android` | `:shared:testDebugUnitTest`, with a generated placeholder `google-services.json` |
| `vision` | the pinned packages, then pytest without the `model` tests |
| `database` | stripe-mock as a service container (C4); `supabase start` (Studio and the log stack left out), `supabase db reset`, stripe-mock joined to the local network, pgTAP, the integration runner, `supabase stop` |

CI uses only the local stack's default keys and placeholder values: no production secret, no repository secret.
