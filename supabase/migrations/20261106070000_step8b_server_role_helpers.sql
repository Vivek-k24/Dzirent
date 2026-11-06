-- Step 8B fix: vision_finish_scan and vision_fail_scan run as the server's role (service_role,
-- called by scan-listing with the secret key) and, since Step 8B, call these app_private
-- helpers for active listings. Without the schema and the functions granted to that role, a
-- check of an active listing could neither be saved nor marked failed, and stayed "running".
-- app_private is still not exposed through the API; anon and authenticated get nothing here.
grant usage on schema app_private to service_role;
grant execute on function app_private.vision_pause(uuid, text) to service_role;
grant execute on function app_private.recheck_active_listing(uuid) to service_role;
