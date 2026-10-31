# Board

Status: `To do` / `Doing` / `Done`. The owner assigns each step to an agent. The agent that finishes an item updates its status and notes who did it.

## Step 0 - Provisions (Owner)

| Item | Status |
| --- | --- |
| Vercel: build only `main` and `Preview` (`ignoreCommand`) | Done |
| Vercel: Root Directory `apps/web`, production branch `main` | Done |
| Vercel: `dzirent.vercel.app` assigned to `Preview` | Done |
| Vercel: function region Portland | Done |
| GitHub: ruleset on `main` (PR required, no force push) | Done |
| `dzirent-server`: leaked-password protection on | Done |
| `H:\DziRent\secrets\dzirent-server.env` created | Done |
| Supabase CLI access token in `dzirent-server.env` | Done |
| Test users created in `dzirent-server` and listed in `test-user.env` | Done |

## Step 1 - Backend foundation

| Item | Status |
| --- | --- |
| Done by: Codex (1A), Antigravity (1B) | |
| 1.1 Read-only snapshot of `Dzirent_Android` project (schema, rules, functions, triggers, bucket, `delete-account` source, `us_cities` data) into `supabase/reference/` | Done |
| 1.2 Clean migrations for `dzirent-server`: same tables and workflows, security fixes, owner-only access | Done |
| 1.3 Seed: `us_cities` (32,363 rows) | Done |
| 1.3b Seed: sample listings owned by test users | Done |
| 1.4 `delete-listing` function (removes photos, then listing) | Done, deployed |
| 1.4b `delete-account` function with in-code user check | Done, deployed |
| 1.4c Shop window functions (browse, search, listing detail, studio, fit) | Done |
| 1.5 Minimal tests: owner CRUD, guest read-only, user A cannot touch user B | Done |
| 1.6 Security Advisor clean or every warning logged | Done |
| 1.7 `contract.md` written | Done |

## Step 2 - Website foundation

Planned after Step 1. Environment wiring, guest mode, home, search, listing page, sign-up gates.

## Step 3 - Shared mobile code

| Item | Status |
| --- | --- |
| 3A Backend moderation RPCs (`block_user`, `unblock_user`, `report_user`) | Done |
| 3A KMP shared module setup (`mobile/shared`, Android + iOS targets, catalog) | Done |
| 3A Common models ported (`commonMain`) | Done |
| 3A `DzirentRepository` rewritten against contract | Done |
| 3A Phone-only interfaces (`commonMain`) + Android implementations + iOS compiling stubs | Done |
| 3A Unit & smoke tests passing | Done |
| Done by: Antigravity (3A, 3B-1, 3B-2) | |
| 3B-1 Shell, theme, components, welcome and sign-in, guest mode, location, home, search, filters, sidebar, listing page | Done |
| 3B-2 All remaining screens | Done |

## Step 4 - Android on shared code

Planned after Step 3.

## Step 5 - iOS

Planned after Step 4.

## Step 6 - Switchover

All three clients build and pass owner testing on `dzirent-server`. Then the `Dzirent_Android` repo and project are retired.
