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
| Error-code freshness | Generated Kotlin, website and Edge Function copies match `contracts/error-codes.json` | `contracts/generate.mjs` | `node contracts/generate.mjs --check` | `contracts` |
| Website | ESLint (jsx-a11y), catalog lookups and fallbacks, read retries, price lines, the production build | `apps/web` | `npm run lint`, `npm test`, `npm run build` (Node 22) | `website` |
| Android / shared Kotlin | Shared unit tests (catalog, freshness, price, retries, models, photo checks, sessions ...) | `mobile/shared/src/*Test` | `./gradlew :shared:testDebugUnitTest` | `android` |
| Vision | Policy sync, verdicts, colours, text, image preprocessing; tests marked `model` need the real weights | `services/vision/tests` | `.venv/Scripts/python -m pytest -m "not model" tests` | `vision` |
| Database (pgTAP) | RLS per role (guest, signed-in, owner, other user, admin without / stale / fresh two-step); shop window never returns coordinates, emails or account ids; every refusal family's DZ code and field hint; rate limits; outbox retry schedule, dead-letter and Retry; report evidence frozen; current terms enforced; age block; cleanup jobs count only | `supabase/tests/database/*.test.sql` | `supabase test db supabase/tests/database` | `database` |
| Integration | The phase scripts through the real API and Edge Functions, in order (`supabase/tests/run-all.mjs`): guest REST, Step 1B-8B, P1B, P2A-P2C, P3A, P3B, C1, and `delete-listing` with mocks | `supabase/tests/*.mjs`, `guest_rest.py` | `node supabase/tests/run-all.mjs` | `database` |

Not automated (still by hand): Android Lint and the APK build (`:androidApp:assembleDebug`, run by agents per rule 15), iPhone builds and tests (Mac session), the vision eval (`services/vision/eval`), and device tests (the owner).

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
| `database` | `supabase start` (Studio and the log stack left out), `supabase db reset`, pgTAP, the integration runner, `supabase stop` |

CI uses only the local stack's default keys and placeholder values: no production secret, no repository secret.
