-- Step 8B test, temporary: vision_required on while supabase/tests/step8b_recheck.mjs checks
-- that a changed photo set the check doesn't allow pauses an active listing with a reason.
-- The next migration (20261106081000_step8b_test_vision_off) turns it off again.
update public.app_settings
  set enabled = true, updated_at = pg_catalog.now()
  where key = 'vision_required';
