# Board

Status: `To do` / `Doing` / `Done`. Only the coordinator moves items. Agents report progress in their handoff files.

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
| Supabase CLI access token in `dzirent-server.env` | Check before Step 1B |
| Test users created in `dzirent-server` and listed in `test-user.env` | To do (next) |

## Step 1 - Backend foundation (Codex)

| Item | Status |
| --- | --- |
| 1.1 Read-only snapshot of `Dzirent_Android` project (schema, rules, functions, triggers, bucket, `delete-account` source, `us_cities` data) into `supabase/reference/` | Done |
| 1.2 Clean migrations for `dzirent-server`: same tables and workflows, security fixes, owner-only access | Done |
| 1.3 Seed: `us_cities` (32,363 rows) | Done |
| 1.3b Seed: sample listings owned by test users | To do (1B) |
| 1.4 `delete-listing` function (removes photos, then listing) | Done, deployed |
| 1.4b `delete-account` function with in-code user check | To do (1B) |
| 1.4c Shop window functions (browse, search, listing detail, studio, fit) | To do (1B) |
| 1.5 Minimal tests: owner CRUD, guest read-only, user A cannot touch user B | To do (1B) |
| 1.6 Security Advisor clean or every warning logged | Done for 1A, re-check after 1B |
| 1.7 `contract.md` written | To do (1B) |

## Step 2 - Website foundation (Antigravity)

Planned after Step 1. Environment wiring, guest mode, home, search, listing page, sign-up gates.

## Step 3 - Shared mobile code (Codex)

Planned after Step 1. Kotlin Multiplatform shared module built from the Android reference.

## Step 4 - Android on shared code (Claude Code)

Planned after Step 3.

## Step 5 - iOS (Claude Code)

Planned after Step 4.

## Step 6 - Switchover

All three clients build and pass owner testing on `dzirent-server`. Then the `Dzirent_Android` repo and project are retired.
