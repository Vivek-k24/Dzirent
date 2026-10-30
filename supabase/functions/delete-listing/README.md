# Delete a listing

Call `POST /functions/v1/delete-listing` with the user's bearer access token,
the project's publishable key in `apikey`, and JSON `{ "listing_id": "<uuid>" }`.
The function verifies the token with Auth, checks listing ownership, removes all
objects in `listing-photos/{listing_id}/` through the Storage API, then deletes
the listing. It runs as the caller and needs no service-role key.

The database deletion guard and Storage locking triggers are required: deleting
a listing is refused while files remain, and concurrent uploads are serialized
with deletion. A failed cleanup keeps the listing available for a retry. Some
files may already have been removed before a failure. Retry the same request;
stop uploads for that listing if deletion reports a conflict.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied by the Edge Function runtime.
Gateway JWT verification is disabled for this function in `config.toml` because
the handler verifies the user itself with `auth.getUser(token)`; this also permits
clients to send the modern publishable key as `apikey`.

Use the Storage API for file deletion. SQL deletion of `storage.objects` removes
only metadata and leaves the actual object behind.
