# Codex handoff

Add one entry per session, newest at the top.

## 2026-10-30 - Step 1A: dzirent-server schema

Done:
- Pulled `Preview` before work. Applied five migration files to `dzirent-server`
  (`pwfzkyjeivadbtkfkdxr`) using `supabase db push --db-url` and environment-loaded
  database credentials. All 20 public tables have RLS; no guest raw-table grants.
- Snapshotted the live old project's full public structure, policies, functions,
  triggers, indexes, checks, ACLs and Storage policies. Saved unchanged deployed
  `delete-account` source and only the 32,363 `us_cities` rows. No other application
  rows were read/exported. Direct old DB authentication failed, so read-only
  connected catalog/data queries supplied the snapshot. Never linked the CLI to
  the old project, and never ran old-project push/pull/repair/writes.
- Ported required workflows and RPCs with empty search paths and qualified names.
  `is_blocked` is an unexposed `app_private` policy helper. Other helpers/trigger
  functions have no anon/authenticated EXECUTE. Existing `rls_auto_enable` was
  preserved, its search path set empty, and client EXECUTE revoked.
- Owner-only profiles/listings/children; participant access for chats/messages/
  rentals; immutable declarations and append-only events/reports. A private
  conversation trigger validates the lender/listing without exposing the row.
- Created public `listing-photos` bucket with owner-only modifications under
  `{listing_id}/{random}.{ext}`. Guarded listing DELETE requires Storage API file
  cleanup first; a parent lock serializes metadata writes with deletion. Prepared
  an authenticated, caller-RLS `delete-listing` handler with retryable cleanup.

Files changed:
- `supabase/config.toml`, `supabase/.gitignore`, `supabase/README.md`.
- Five SQL migrations in `supabase/migrations/`.
- `supabase/reference/schema.sql`, `catalog.json`, `functions.sql`, `us_cities.sql`,
  and `reference/functions/delete-account/index.ts`.
- `supabase/functions/delete-listing/index.ts` and its README.
- `supabase/tests/guest_rest.py`, `supabase/tests/delete_listing.test.mjs`.
- This handoff only; unrelated existing web/tool/Claude changes are excluded.

How it was verified:
- First CLI push applied all five migrations. Second push: remote is up to date,
  zero pending migrations.
- Guest REST with only `SUPABASE_PUBLISHABLE_KEY`, no Authorization/user token:
  listings, profiles and us_cities each returned HTTP 401; `search_cities` with
  `Austin` returned 11 city results.
- Catalog query: exactly 32,363 cities, 20 public tables, all 20 RLS-enabled.
  All 18 public/private functions have empty search paths. Only search_cities
  allows anon EXECUTE; client EXECUTE is absent from all trigger functions.
- Four local deletion-handler checks passed: missing auth, foreign owner, 1001
  photos removed in batches before row deletion, and cleanup failure preserves
  the listing. No users, passwords, sample listings, devices or emulators created.
- Security Advisor results and intentional exceptions are recorded below.
- Gitleaks scanned supabase and this handoff with redacted output: no leaks found.
  `git diff --check` passed.

Open issues:
- CLI `link` is pending: this computer has no Supabase access token. The database
  password works; explicit target DB URLs were used for both successful pushes.
  A pending input request asks the owner to run `supabase login` or add
  `SUPABASE_ACCESS_TOKEN` to the new project's local secrets file. The CLI was
  never linked to either project during this session.
- `delete-listing` deployment is pending owner approval. Automatic approval review
  rejected deployment as a consequential remote deletion endpoint outside the
  explicit Step 1A request, citing gateway JWT verification being off. The handler
  verifies the bearer token with `auth.getUser` before any data operation and uses
  no service-role key. Its complete source and tests are committed for review.
  Until approved/deployed, callers must remove the listing folder through Storage
  API before DELETE; raw DELETE with files is safely refused.
- No owner-account Storage test was requested/run. The cleanup handler has local
  mocked checks; live owner/cross-owner CRUD remains for the later test step.
- Reference `delete-account` is snapshot-only. Future account deletion must clean
  listing-ID folders before deleting the auth user; the database guard prevents
  orphaning files through cascading deletes.
- Deferred to Step 1B, not installed: `listings_nearby`,
  `search_listings_similar`, `studio_rental_count`, `studio_reply_minutes`.
  Existing client cross-owner joins/photo paths need later client work.

Requests:
- Authenticate the CLI for new-project linking and answer the pending approval
  request for the prepared `delete-listing` deployment. Do not put tokens in chat.
- Coordinator: copy the following intentional Advisor findings into your owned
  `pranalika/security-log.md`. It was not edited because this session may commit
  only `supabase/` and this handoff.
  - INFO `rls_enabled_no_policy`: us_cities intentionally has no raw-table grants
    or policies; only the bounded city RPC can read it.
    [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
  - WARN `anon_security_definer_function_executable`: search_cities is the explicit
    guest exception; it returns only public city reference data with an empty
    search path and bounded prefix search.
    [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
  - WARN `authenticated_security_definer_function_executable`, five intentional
    RPCs: search_cities (raw cities denied), my_block_peer_ids (only caller's block
    relationships, including reverse blocks), record_accessory_declaration and
    record_listing_declaration (immutable audit inserts, caller ownership checks),
    set_conversation_dates (renter-only update through the validated RPC, no raw
    conversation UPDATE grant). Every account RPC rejects null auth.uid().
    [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Step 1B was not started.

<!--
## YYYY-MM-DD - short title
Done:
Files changed:
How it was verified:
Open issues:
Requests:
-->
