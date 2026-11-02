# Pranalika

Coordination for Dzirent development.

Every session, read: this file, `BOARD.md`, `decisions.md`, and the handoff entry the prompt names. Read `contract.md` for any work that talks to the database. Read the root `README.md` (product features and rules) only for feature or screen work. Skip everything else unless the prompt asks for it.

## Who does what

The owner assigns each step to one agent. The prompt for that step lists the folders the agent may change. There is no permanent folder ownership.

| Who | Role |
| --- | --- |
| Agents (Codex, Antigravity, Claude Code) | Do the step they are given, only in the folders the prompt lists |
| Coordinator (Claude chat) | Plans, reviews, writes agent prompts |
| Owner (Vivek) | Assigns steps, merges `Preview` into `main`, manages secrets and test users |

Any agent may update any file in `pranalika` when it finishes its work.

## Rules

1. Work only on branch `Preview` in `H:\DziRent\Dzirent_dev`. `git pull` before starting, push when done. Never push to `main`. Never create branches.
2. Change only the folders your prompt lists, plus `pranalika/`. If something outside them needs changing, write it under **Requests** in your handoff file.
3. `H:\Dzirent_Android` is the read-only reference for every workflow and feature. Read and copy from it locally. Never edit it.
4. Supabase project `Dzirent_Android` (ref `fijivsswadengcyhrnbb`) is read-only: dumps and reads only, never writes.
5. Supabase project `dzirent-server` (ref `pwfzkyjeivadbtkfkdxr`) changes only through migration files in `supabase/migrations/`, applied with the Supabase CLI. No dashboard edits. No one-off SQL writes.
6. Secrets: code reads environment variables only. Never hardcode, print, log, copy or commit a secret value. Local values live in `H:\DziRent\secrets\`. Never create users or passwords; test users are listed in `test-user.env`.
7. Never start or use an emulator, simulator or device. Verify with builds and unit tests only. The owner tests on his own phone and reports problems.
8. Tests: only what proves the change works. No test suites for their own sake.
9. Locked decisions: existing entries in `decisions.md` are never changed or removed. If you disagree, write it under **Requests** in your handoff.
10. End of every session: add an entry to your own handoff file (`handoffs/codex.md`, `handoffs/antigravity.md` or `handoffs/claude-code.md`), newest at the top, titled `## Step <number> - <date> - <short title>`. Never write in another agent's handoff file.
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
