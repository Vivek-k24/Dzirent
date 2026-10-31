# Database foundation

Step 1A rebuilds the 20 public tables from the read-only Android project. The
reference directory contains structure and function source, plus only the
32,363 `us_cities` rows. Schema and city snapshots were refreshed using native
`pg_dump` through a read-only database connection. `snapshot_extras.sql` exports
Storage policies, the Auth trigger, event trigger and Realtime memberships that
fall outside the scoped public-schema dump. `delete-account` was downloaded with
the CLI's explicit project-ref option; the repo is linked only to `dzirent-server`.
`catalog.json` records the structural catalog used for the migrations;
`functions.sql` preserves the original definitions.
The reference SQL intentionally retains the old project's access rules. Apply
only files in `migrations/` to the new project.

All public tables have RLS. Raw rows are owner-only, with participant access for
conversations, messages and rentals. Declarations are immutable; events and
reports accept inserts only. Guests have no raw-table grants, including cities.
Only `search_cities(p_query, p_limit)` is guest-callable.

Policy helpers live in the unexposed `app_private` schema. Client RPCs keep the
reference signatures. Signup creates the profile through a guarded Auth trigger;
it permits a null JWT only in the actual `auth.users` INSERT context. Existing
`rls_auto_enable` is retained, given an empty search path, and revoked from app
roles.

Photos use public bucket `listing-photos` and paths `{listing_id}/{random}.{ext}`.
The owner's Storage API requests can list, upload, update and delete that folder.
Use the deployed `delete-listing` Edge Function to remove files before deleting
the row. A database guard rejects a DELETE while files remain, including cascades
from account deletion. A Storage trigger locks the parent listing during metadata
writes to prevent concurrent uploads from leaving orphan metadata. Failed uploads
are cleaned up by the Storage service. Account deletion must remove owned listing
folders first; the reference `delete-account` source is unchanged and not deployed.

The Edge Function was deployed to `dzirent-server` after owner approval. Its
handler verifies the bearer token with Auth; it uses caller RLS and no service-role
credential. See `functions/delete-listing/README.md`.

Minimal checks:

- Load the new project's credentials into environment variables and run
  `python supabase/tests/guest_rest.py`.
- Run `node --test supabase/tests/delete_listing.test.mjs` with Node 22.13+.
- Run `supabase db push` a second time; it should report up to date.

No listing discovery or studio statistics RPCs are installed in Step 1A.
`listings_nearby`, `search_listings_similar`, `studio_rental_count`, and
`studio_reply_minutes` are deferred to Step 1B. The old clients' cross-owner joins
and user-ID photo folders require later client changes.
