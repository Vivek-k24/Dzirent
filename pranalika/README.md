# Pranalika

Coordination for Dzirent development. Every agent reads this file at the start of every session, then `BOARD.md`, then `decisions.md`.

## Who owns what

| Who | May write | Notes |
| --- | --- | --- |
| Codex | `supabase/`, `mobile/shared/`, `pranalika/contract.md`, `pranalika/handoffs/codex.md` | Extracts from the Android reference, builds the shared backend and shared code, runs and tests it |
| Antigravity | `apps/web/`, `pranalika/handoffs/antigravity.md` | All website frontend work |
| Claude Code | `mobile/androidApp/`, `mobile/iosApp/`, `pranalika/handoffs/claude-code.md` | Android, later iOS |
| Coordinator (Claude chat) | `pranalika/README.md`, `BOARD.md`, `decisions.md`, `security-log.md` | Plans, reviews, writes agent prompts |
| Owner (Vivek) | Everything | Merges `Preview` into `main`, manages secrets and test users |

## Rules

1. Work only on branch `Preview` in `H:\DziRent\Dzirent_dev`. `git pull` before starting, push when done. Never push to `main`. Never create branches.
2. Write only in your own folders. If you need a change elsewhere, write it under **Requests** in your handoff file.
3. `H:\Dzirent_Android` is the read-only reference for every workflow and feature. Read and copy from it locally. Never edit it.
4. Supabase project `Dzirent_Android` (ref `fijivsswadengcyhrnbb`) is read-only: dumps and reads only, never writes.
5. Supabase project `dzirent-server` (ref `pwfzkyjeivadbtkfkdxr`) changes only through migration files in `supabase/migrations/`, applied with the Supabase CLI. No dashboard edits. No one-off SQL writes.
6. Secrets: code reads environment variables only. Never hardcode, print, log, copy or commit a secret value. Local values live in `H:\DziRent\secrets\`. Never create users or passwords; test users are listed in `test-user.env`.
7. Never start or use an emulator, simulator or device. Verify with builds and unit tests only. The owner tests on his own phone and reports problems.
8. Tests: only what proves the change works. No test suites for their own sake.
9. Locked decisions in `decisions.md` are not reopened. If you disagree, write it under **Requests** in your handoff.
10. End of every session: add an entry to your handoff file.
11. This repo is public. No secrets, keys, credentials or personal data anywhere, including this folder.

## Environment variable names (values live only in H:\DziRent\secrets\)

`dzirent-server.env`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

`test-user.env`
- `TEST_USER_1_EMAIL`, `TEST_USER_1_PASSWORD`
- `TEST_USER_2_EMAIL`, `TEST_USER_2_PASSWORD`
- `TEST_USER_3_EMAIL`, `TEST_USER_3_PASSWORD`
