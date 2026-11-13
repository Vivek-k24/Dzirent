-- C2: LOCAL-ONLY seed, loaded by `supabase db reset` on the Docker backend (config.toml [db.seed]).
-- Never pushed: `supabase db push` doesn't run seeds. Everything here is throwaway local data.
-- Generated once from supabase/seed/sample_data.mjs and sample_photos.mjs (same titles and listing ids,
-- so scripts that name a sample listing work locally); edit by hand from now on.
-- Users and passwords: supabase/tests/local.env. Photo files: supabase/tests/lib/local_photos.mjs
-- uploads the files these rows name (the integration runner does it).

-- 1. Users. The auth.users insert runs the sign-up trigger (handle_new_user), which creates each profile.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
   raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'test1@dzirent.local',
  extensions.crypt('local-test-password-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"Elena Rostova","role":"lender","adult_confirmed":true,"city":"Austin, TX","approx_lat":30.27,"approx_lng":-97.74}'::jsonb, now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', jsonb_build_object('sub', '11111111-1111-4111-8111-111111111111', 'email', 'test1@dzirent.local', 'email_verified', true),
  'email', now(), now(), now());

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
   raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'test2@dzirent.local',
  extensions.crypt('local-test-password-2', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"Maya Lin","role":"lender","adult_confirmed":true,"city":"Austin, TX","approx_lat":30.31,"approx_lng":-97.76}'::jsonb, now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', jsonb_build_object('sub', '22222222-2222-4222-8222-222222222222', 'email', 'test2@dzirent.local', 'email_verified', true),
  'email', now(), now(), now());

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
   raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'test3@dzirent.local',
  extensions.crypt('local-test-password-3', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"Jordan Bell","role":"both","adult_confirmed":true,"city":"Austin, TX","approx_lat":30.25,"approx_lng":-97.75}'::jsonb, now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', jsonb_build_object('sub', '33333333-3333-4333-8333-333333333333', 'email', 'test3@dzirent.local', 'email_verified', true),
  'email', now(), now(), now());

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
   raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'admin@dzirent.local',
  extensions.crypt('local-admin-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"Local Admin","role":"renter","adult_confirmed":true,"city":"Austin, TX","approx_lat":30.27,"approx_lng":-97.74}'::jsonb, now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', jsonb_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'email', 'admin@dzirent.local', 'email_verified', true),
  'email', now(), now(), now());

-- 2. Studios (as the sample data sets them).
update public.profiles set studio_name = 'Studio Rostova', studio_handle = 'studiorostova',
  studio_bio = 'Curated eveningwear and contemporary designer pieces in Austin.',
  style_tags = array['Classic', 'Vintage', 'Glam'], pickup_area = 'Downtown / South Congress'
  where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set studio_name = 'Atelier Maya', studio_handle = 'ateliermaya',
  studio_bio = 'Silk, traditional fusion, and tailored professional garments.',
  style_tags = array['Traditional', 'Workwear', 'Designer'], pickup_area = 'Central Austin / Hyde Park'
  where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set studio_name = 'Jordan Bell', studio_handle = 'jordanbell' where id = '33333333-3333-4333-8333-333333333333';

-- Test user 3 (renter) has body measurements, with consent, for fit matching.
insert into public.private_profiles
  (user_id, chest_cm, waist_cm, hips_cm, shoulder_cm, height_cm, fit_profile, style_interests, measurements_consent_at)
values ('33333333-3333-4333-8333-333333333333', 90, 72, 96, 39, 170, 'woman',
  array['Western formal', 'Western casual', 'East Asian'], now());

-- 3. Everyone accepted the current terms (publishing, chats, saves and reports need it).
insert into public.legal_acceptances (user_id, document, version, platform)
select u.id, d.document, d.version, 'web'
from (values ('11111111-1111-4111-8111-111111111111'::uuid), ('22222222-2222-4222-8222-222222222222'::uuid), ('33333333-3333-4333-8333-333333333333'::uuid), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)) u(id)
cross join public.legal_documents d;

-- 4. The local admin (two-step sign-in is still needed: enroll a TOTP factor through the Auth API).
insert into app_private.admin_users (user_id, added_by) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'local seed');

-- 5. The 12 sample listings with two photo rows, 90 days of availability and measurements. They are
--    inserted paused and published after their photos: photo changes on an active listing queue an
--    automatic photo check (Step 8B), which the seed shouldn't start.
insert into public.listings
  (id, lender_id, title, category, garment_type, item_type, size_label, description, price_usd, price_note,
   deposit_note, retail_value, city, approx_lat, approx_lng, listing_styles, status)
values
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', '11111111-1111-4111-8111-111111111111', 'Silk Halter Evening Gown', 'Occasion & Party', 'dress', null, 'M / US 6', 'Floor-length silk halter gown with an open back and delicate drape.', 65, null, 'Refundable deposit required upon pickup.', null, 'Austin, TX', 30.2672, -97.7431, array['Western formal']::text[], 'paused'),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', '11111111-1111-4111-8111-111111111111', 'Tailored Charcoal Blazer', 'Career & Professional', 'suit', null, 'M', 'Italian wool blend tailored blazer with notched lapels and satin lining.', 45, null, null, null, 'Austin, TX', 30.2672, -97.7431, array['Western formal']::text[], 'paused'),
  ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', '11111111-1111-4111-8111-111111111111', 'Emerald Velvet Cocktail Dress', 'Occasion & Party', 'dress', null, 'S / US 4', 'Deep emerald green velvet cocktail dress with structured shoulders.', 55, null, null, null, 'Austin, TX', 30.2672, -97.7431, array['Western formal']::text[], 'paused'),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', '11111111-1111-4111-8111-111111111111', 'Cashmere Belted Trench Coat', 'Outerwear', 'top', null, 'M', 'Luxurious double-breasted cashmere and wool trench coat in camel.', 75, null, null, null, 'Austin, TX', 30.2672, -97.7431, array['Western formal', 'Western casual']::text[], 'paused'),
  ('3f8b0763-cb28-46b3-a210-a18499de5b65', '11111111-1111-4111-8111-111111111111', 'Pleated Wide-Leg Trousers', 'Career & Professional', 'trousers', null, 'US 6', 'High-waisted wide-leg tailored trousers with front pleats.', 30, null, null, null, 'Austin, TX', 30.2672, -97.7431, array['Western casual']::text[], 'paused'),
  ('a79481ab-8f15-426c-b9db-f704b09e94f0', '11111111-1111-4111-8111-111111111111', 'Linen Summer Sundress', 'Everyday', 'dress', null, 'XS', 'Breezy tiered linen sundress in terracotta.', 14, null, null, null, 'Austin, TX', 30.2672, -97.7431, array['Western casual']::text[], 'paused'),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', '22222222-2222-4222-8222-222222222222', 'Embroidered Silk Lehenga Set', 'Cultural & Traditional', 'skirt', null, 'M / US 6', 'Hand-embroidered zari silk lehenga with matching blouse and sheer dupatta.', 85, null, null, null, 'Austin, TX', 30.3072, -97.756, array['South Asian']::text[], 'paused'),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', '22222222-2222-4222-8222-222222222222', 'Modern Qipao Midi Dress', 'Cultural & Traditional', 'dress', null, 'M', 'Contemporary silk jacquard qipao with mandarin collar and side slit.', 50, null, null, null, 'Austin, TX', 30.3072, -97.756, array['East Asian']::text[], 'paused'),
  ('49737980-7f0e-44bc-97bb-7b06914e9848', '22222222-2222-4222-8222-222222222222', 'Minimalist Wool Day Coat', 'Outerwear', 'top', null, 'S', 'Unstructured cocoon wool coat in heather grey.', 60, null, null, null, 'Austin, TX', 30.3072, -97.756, array['Western casual']::text[], 'paused'),
  ('a87b4861-52a9-43ac-afdc-12a751c92d35', '22222222-2222-4222-8222-222222222222', 'Structured Silk Work Shirt', 'Career & Professional', 'top', null, 'M', 'Crisp mulberry silk button-down shirt with mother of pearl buttons.', 28, null, null, null, 'Austin, TX', 30.3072, -97.756, array['Western formal']::text[], 'paused'),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', '22222222-2222-4222-8222-222222222222', 'Vintage Denim Jumpsuit', 'Everyday', 'one_size', null, 'M', 'Relaxed utility jumpsuit in vintage washed cotton denim.', 12, null, null, null, 'Austin, TX', 30.3072, -97.756, array['Western casual']::text[], 'paused'),
  ('32c885a9-a286-4fc4-a77e-2bae9fa0141b', '22222222-2222-4222-8222-222222222222', 'Satin Backless Maxi Dress', 'Occasion & Party', 'dress', null, 'L / US 10', 'Champagne bias-cut satin gown with low cowl back.', 70, null, null, null, 'Austin, TX', 30.3072, -97.756, array['Western formal']::text[], 'paused')
;
insert into public.listing_photos (listing_id, storage_path, position, slot) values
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', 'c05269c8-dc62-4fe6-a1c2-68b0f2448d1c/front_local_sample.jpg', 0, 'front'),
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', 'c05269c8-dc62-4fe6-a1c2-68b0f2448d1c/back_local_sample_.jpg', 1, 'back'),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f/front_local_sample.jpg', 0, 'front'),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f/back_local_sample_.jpg', 1, 'back'),
  ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490/front_local_sample.jpg', 0, 'front'),
  ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490/back_local_sample_.jpg', 1, 'back'),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', '0415cc17-423a-4232-b481-df74cec8e4ae/front_local_sample.jpg', 0, 'front'),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', '0415cc17-423a-4232-b481-df74cec8e4ae/back_local_sample_.jpg', 1, 'back'),
  ('3f8b0763-cb28-46b3-a210-a18499de5b65', '3f8b0763-cb28-46b3-a210-a18499de5b65/front_local_sample.jpg', 0, 'front'),
  ('3f8b0763-cb28-46b3-a210-a18499de5b65', '3f8b0763-cb28-46b3-a210-a18499de5b65/back_local_sample_.jpg', 1, 'back'),
  ('a79481ab-8f15-426c-b9db-f704b09e94f0', 'a79481ab-8f15-426c-b9db-f704b09e94f0/front_local_sample.jpg', 0, 'front'),
  ('a79481ab-8f15-426c-b9db-f704b09e94f0', 'a79481ab-8f15-426c-b9db-f704b09e94f0/back_local_sample_.jpg', 1, 'back'),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', 'a7417052-55ff-4cb8-b49d-054a69a6e719/front_local_sample.jpg', 0, 'front'),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', 'a7417052-55ff-4cb8-b49d-054a69a6e719/back_local_sample_.jpg', 1, 'back'),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', '80a55094-9699-4b7f-a55f-f3094c3dc526/front_local_sample.jpg', 0, 'front'),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', '80a55094-9699-4b7f-a55f-f3094c3dc526/back_local_sample_.jpg', 1, 'back'),
  ('49737980-7f0e-44bc-97bb-7b06914e9848', '49737980-7f0e-44bc-97bb-7b06914e9848/front_local_sample.jpg', 0, 'front'),
  ('49737980-7f0e-44bc-97bb-7b06914e9848', '49737980-7f0e-44bc-97bb-7b06914e9848/back_local_sample_.jpg', 1, 'back'),
  ('a87b4861-52a9-43ac-afdc-12a751c92d35', 'a87b4861-52a9-43ac-afdc-12a751c92d35/front_local_sample.jpg', 0, 'front'),
  ('a87b4861-52a9-43ac-afdc-12a751c92d35', 'a87b4861-52a9-43ac-afdc-12a751c92d35/back_local_sample_.jpg', 1, 'back'),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', 'ed999629-5802-4a8b-abb5-67d35710f02c/front_local_sample.jpg', 0, 'front'),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', 'ed999629-5802-4a8b-abb5-67d35710f02c/back_local_sample_.jpg', 1, 'back'),
  ('32c885a9-a286-4fc4-a77e-2bae9fa0141b', '32c885a9-a286-4fc4-a77e-2bae9fa0141b/front_local_sample.jpg', 0, 'front'),
  ('32c885a9-a286-4fc4-a77e-2bae9fa0141b', '32c885a9-a286-4fc4-a77e-2bae9fa0141b/back_local_sample_.jpg', 1, 'back')
;
insert into public.availability (listing_id, start_date, end_date) values
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', current_date, current_date + 90),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', current_date, current_date + 90),
  ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', current_date, current_date + 90),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', current_date, current_date + 90),
  ('3f8b0763-cb28-46b3-a210-a18499de5b65', current_date, current_date + 90),
  ('a79481ab-8f15-426c-b9db-f704b09e94f0', current_date, current_date + 90),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', current_date, current_date + 90),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', current_date, current_date + 90),
  ('49737980-7f0e-44bc-97bb-7b06914e9848', current_date, current_date + 90),
  ('a87b4861-52a9-43ac-afdc-12a751c92d35', current_date, current_date + 90),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', current_date, current_date + 90),
  ('32c885a9-a286-4fc4-a77e-2bae9fa0141b', current_date, current_date + 90)
;
insert into public.listing_measurements (listing_id, label, value, unit) values
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', 'Bust (flat)', 47, 'cm'),
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', 'Waist (flat)', 37.5, 'cm'),
  ('c05269c8-dc62-4fe6-a1c2-68b0f2448d1c', 'Hips (flat)', 50, 'cm'),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', 'Chest', 98, 'cm'),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', 'Waist', 78, 'cm'),
  ('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f', 'Shoulder', 40, 'cm'),
  ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 'Bust', 88, 'cm'),
  ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 'Waist', 68, 'cm'),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', 'Chest', 105, 'cm'),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', 'Waist', 85, 'cm'),
  ('0415cc17-423a-4232-b481-df74cec8e4ae', 'Shoulder', 41.5, 'cm'),
  ('3f8b0763-cb28-46b3-a210-a18499de5b65', 'Waist (flat)', 37, 'cm'),
  ('3f8b0763-cb28-46b3-a210-a18499de5b65', 'Hips (flat)', 51, 'cm'),
  ('a79481ab-8f15-426c-b9db-f704b09e94f0', 'Bust', 82, 'cm'),
  ('a79481ab-8f15-426c-b9db-f704b09e94f0', 'Waist', 62, 'cm'),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', 'Bust', 98, 'cm'),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', 'Waist', 78, 'cm'),
  ('a7417052-55ff-4cb8-b49d-054a69a6e719', 'Hips', 106, 'cm'),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', 'Chest', 96, 'cm'),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', 'Waist', 76, 'cm'),
  ('80a55094-9699-4b7f-a55f-f3094c3dc526', 'Hips', 104, 'cm'),
  ('49737980-7f0e-44bc-97bb-7b06914e9848', 'Chest', 96, 'cm'),
  ('49737980-7f0e-44bc-97bb-7b06914e9848', 'Waist', 76, 'cm'),
  ('a87b4861-52a9-43ac-afdc-12a751c92d35', 'Chest', 96, 'cm'),
  ('a87b4861-52a9-43ac-afdc-12a751c92d35', 'Shoulder', 40.5, 'cm'),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', 'Chest', 98, 'cm'),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', 'Waist', 78, 'cm'),
  ('ed999629-5802-4a8b-abb5-67d35710f02c', 'Hips', 104, 'cm'),
  ('32c885a9-a286-4fc4-a77e-2bae9fa0141b', 'Bust', 104, 'cm'),
  ('32c885a9-a286-4fc4-a77e-2bae9fa0141b', 'Waist', 86, 'cm')
;

update public.listings set status = 'active'
  where lender_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- 6. Vault: the outbox and the nightly file job reach local stand-ins, never Google or Firebase.
--    Pushes and photo checks go to the stub server (supabase/tests/stubs/server.mjs, container
--    "dzirent-stubs" on the local Supabase network); cleanup-files to the locally served function.
--    The migrations create these entries with the LIVE addresses (and random secrets), so a fresh
--    local database would call production; every one is replaced here.
do $vault$
declare
  v record;
  v_id uuid;
begin
  for v in select * from (values
    ('send_push_url', 'http://dzirent-stubs:8787/push'),
    ('send_push_secret', 'local-push-secret'),
    ('scan_listing_url', 'http://dzirent-stubs:8787/scan'),
    ('scan_listing_secret', 'local-scan-secret'),
    ('cleanup_files_url', 'http://kong:8000/functions/v1/cleanup-files'),
    ('cleanup_files_secret', 'local-cleanup-secret')
  ) as t(name, value) loop
    select s.id into v_id from vault.secrets s where s.name = v.name;
    if v_id is null then
      perform vault.create_secret(v.value, v.name);
    else
      perform vault.update_secret(v_id, v.value, v.name);
    end if;
  end loop;
end
$vault$;
