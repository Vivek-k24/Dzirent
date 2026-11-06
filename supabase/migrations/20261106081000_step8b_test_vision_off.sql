-- Step 8B test done: vision_required back off (it stays off until the owner decides to turn it on).
update public.app_settings
  set enabled = false, updated_at = pg_catalog.now()
  where key = 'vision_required';
