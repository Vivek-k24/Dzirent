# Board

Status: `To do` / `Doing` / `Done`. Only the coordinator moves items. Agents report progress in their handoff files.

## Step 0 - Provisions (Owner)

| Item | Status |
| --- | --- |
| Vercel: build only `main` and `Preview` (`ignoreCommand`) | Done on `Preview`, waiting for PR merge into `main` |
| Vercel: Root Directory `apps/web`, production branch `main` | Done |
| Vercel: `dzirent.vercel.app` assigned to `Preview` | Done |
| Vercel: function region Portland | Done |
| GitHub: ruleset on `main` (PR required, no force push) | Done |
| `dzirent-server`: leaked-password protection on | Done |
| `H:\DziRent\secrets\dzirent-server.env` created | To do |
| Test users created in `dzirent-server` and listed in `test-user.env` | To do (after Step 1.2) |

## Step 1 - Backend foundation (Codex)

| Item | Status |
| --- | --- |
| 1.1 Read-only snapshot of `Dzirent_Android` project (schema, rules, functions, triggers, bucket, `delete-account` source, `us_cities` data) into `supabase/reference/` | To do |
| 1.2 Clean migrations for `dzirent-server`: same tables and workflows, security fixes, shop window (see decisions) | To do |
| 1.3 Seed: `us_cities` plus sample listings owned by test users | To do |
| 1.4 `delete-account` function with in-code user check | To do |
| 1.5 Minimal tests: owner CRUD, guest read-only, user A cannot touch user B | To do |
| 1.6 Security Advisor clean or every warning logged | To do |
| 1.7 `contract.md` written | To do |

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
