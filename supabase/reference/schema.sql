-- Read-only structural snapshot from fijivsswadengcyhrnbb, 2026-10-30.
-- Exported through pg_catalog using the connected API (direct DB auth failed).
-- Original rules/ACLs are preserved here for reference, not applied to target.
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions, pg_catalog;

CREATE TABLE public."listing_measurements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "label" text NOT NULL,
  "value" numeric NOT NULL,
  "unit" text NOT NULL
);
CREATE TABLE public."availability" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL
);
CREATE TABLE public."conversations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "renter_id" uuid NOT NULL,
  "lender_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "requested_start" date,
  "requested_end" date
);
CREATE TABLE public."listings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lender_id" uuid NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "size_label" text,
  "description" text,
  "price_note" text,
  "city" text,
  "approx_lat" double precision NOT NULL,
  "approx_lng" double precision NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "retail_value" numeric,
  "deposit_note" text,
  "item_type" text,
  "price_usd" numeric,
  "listing_styles" text[] DEFAULT '{}'::text[] NOT NULL,
  "garment_type" text,
  "ai_review_needed" boolean DEFAULT false NOT NULL
);
CREATE TABLE public."listing_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "slot" text
);
CREATE TABLE public."messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."blocks" (
  "blocker_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL
);
CREATE TABLE public."rental_outcomes" (
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "happened" boolean NOT NULL,
  "answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "details" text
);
CREATE TABLE public."saved_listings" (
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."saved_studios" (
  "user_id" uuid NOT NULL,
  "lender_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."listing_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."rentals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "renter_id" uuid NOT NULL,
  "lender_id" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "start_date" date,
  "end_date" date,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "display_name" text DEFAULT ''::text NOT NULL,
  "role" text DEFAULT 'renter'::text NOT NULL,
  "city" text,
  "approx_lat" double precision,
  "approx_lng" double precision,
  "adult_confirmed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "studio_name" text,
  "studio_handle" text,
  "studio_bio" text,
  "style_tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "pickup_area" text
);
CREATE TABLE public."private_profiles" (
  "user_id" uuid NOT NULL,
  "chest_cm" numeric,
  "waist_cm" numeric,
  "hips_cm" numeric,
  "shoulder_cm" numeric,
  "height_cm" numeric,
  "inseam_cm" numeric,
  "activity_seen_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "fit_profile" text,
  "style_interests" text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE public."us_cities" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "state" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL
);
CREATE TABLE public."conversation_reads" (
  "user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."accessory_declarations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "email" text,
  "full_legal_name" text NOT NULL,
  "declaration_version" integer NOT NULL,
  "app_version" text,
  "city" text,
  "ip" text,
  "user_agent" text,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."listing_declarations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid,
  "user_id" uuid,
  "declaration_version" integer NOT NULL,
  "ip" text,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."suggestion_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "listing_id" uuid,
  "field" text NOT NULL,
  "label" text NOT NULL,
  "action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_label_check" CHECK (char_length(label) >= 1 AND char_length(label) <= 40);
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_unit_check" CHECK (unit = ANY (ARRAY['cm'::text, 'in'::text]));
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_value_check" CHECK (value > 0::numeric AND value < 1000::numeric);
ALTER TABLE public."availability" ADD CONSTRAINT "availability_check" CHECK (end_date >= start_date);
ALTER TABLE public."availability" ADD CONSTRAINT "availability_pkey" PRIMARY KEY (id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_renter_id_key" UNIQUE (listing_id, renter_id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_pkey" PRIMARY KEY (id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_requested_dates_check" CHECK (requested_start IS NULL AND requested_end IS NULL OR requested_start IS NOT NULL AND requested_end IS NOT NULL AND requested_end >= requested_start);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_accessory_value_check" CHECK (category <> 'Accessories'::text OR retail_value IS NULL OR retail_value <= 300::numeric) NOT VALID;
ALTER TABLE public."listings" ADD CONSTRAINT "listings_category_check" CHECK (category = ANY (ARRAY['Career & Professional'::text, 'Occasion & Party'::text, 'Cultural & Traditional'::text, 'Everyday'::text, 'Outerwear'::text, 'Accessories'::text]));
ALTER TABLE public."listings" ADD CONSTRAINT "listings_deposit_note_length" CHECK (char_length(deposit_note) <= 120);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_description_check" CHECK (char_length(description) <= 1000);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_garment_type_check" CHECK (garment_type IS NULL OR (garment_type = ANY (ARRAY['top'::text, 'trousers'::text, 'suit'::text, 'dress'::text, 'skirt'::text, 'saree'::text, 'one_size'::text])));
ALTER TABLE public."listings" ADD CONSTRAINT "listings_item_type_check" CHECK (item_type IS NULL OR category = 'Accessories'::text AND (item_type = ANY (ARRAY['Sunglasses'::text, 'Handbag'::text, 'Tie'::text, 'Watch (non-smart)'::text, 'Belt buckle'::text, 'Costume jewelry'::text])));
ALTER TABLE public."listings" ADD CONSTRAINT "listings_listing_styles_check" CHECK (cardinality(listing_styles) <= 3 AND listing_styles <@ ARRAY['South Asian'::text, 'East Asian'::text, 'Southeast Asian'::text, 'Middle Eastern'::text, 'African'::text, 'Mexican & Latin American'::text, 'Country & Western'::text, 'Western formal'::text, 'Western casual'::text]);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_pkey" PRIMARY KEY (id);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_price_note_check" CHECK (char_length(price_note) <= 60);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_price_usd_positive" CHECK (price_usd > 0::numeric);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_retail_value_positive" CHECK (retail_value > 0::numeric);
ALTER TABLE public."listings" ADD CONSTRAINT "listings_status_check" CHECK (status = ANY (ARRAY['active'::text, 'paused'::text]));
ALTER TABLE public."listings" ADD CONSTRAINT "listings_title_check" CHECK (char_length(title) >= 3 AND char_length(title) <= 80);
ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_slot_check" CHECK (slot IS NULL OR (slot = ANY (ARRAY['front'::text, 'back'::text, 'close_up'::text, 'size_tag'::text, 'extra_1'::text, 'extra_2'::text])));
ALTER TABLE public."messages" ADD CONSTRAINT "messages_body_check" CHECK (char_length(body) >= 1 AND char_length(body) <= 2000);
ALTER TABLE public."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_pkey" PRIMARY KEY (conversation_id, user_id);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_details_length" CHECK (char_length(details) <= 500);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_reason_check" CHECK (char_length(reason) <= 500);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_target_type_check" CHECK (target_type = ANY (ARRAY['listing'::text, 'user'::text, 'message'::text]));
ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_pkey" PRIMARY KEY (user_id, listing_id);
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_not_self" CHECK (user_id <> lender_id);
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_pkey" PRIMARY KEY (user_id, lender_id);
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_type_check" CHECK (type = ANY (ARRAY['view'::text, 'save'::text, 'message'::text]));
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_conversation_id_key" UNIQUE (conversation_id);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_dates_check" CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_pkey" PRIMARY KEY (id);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_status_check" CHECK (status = ANY (ARRAY['active'::text, 'returned'::text, 'cancelled'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pickup_area_length" CHECK (char_length(pickup_area) <= 60);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['renter'::text, 'lender'::text, 'both'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_bio_length" CHECK (char_length(studio_bio) <= 200);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_handle_format" CHECK (studio_handle ~ '^[a-z0-9._]{3,30}$'::text);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_name_length" CHECK (char_length(studio_name) >= 1 AND char_length(studio_name) <= 40);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_style_tags_check" CHECK (cardinality(style_tags) <= 5 AND style_tags <@ ARRAY['Minimalist'::text, 'Classic'::text, 'Vintage'::text, 'Streetwear'::text, 'Boho'::text, 'Glam'::text, 'Traditional'::text, 'Workwear'::text, 'Designer'::text, 'Plus size'::text, 'Petite'::text, 'Maternity'::text]);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_chest_cm_range" CHECK (chest_cm > 0::numeric AND chest_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_fit_profile_check" CHECK (fit_profile = ANY (ARRAY['man'::text, 'woman'::text]));
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_height_cm_range" CHECK (height_cm > 0::numeric AND height_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_hips_cm_range" CHECK (hips_cm > 0::numeric AND hips_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_inseam_cm_range" CHECK (inseam_cm > 0::numeric AND inseam_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_shoulder_cm_range" CHECK (shoulder_cm > 0::numeric AND shoulder_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_style_interests_check" CHECK (style_interests <@ ARRAY['South Asian'::text, 'East Asian'::text, 'Southeast Asian'::text, 'Middle Eastern'::text, 'African'::text, 'Mexican & Latin American'::text, 'Country & Western'::text, 'Western formal'::text, 'Western casual'::text]);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_waist_cm_range" CHECK (waist_cm > 0::numeric AND waist_cm < 300::numeric);
ALTER TABLE public."us_cities" ADD CONSTRAINT "us_cities_pkey" PRIMARY KEY (id);
ALTER TABLE public."us_cities" ADD CONSTRAINT "us_cities_state_check" CHECK (state ~ '^[A-Z]{2}$'::text);
ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY (user_id, conversation_id);
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_name_check" CHECK (char_length(btrim(full_legal_name)) >= 2 AND char_length(btrim(full_legal_name)) <= 120);
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_pkey" PRIMARY KEY (id);
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_version_check" CHECK (declaration_version > 0);
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_version_check" CHECK (declaration_version > 0);
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_action_check" CHECK (action = ANY (ARRAY['kept'::text, 'cleared'::text, 'edited'::text, 'picked'::text, 'removed'::text, 'kept_override'::text]));
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_field_check" CHECK (field = ANY (ARRAY['title'::text, 'category'::text, 'description'::text, 'style'::text, 'type_chip'::text, 'tier'::text]));
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_label_check" CHECK (char_length(label) <= 80);
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."availability" ADD CONSTRAINT "availability_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_renter_id_fkey" FOREIGN KEY (renter_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."listings" ADD CONSTRAINT "listings_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_renter_id_fkey" FOREIGN KEY (renter_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX rentals_renter_id_idx ON public.rentals USING btree (renter_id);
CREATE INDEX listing_measurements_listing_id_idx ON public.listing_measurements USING btree (listing_id);
CREATE INDEX listings_description_trgm_idx ON public.listings USING gin (description gin_trgm_ops);
CREATE INDEX accessory_declarations_user_idx ON public.accessory_declarations USING btree (user_id, declaration_version);
CREATE INDEX listing_photos_listing_id_idx ON public.listing_photos USING btree (listing_id);
CREATE INDEX listing_declarations_user_idx ON public.listing_declarations USING btree (user_id);
CREATE INDEX listings_ai_review_needed_idx ON public.listings USING btree (created_at) WHERE ai_review_needed;
CREATE INDEX us_cities_lower_name_idx ON public.us_cities USING btree (lower(name) text_pattern_ops);
CREATE INDEX listing_events_listing_id_idx ON public.listing_events USING btree (listing_id);
CREATE INDEX conversations_lender_id_idx ON public.conversations USING btree (lender_id);
CREATE UNIQUE INDEX profiles_studio_handle_key ON public.profiles USING btree (studio_handle);
CREATE INDEX suggestion_events_field_label_idx ON public.suggestion_events USING btree (field, label, action);
CREATE INDEX conversation_reads_conversation_id_idx ON public.conversation_reads USING btree (conversation_id);
CREATE INDEX rentals_lender_id_idx ON public.rentals USING btree (lender_id);
CREATE INDEX listing_events_user_created_idx ON public.listing_events USING btree (user_id, created_at);
CREATE INDEX saved_listings_listing_id_idx ON public.saved_listings USING btree (listing_id);
CREATE INDEX conversations_renter_id_idx ON public.conversations USING btree (renter_id);
CREATE INDEX listing_declarations_listing_idx ON public.listing_declarations USING btree (listing_id);
CREATE INDEX saved_studios_lender_id_idx ON public.saved_studios USING btree (lender_id);
CREATE INDEX messages_conversation_created_idx ON public.messages USING btree (conversation_id, created_at);
CREATE INDEX availability_listing_id_idx ON public.availability USING btree (listing_id);
CREATE INDEX suggestion_events_created_idx ON public.suggestion_events USING btree (created_at);
CREATE INDEX listings_title_trgm_idx ON public.listings USING gin (title gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.declaration_request_ip()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), '');
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if new.raw_user_meta_data->>'approx_lat' ~ '^-?[0-9]{1,3}(\.[0-9]+)?$'
     and new.raw_user_meta_data->>'approx_lng' ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' then
    v_lat := round((new.raw_user_meta_data->>'approx_lat')::numeric, 2);
    v_lng := round((new.raw_user_meta_data->>'approx_lng')::numeric, 2);
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_lat := null;
      v_lng := null;
    end if;
  end if;

  insert into public.profiles (id, display_name, role, adult_confirmed, city, approx_lat, approx_lng)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'display_name',''),
          coalesce(new.raw_user_meta_data->>'role','renter'),
          coalesce((new.raw_user_meta_data->>'adult_confirmed')::boolean, false),
          nullif(new.raw_user_meta_data->>'city',''),
          v_lat,
          v_lng);
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$function$;

CREATE OR REPLACE FUNCTION public.keep_ai_review_needed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.ai_review_needed and not new.ai_review_needed and current_user in ('authenticated', 'anon') then
    new.ai_review_needed := true;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.listings_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision, p_category text DEFAULT NULL::text)
 RETURNS SETOF listings
 LANGUAGE sql
 STABLE
AS $function$
  select l.* from public.listings l
  where l.status = 'active'
    and (p_category is null or l.category = p_category)
    and not public.is_blocked(auth.uid(), l.lender_id)
    and 6371 * 2 * asin(sqrt(
          power(sin(radians(l.approx_lat - p_lat) / 2), 2) +
          cos(radians(p_lat)) * cos(radians(l.approx_lat)) *
          power(sin(radians(l.approx_lng - p_lng) / 2), 2))) <= p_radius_km
  order by l.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.mark_activity_seen()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.private_profiles (user_id, activity_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set activity_seen_at = now();
$function$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.conversation_reads (user_id, conversation_id, last_read_at)
  values (auth.uid(), p_conversation_id, now())
  on conflict (user_id, conversation_id) do update set last_read_at = now();
$function$;

CREATE OR REPLACE FUNCTION public.my_block_peer_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select blocked_id from public.blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.blocks where blocked_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.record_accessory_declaration(p_full_legal_name text, p_declaration_version integer, p_app_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_full_legal_name, ''))) < 2 then
    raise exception 'Type your full legal name' using errcode = '22023';
  end if;
  if coalesce(p_declaration_version, 0) < 1 then
    raise exception 'Unknown declaration version' using errcode = '22023';
  end if;

  insert into public.accessory_declarations
    (user_id, email, full_legal_name, declaration_version, app_version, city, ip, user_agent, session_id)
  values (
    v_uid,
    coalesce(auth.jwt()->>'email', (select u.email from auth.users u where u.id = v_uid)),
    left(btrim(p_full_legal_name), 120),
    p_declaration_version,
    left(p_app_version, 40),
    (select nullif(p.city, '') from public.profiles p where p.id = v_uid),
    public.declaration_request_ip(),
    left(v_headers->>'user-agent', 400),
    auth.jwt()->>'session_id'
  )
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.record_listing_declaration(p_listing_id uuid, p_declaration_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid) then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  if coalesce(p_declaration_version, 0) < 1 then
    raise exception 'Unknown declaration version' using errcode = '22023';
  end if;

  insert into public.listing_declarations (listing_id, user_id, declaration_version, ip, session_id)
  values (p_listing_id, v_uid, p_declaration_version, public.declaration_request_ip(), auth.jwt()->>'session_id')
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.rentals_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.require_accessory_declaration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.category = 'Accessories' and new.status = 'active'
     and current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.category is distinct from new.category)
     and not exists (select 1 from public.accessory_declarations d where d.user_id = new.lender_id) then
    raise exception 'Sign the accessory declaration before listing accessories.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_cities(p_query text, p_limit integer DEFAULT 20)
 RETURNS SETOF us_cities
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select c.*
  from public.us_cities c
  where char_length(btrim(p_query)) >= 2
    and lower(c.name) ~>=~ lower(btrim(p_query))
    and lower(c.name) ~<~ (lower(btrim(p_query)) || chr(1114111))
  order by c.name, c.state
  limit greatest(
    least(greatest(coalesce(p_limit, 20), 1), 100),
    (select count(*) from public.us_cities e where lower(e.name) = lower(btrim(p_query))));
$function$;

CREATE OR REPLACE FUNCTION public.search_listings_similar(p_query text, p_limit integer DEFAULT 12)
 RETURNS SETOF listings
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  q text := lower(trim(coalesce(p_query, '')));
begin
  if char_length(q) < 3 then
    return;
  end if;
  -- How close a word must be (0..1). 0.3 lets one or two letters be wrong.
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);
  return query
    select l.*
      from public.listings l
     where l.status = 'active'
       and l.lender_id <> auth.uid()
       and not public.is_blocked(auth.uid(), l.lender_id)
       and (q <% l.title or q <% coalesce(l.description, ''))
     order by greatest(word_similarity(q, l.title), word_similarity(q, coalesce(l.description, ''))) desc,
              l.created_at desc
     limit least(greatest(coalesce(p_limit, 12), 1), 50);
end $function$;

CREATE OR REPLACE FUNCTION public.set_conversation_dates(p_conversation_id uuid, p_start date, p_end date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Invalid dates' using errcode = '22023';
  end if;
  update public.conversations
     set requested_start = p_start, requested_end = p_end
   where id = p_conversation_id and renter_id = auth.uid();
  if not found then
    raise exception 'Only the renter can set dates for this chat' using errcode = '42501';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.studio_rental_count(p_lender_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::int from public.rentals r
  where r.lender_id = p_lender_id and r.status in ('active', 'returned');
$function$;

CREATE OR REPLACE FUNCTION public.studio_reply_minutes(p_lender_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with asked as (
    select c.id,
           (select min(m.created_at) from public.messages m
            where m.conversation_id = c.id and m.sender_id = c.renter_id) as asked_at
    from public.conversations c
    where c.lender_id = p_lender_id and c.created_at > now() - interval '90 days'
  ), replies as (
    select extract(epoch from (
             (select min(m.created_at) from public.messages m
              where m.conversation_id = a.id and m.sender_id = p_lender_id and m.created_at > a.asked_at)
             - a.asked_at)) / 60 as minutes
    from asked a
    where a.asked_at is not null
  )
  select case when count(minutes) >= 3
              then round(percentile_cont(0.5) within group (order by minutes))::int end
  from replies;
$function$;
ALTER TABLE public."listing_measurements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."listing_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rental_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."saved_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."saved_studios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."listing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rentals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."private_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."us_cities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."conversation_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."accessory_declarations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."listing_declarations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."suggestion_events" ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER rentals_set_updated_at BEFORE UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION rentals_set_updated_at();
CREATE TRIGGER private_profiles_set_updated_at BEFORE UPDATE ON private_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER listings_keep_ai_review_needed BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION keep_ai_review_needed();
CREATE TRIGGER listings_require_accessory_declaration BEFORE INSERT OR UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION require_accessory_declaration();
CREATE POLICY "read measurements" ON "public"."listing_measurements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write own measurements" ON "public"."listing_measurements" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_measurements.listing_id) AND (l.lender_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_measurements.listing_id) AND (l.lender_id = auth.uid())))));
CREATE POLICY "read availability" ON "public"."availability" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write own availability" ON "public"."availability" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = availability.listing_id) AND (l.lender_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = availability.listing_id) AND (l.lender_id = auth.uid())))));
CREATE POLICY "read own conversations" ON "public"."conversations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = renter_id) OR (auth.uid() = lender_id)));
CREATE POLICY "start conversation as renter" ON "public"."conversations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((renter_id = auth.uid()) AND (renter_id <> lender_id) AND (lender_id = ( SELECT l.lender_id
   FROM listings l
  WHERE (l.id = conversations.listing_id))) AND (NOT is_blocked(renter_id, lender_id))));
CREATE POLICY "delete own photos" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'listing-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "upload own photos" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'listing-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "create own listing" ON "public"."listings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((lender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['lender'::text, 'both'::text])))))));
CREATE POLICY "delete own listing" ON "public"."listings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((lender_id = auth.uid()));
CREATE POLICY "read active listings" ON "public"."listings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((status = 'active'::text) OR (lender_id = auth.uid())));
CREATE POLICY "update own listing" ON "public"."listings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((lender_id = auth.uid())) WITH CHECK ((lender_id = auth.uid()));
CREATE POLICY "read photos" ON "public"."listing_photos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write own photos" ON "public"."listing_photos" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_photos.listing_id) AND (l.lender_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_photos.listing_id) AND (l.lender_id = auth.uid())))));
CREATE POLICY "read own messages" ON "public"."messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((auth.uid() = c.renter_id) OR (auth.uid() = c.lender_id))))));
CREATE POLICY "send in own conversations" ON "public"."messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((auth.uid() = c.renter_id) OR (auth.uid() = c.lender_id)) AND (NOT is_blocked(c.renter_id, c.lender_id)))))));
CREATE POLICY "manage own blocks" ON "public"."blocks" AS PERMISSIVE FOR ALL TO "authenticated" USING ((blocker_id = auth.uid())) WITH CHECK ((blocker_id = auth.uid()));
CREATE POLICY "own outcomes" ON "public"."rental_outcomes" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "file reports" ON "public"."reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((reporter_id = auth.uid()));
CREATE POLICY "manage own saved listings" ON "public"."saved_listings" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "manage own saved studios" ON "public"."saved_studios" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "add own events" ON "public"."listing_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "create rental in own conversation" ON "public"."rentals" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((((auth.uid() = renter_id) OR (auth.uid() = lender_id)) AND (updated_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = rentals.conversation_id) AND (c.listing_id = rentals.listing_id) AND (c.renter_id = rentals.renter_id) AND (c.lender_id = rentals.lender_id))))));
CREATE POLICY "read own rentals" ON "public"."rentals" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((auth.uid() = renter_id) OR (auth.uid() = lender_id)));
CREATE POLICY "update own rentals" ON "public"."rentals" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((auth.uid() = renter_id) OR (auth.uid() = lender_id))) WITH CHECK ((((auth.uid() = renter_id) OR (auth.uid() = lender_id)) AND (updated_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = rentals.conversation_id) AND (c.listing_id = rentals.listing_id) AND (c.renter_id = rentals.renter_id) AND (c.lender_id = rentals.lender_id))))));
CREATE POLICY "read profiles" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "update own profile" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "manage own private profile" ON "public"."private_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "read cities" ON "public"."us_cities" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);
CREATE POLICY "manage own conversation reads" ON "public"."conversation_reads" AS PERMISSIVE FOR ALL TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_reads.conversation_id) AND ((auth.uid() = c.renter_id) OR (auth.uid() = c.lender_id)))))));
CREATE POLICY "read own accessory declarations" ON "public"."accessory_declarations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));
CREATE POLICY "read own listing declarations" ON "public"."listing_declarations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));
CREATE POLICY "add own suggestion events" ON "public"."suggestion_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = auth.uid()) AND ((listing_id IS NULL) OR (EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = suggestion_events.listing_id) AND (l.lender_id = auth.uid())))))));
GRANT INSERT ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."listing_measurements" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."listing_measurements" TO "anon";
GRANT SELECT ON TABLE public."listing_measurements" TO "anon";
GRANT UPDATE ON TABLE public."listing_measurements" TO "anon";
GRANT DELETE ON TABLE public."listing_measurements" TO "anon";
GRANT TRUNCATE ON TABLE public."listing_measurements" TO "anon";
GRANT REFERENCES ON TABLE public."listing_measurements" TO "anon";
GRANT TRIGGER ON TABLE public."listing_measurements" TO "anon";
GRANT INSERT ON TABLE public."listing_measurements" TO "authenticated";
GRANT SELECT ON TABLE public."listing_measurements" TO "authenticated";
GRANT UPDATE ON TABLE public."listing_measurements" TO "authenticated";
GRANT DELETE ON TABLE public."listing_measurements" TO "authenticated";
GRANT TRUNCATE ON TABLE public."listing_measurements" TO "authenticated";
GRANT REFERENCES ON TABLE public."listing_measurements" TO "authenticated";
GRANT TRIGGER ON TABLE public."listing_measurements" TO "authenticated";
GRANT INSERT ON TABLE public."listing_measurements" TO "service_role";
GRANT SELECT ON TABLE public."listing_measurements" TO "service_role";
GRANT UPDATE ON TABLE public."listing_measurements" TO "service_role";
GRANT DELETE ON TABLE public."listing_measurements" TO "service_role";
GRANT TRUNCATE ON TABLE public."listing_measurements" TO "service_role";
GRANT REFERENCES ON TABLE public."listing_measurements" TO "service_role";
GRANT TRIGGER ON TABLE public."listing_measurements" TO "service_role";
GRANT INSERT ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."availability" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."availability" TO "anon";
GRANT SELECT ON TABLE public."availability" TO "anon";
GRANT UPDATE ON TABLE public."availability" TO "anon";
GRANT DELETE ON TABLE public."availability" TO "anon";
GRANT TRUNCATE ON TABLE public."availability" TO "anon";
GRANT REFERENCES ON TABLE public."availability" TO "anon";
GRANT TRIGGER ON TABLE public."availability" TO "anon";
GRANT INSERT ON TABLE public."availability" TO "authenticated";
GRANT SELECT ON TABLE public."availability" TO "authenticated";
GRANT UPDATE ON TABLE public."availability" TO "authenticated";
GRANT DELETE ON TABLE public."availability" TO "authenticated";
GRANT TRUNCATE ON TABLE public."availability" TO "authenticated";
GRANT REFERENCES ON TABLE public."availability" TO "authenticated";
GRANT TRIGGER ON TABLE public."availability" TO "authenticated";
GRANT INSERT ON TABLE public."availability" TO "service_role";
GRANT SELECT ON TABLE public."availability" TO "service_role";
GRANT UPDATE ON TABLE public."availability" TO "service_role";
GRANT DELETE ON TABLE public."availability" TO "service_role";
GRANT TRUNCATE ON TABLE public."availability" TO "service_role";
GRANT REFERENCES ON TABLE public."availability" TO "service_role";
GRANT TRIGGER ON TABLE public."availability" TO "service_role";
GRANT INSERT ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."conversations" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."conversations" TO "anon";
GRANT SELECT ON TABLE public."conversations" TO "anon";
GRANT UPDATE ON TABLE public."conversations" TO "anon";
GRANT DELETE ON TABLE public."conversations" TO "anon";
GRANT TRUNCATE ON TABLE public."conversations" TO "anon";
GRANT REFERENCES ON TABLE public."conversations" TO "anon";
GRANT TRIGGER ON TABLE public."conversations" TO "anon";
GRANT INSERT ON TABLE public."conversations" TO "authenticated";
GRANT SELECT ON TABLE public."conversations" TO "authenticated";
GRANT UPDATE ON TABLE public."conversations" TO "authenticated";
GRANT DELETE ON TABLE public."conversations" TO "authenticated";
GRANT TRUNCATE ON TABLE public."conversations" TO "authenticated";
GRANT REFERENCES ON TABLE public."conversations" TO "authenticated";
GRANT TRIGGER ON TABLE public."conversations" TO "authenticated";
GRANT INSERT ON TABLE public."conversations" TO "service_role";
GRANT SELECT ON TABLE public."conversations" TO "service_role";
GRANT UPDATE ON TABLE public."conversations" TO "service_role";
GRANT DELETE ON TABLE public."conversations" TO "service_role";
GRANT TRUNCATE ON TABLE public."conversations" TO "service_role";
GRANT REFERENCES ON TABLE public."conversations" TO "service_role";
GRANT TRIGGER ON TABLE public."conversations" TO "service_role";
GRANT INSERT ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."listings" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."listings" TO "anon";
GRANT SELECT ON TABLE public."listings" TO "anon";
GRANT UPDATE ON TABLE public."listings" TO "anon";
GRANT DELETE ON TABLE public."listings" TO "anon";
GRANT TRUNCATE ON TABLE public."listings" TO "anon";
GRANT REFERENCES ON TABLE public."listings" TO "anon";
GRANT TRIGGER ON TABLE public."listings" TO "anon";
GRANT INSERT ON TABLE public."listings" TO "authenticated";
GRANT SELECT ON TABLE public."listings" TO "authenticated";
GRANT UPDATE ON TABLE public."listings" TO "authenticated";
GRANT DELETE ON TABLE public."listings" TO "authenticated";
GRANT TRUNCATE ON TABLE public."listings" TO "authenticated";
GRANT REFERENCES ON TABLE public."listings" TO "authenticated";
GRANT TRIGGER ON TABLE public."listings" TO "authenticated";
GRANT INSERT ON TABLE public."listings" TO "service_role";
GRANT SELECT ON TABLE public."listings" TO "service_role";
GRANT UPDATE ON TABLE public."listings" TO "service_role";
GRANT DELETE ON TABLE public."listings" TO "service_role";
GRANT TRUNCATE ON TABLE public."listings" TO "service_role";
GRANT REFERENCES ON TABLE public."listings" TO "service_role";
GRANT TRIGGER ON TABLE public."listings" TO "service_role";
GRANT INSERT ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."listing_photos" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."listing_photos" TO "anon";
GRANT SELECT ON TABLE public."listing_photos" TO "anon";
GRANT UPDATE ON TABLE public."listing_photos" TO "anon";
GRANT DELETE ON TABLE public."listing_photos" TO "anon";
GRANT TRUNCATE ON TABLE public."listing_photos" TO "anon";
GRANT REFERENCES ON TABLE public."listing_photos" TO "anon";
GRANT TRIGGER ON TABLE public."listing_photos" TO "anon";
GRANT INSERT ON TABLE public."listing_photos" TO "authenticated";
GRANT SELECT ON TABLE public."listing_photos" TO "authenticated";
GRANT UPDATE ON TABLE public."listing_photos" TO "authenticated";
GRANT DELETE ON TABLE public."listing_photos" TO "authenticated";
GRANT TRUNCATE ON TABLE public."listing_photos" TO "authenticated";
GRANT REFERENCES ON TABLE public."listing_photos" TO "authenticated";
GRANT TRIGGER ON TABLE public."listing_photos" TO "authenticated";
GRANT INSERT ON TABLE public."listing_photos" TO "service_role";
GRANT SELECT ON TABLE public."listing_photos" TO "service_role";
GRANT UPDATE ON TABLE public."listing_photos" TO "service_role";
GRANT DELETE ON TABLE public."listing_photos" TO "service_role";
GRANT TRUNCATE ON TABLE public."listing_photos" TO "service_role";
GRANT REFERENCES ON TABLE public."listing_photos" TO "service_role";
GRANT TRIGGER ON TABLE public."listing_photos" TO "service_role";
GRANT INSERT ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."messages" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."messages" TO "anon";
GRANT SELECT ON TABLE public."messages" TO "anon";
GRANT UPDATE ON TABLE public."messages" TO "anon";
GRANT DELETE ON TABLE public."messages" TO "anon";
GRANT TRUNCATE ON TABLE public."messages" TO "anon";
GRANT REFERENCES ON TABLE public."messages" TO "anon";
GRANT TRIGGER ON TABLE public."messages" TO "anon";
GRANT INSERT ON TABLE public."messages" TO "authenticated";
GRANT SELECT ON TABLE public."messages" TO "authenticated";
GRANT UPDATE ON TABLE public."messages" TO "authenticated";
GRANT DELETE ON TABLE public."messages" TO "authenticated";
GRANT TRUNCATE ON TABLE public."messages" TO "authenticated";
GRANT REFERENCES ON TABLE public."messages" TO "authenticated";
GRANT TRIGGER ON TABLE public."messages" TO "authenticated";
GRANT INSERT ON TABLE public."messages" TO "service_role";
GRANT SELECT ON TABLE public."messages" TO "service_role";
GRANT UPDATE ON TABLE public."messages" TO "service_role";
GRANT DELETE ON TABLE public."messages" TO "service_role";
GRANT TRUNCATE ON TABLE public."messages" TO "service_role";
GRANT REFERENCES ON TABLE public."messages" TO "service_role";
GRANT TRIGGER ON TABLE public."messages" TO "service_role";
GRANT INSERT ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."blocks" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."blocks" TO "anon";
GRANT SELECT ON TABLE public."blocks" TO "anon";
GRANT UPDATE ON TABLE public."blocks" TO "anon";
GRANT DELETE ON TABLE public."blocks" TO "anon";
GRANT TRUNCATE ON TABLE public."blocks" TO "anon";
GRANT REFERENCES ON TABLE public."blocks" TO "anon";
GRANT TRIGGER ON TABLE public."blocks" TO "anon";
GRANT INSERT ON TABLE public."blocks" TO "authenticated";
GRANT SELECT ON TABLE public."blocks" TO "authenticated";
GRANT UPDATE ON TABLE public."blocks" TO "authenticated";
GRANT DELETE ON TABLE public."blocks" TO "authenticated";
GRANT TRUNCATE ON TABLE public."blocks" TO "authenticated";
GRANT REFERENCES ON TABLE public."blocks" TO "authenticated";
GRANT TRIGGER ON TABLE public."blocks" TO "authenticated";
GRANT INSERT ON TABLE public."blocks" TO "service_role";
GRANT SELECT ON TABLE public."blocks" TO "service_role";
GRANT UPDATE ON TABLE public."blocks" TO "service_role";
GRANT DELETE ON TABLE public."blocks" TO "service_role";
GRANT TRUNCATE ON TABLE public."blocks" TO "service_role";
GRANT REFERENCES ON TABLE public."blocks" TO "service_role";
GRANT TRIGGER ON TABLE public."blocks" TO "service_role";
GRANT INSERT ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."rental_outcomes" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."rental_outcomes" TO "anon";
GRANT SELECT ON TABLE public."rental_outcomes" TO "anon";
GRANT UPDATE ON TABLE public."rental_outcomes" TO "anon";
GRANT DELETE ON TABLE public."rental_outcomes" TO "anon";
GRANT TRUNCATE ON TABLE public."rental_outcomes" TO "anon";
GRANT REFERENCES ON TABLE public."rental_outcomes" TO "anon";
GRANT TRIGGER ON TABLE public."rental_outcomes" TO "anon";
GRANT INSERT ON TABLE public."rental_outcomes" TO "authenticated";
GRANT SELECT ON TABLE public."rental_outcomes" TO "authenticated";
GRANT UPDATE ON TABLE public."rental_outcomes" TO "authenticated";
GRANT DELETE ON TABLE public."rental_outcomes" TO "authenticated";
GRANT TRUNCATE ON TABLE public."rental_outcomes" TO "authenticated";
GRANT REFERENCES ON TABLE public."rental_outcomes" TO "authenticated";
GRANT TRIGGER ON TABLE public."rental_outcomes" TO "authenticated";
GRANT INSERT ON TABLE public."rental_outcomes" TO "service_role";
GRANT SELECT ON TABLE public."rental_outcomes" TO "service_role";
GRANT UPDATE ON TABLE public."rental_outcomes" TO "service_role";
GRANT DELETE ON TABLE public."rental_outcomes" TO "service_role";
GRANT TRUNCATE ON TABLE public."rental_outcomes" TO "service_role";
GRANT REFERENCES ON TABLE public."rental_outcomes" TO "service_role";
GRANT TRIGGER ON TABLE public."rental_outcomes" TO "service_role";
GRANT INSERT ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."reports" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."reports" TO "anon";
GRANT SELECT ON TABLE public."reports" TO "anon";
GRANT UPDATE ON TABLE public."reports" TO "anon";
GRANT DELETE ON TABLE public."reports" TO "anon";
GRANT TRUNCATE ON TABLE public."reports" TO "anon";
GRANT REFERENCES ON TABLE public."reports" TO "anon";
GRANT TRIGGER ON TABLE public."reports" TO "anon";
GRANT INSERT ON TABLE public."reports" TO "authenticated";
GRANT SELECT ON TABLE public."reports" TO "authenticated";
GRANT UPDATE ON TABLE public."reports" TO "authenticated";
GRANT DELETE ON TABLE public."reports" TO "authenticated";
GRANT TRUNCATE ON TABLE public."reports" TO "authenticated";
GRANT REFERENCES ON TABLE public."reports" TO "authenticated";
GRANT TRIGGER ON TABLE public."reports" TO "authenticated";
GRANT INSERT ON TABLE public."reports" TO "service_role";
GRANT SELECT ON TABLE public."reports" TO "service_role";
GRANT UPDATE ON TABLE public."reports" TO "service_role";
GRANT DELETE ON TABLE public."reports" TO "service_role";
GRANT TRUNCATE ON TABLE public."reports" TO "service_role";
GRANT REFERENCES ON TABLE public."reports" TO "service_role";
GRANT TRIGGER ON TABLE public."reports" TO "service_role";
GRANT INSERT ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."saved_listings" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."saved_listings" TO "anon";
GRANT SELECT ON TABLE public."saved_listings" TO "anon";
GRANT UPDATE ON TABLE public."saved_listings" TO "anon";
GRANT DELETE ON TABLE public."saved_listings" TO "anon";
GRANT TRUNCATE ON TABLE public."saved_listings" TO "anon";
GRANT REFERENCES ON TABLE public."saved_listings" TO "anon";
GRANT TRIGGER ON TABLE public."saved_listings" TO "anon";
GRANT INSERT ON TABLE public."saved_listings" TO "authenticated";
GRANT SELECT ON TABLE public."saved_listings" TO "authenticated";
GRANT UPDATE ON TABLE public."saved_listings" TO "authenticated";
GRANT DELETE ON TABLE public."saved_listings" TO "authenticated";
GRANT TRUNCATE ON TABLE public."saved_listings" TO "authenticated";
GRANT REFERENCES ON TABLE public."saved_listings" TO "authenticated";
GRANT TRIGGER ON TABLE public."saved_listings" TO "authenticated";
GRANT INSERT ON TABLE public."saved_listings" TO "service_role";
GRANT SELECT ON TABLE public."saved_listings" TO "service_role";
GRANT UPDATE ON TABLE public."saved_listings" TO "service_role";
GRANT DELETE ON TABLE public."saved_listings" TO "service_role";
GRANT TRUNCATE ON TABLE public."saved_listings" TO "service_role";
GRANT REFERENCES ON TABLE public."saved_listings" TO "service_role";
GRANT TRIGGER ON TABLE public."saved_listings" TO "service_role";
GRANT INSERT ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."saved_studios" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."saved_studios" TO "anon";
GRANT SELECT ON TABLE public."saved_studios" TO "anon";
GRANT UPDATE ON TABLE public."saved_studios" TO "anon";
GRANT DELETE ON TABLE public."saved_studios" TO "anon";
GRANT TRUNCATE ON TABLE public."saved_studios" TO "anon";
GRANT REFERENCES ON TABLE public."saved_studios" TO "anon";
GRANT TRIGGER ON TABLE public."saved_studios" TO "anon";
GRANT INSERT ON TABLE public."saved_studios" TO "authenticated";
GRANT SELECT ON TABLE public."saved_studios" TO "authenticated";
GRANT UPDATE ON TABLE public."saved_studios" TO "authenticated";
GRANT DELETE ON TABLE public."saved_studios" TO "authenticated";
GRANT TRUNCATE ON TABLE public."saved_studios" TO "authenticated";
GRANT REFERENCES ON TABLE public."saved_studios" TO "authenticated";
GRANT TRIGGER ON TABLE public."saved_studios" TO "authenticated";
GRANT INSERT ON TABLE public."saved_studios" TO "service_role";
GRANT SELECT ON TABLE public."saved_studios" TO "service_role";
GRANT UPDATE ON TABLE public."saved_studios" TO "service_role";
GRANT DELETE ON TABLE public."saved_studios" TO "service_role";
GRANT TRUNCATE ON TABLE public."saved_studios" TO "service_role";
GRANT REFERENCES ON TABLE public."saved_studios" TO "service_role";
GRANT TRIGGER ON TABLE public."saved_studios" TO "service_role";
GRANT INSERT ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."listing_events" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."listing_events" TO "anon";
GRANT SELECT ON TABLE public."listing_events" TO "anon";
GRANT UPDATE ON TABLE public."listing_events" TO "anon";
GRANT DELETE ON TABLE public."listing_events" TO "anon";
GRANT TRUNCATE ON TABLE public."listing_events" TO "anon";
GRANT REFERENCES ON TABLE public."listing_events" TO "anon";
GRANT TRIGGER ON TABLE public."listing_events" TO "anon";
GRANT INSERT ON TABLE public."listing_events" TO "authenticated";
GRANT SELECT ON TABLE public."listing_events" TO "authenticated";
GRANT UPDATE ON TABLE public."listing_events" TO "authenticated";
GRANT DELETE ON TABLE public."listing_events" TO "authenticated";
GRANT TRUNCATE ON TABLE public."listing_events" TO "authenticated";
GRANT REFERENCES ON TABLE public."listing_events" TO "authenticated";
GRANT TRIGGER ON TABLE public."listing_events" TO "authenticated";
GRANT INSERT ON TABLE public."listing_events" TO "service_role";
GRANT SELECT ON TABLE public."listing_events" TO "service_role";
GRANT UPDATE ON TABLE public."listing_events" TO "service_role";
GRANT DELETE ON TABLE public."listing_events" TO "service_role";
GRANT TRUNCATE ON TABLE public."listing_events" TO "service_role";
GRANT REFERENCES ON TABLE public."listing_events" TO "service_role";
GRANT TRIGGER ON TABLE public."listing_events" TO "service_role";
GRANT INSERT ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."rentals" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."rentals" TO "anon";
GRANT SELECT ON TABLE public."rentals" TO "anon";
GRANT UPDATE ON TABLE public."rentals" TO "anon";
GRANT DELETE ON TABLE public."rentals" TO "anon";
GRANT TRUNCATE ON TABLE public."rentals" TO "anon";
GRANT REFERENCES ON TABLE public."rentals" TO "anon";
GRANT TRIGGER ON TABLE public."rentals" TO "anon";
GRANT INSERT ON TABLE public."rentals" TO "authenticated";
GRANT SELECT ON TABLE public."rentals" TO "authenticated";
GRANT UPDATE ON TABLE public."rentals" TO "authenticated";
GRANT DELETE ON TABLE public."rentals" TO "authenticated";
GRANT TRUNCATE ON TABLE public."rentals" TO "authenticated";
GRANT REFERENCES ON TABLE public."rentals" TO "authenticated";
GRANT TRIGGER ON TABLE public."rentals" TO "authenticated";
GRANT INSERT ON TABLE public."rentals" TO "service_role";
GRANT SELECT ON TABLE public."rentals" TO "service_role";
GRANT UPDATE ON TABLE public."rentals" TO "service_role";
GRANT DELETE ON TABLE public."rentals" TO "service_role";
GRANT TRUNCATE ON TABLE public."rentals" TO "service_role";
GRANT REFERENCES ON TABLE public."rentals" TO "service_role";
GRANT TRIGGER ON TABLE public."rentals" TO "service_role";
GRANT INSERT ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."profiles" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."profiles" TO "anon";
GRANT SELECT ON TABLE public."profiles" TO "anon";
GRANT UPDATE ON TABLE public."profiles" TO "anon";
GRANT DELETE ON TABLE public."profiles" TO "anon";
GRANT TRUNCATE ON TABLE public."profiles" TO "anon";
GRANT REFERENCES ON TABLE public."profiles" TO "anon";
GRANT TRIGGER ON TABLE public."profiles" TO "anon";
GRANT INSERT ON TABLE public."profiles" TO "authenticated";
GRANT SELECT ON TABLE public."profiles" TO "authenticated";
GRANT UPDATE ON TABLE public."profiles" TO "authenticated";
GRANT DELETE ON TABLE public."profiles" TO "authenticated";
GRANT TRUNCATE ON TABLE public."profiles" TO "authenticated";
GRANT REFERENCES ON TABLE public."profiles" TO "authenticated";
GRANT TRIGGER ON TABLE public."profiles" TO "authenticated";
GRANT INSERT ON TABLE public."profiles" TO "service_role";
GRANT SELECT ON TABLE public."profiles" TO "service_role";
GRANT UPDATE ON TABLE public."profiles" TO "service_role";
GRANT DELETE ON TABLE public."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE public."profiles" TO "service_role";
GRANT REFERENCES ON TABLE public."profiles" TO "service_role";
GRANT TRIGGER ON TABLE public."profiles" TO "service_role";
GRANT INSERT ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."private_profiles" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."private_profiles" TO "anon";
GRANT SELECT ON TABLE public."private_profiles" TO "anon";
GRANT UPDATE ON TABLE public."private_profiles" TO "anon";
GRANT DELETE ON TABLE public."private_profiles" TO "anon";
GRANT TRUNCATE ON TABLE public."private_profiles" TO "anon";
GRANT REFERENCES ON TABLE public."private_profiles" TO "anon";
GRANT TRIGGER ON TABLE public."private_profiles" TO "anon";
GRANT INSERT ON TABLE public."private_profiles" TO "authenticated";
GRANT SELECT ON TABLE public."private_profiles" TO "authenticated";
GRANT UPDATE ON TABLE public."private_profiles" TO "authenticated";
GRANT DELETE ON TABLE public."private_profiles" TO "authenticated";
GRANT TRUNCATE ON TABLE public."private_profiles" TO "authenticated";
GRANT REFERENCES ON TABLE public."private_profiles" TO "authenticated";
GRANT TRIGGER ON TABLE public."private_profiles" TO "authenticated";
GRANT INSERT ON TABLE public."private_profiles" TO "service_role";
GRANT SELECT ON TABLE public."private_profiles" TO "service_role";
GRANT UPDATE ON TABLE public."private_profiles" TO "service_role";
GRANT DELETE ON TABLE public."private_profiles" TO "service_role";
GRANT TRUNCATE ON TABLE public."private_profiles" TO "service_role";
GRANT REFERENCES ON TABLE public."private_profiles" TO "service_role";
GRANT TRIGGER ON TABLE public."private_profiles" TO "service_role";
GRANT INSERT ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."us_cities" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."us_cities" TO "anon";
GRANT REFERENCES ON TABLE public."us_cities" TO "anon";
GRANT TRIGGER ON TABLE public."us_cities" TO "anon";
GRANT SELECT ON TABLE public."us_cities" TO "authenticated";
GRANT REFERENCES ON TABLE public."us_cities" TO "authenticated";
GRANT TRIGGER ON TABLE public."us_cities" TO "authenticated";
GRANT INSERT ON TABLE public."us_cities" TO "service_role";
GRANT SELECT ON TABLE public."us_cities" TO "service_role";
GRANT UPDATE ON TABLE public."us_cities" TO "service_role";
GRANT DELETE ON TABLE public."us_cities" TO "service_role";
GRANT TRUNCATE ON TABLE public."us_cities" TO "service_role";
GRANT REFERENCES ON TABLE public."us_cities" TO "service_role";
GRANT TRIGGER ON TABLE public."us_cities" TO "service_role";
GRANT INSERT ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."conversation_reads" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."conversation_reads" TO "anon";
GRANT SELECT ON TABLE public."conversation_reads" TO "anon";
GRANT UPDATE ON TABLE public."conversation_reads" TO "anon";
GRANT DELETE ON TABLE public."conversation_reads" TO "anon";
GRANT TRUNCATE ON TABLE public."conversation_reads" TO "anon";
GRANT REFERENCES ON TABLE public."conversation_reads" TO "anon";
GRANT TRIGGER ON TABLE public."conversation_reads" TO "anon";
GRANT INSERT ON TABLE public."conversation_reads" TO "authenticated";
GRANT SELECT ON TABLE public."conversation_reads" TO "authenticated";
GRANT UPDATE ON TABLE public."conversation_reads" TO "authenticated";
GRANT DELETE ON TABLE public."conversation_reads" TO "authenticated";
GRANT TRUNCATE ON TABLE public."conversation_reads" TO "authenticated";
GRANT REFERENCES ON TABLE public."conversation_reads" TO "authenticated";
GRANT TRIGGER ON TABLE public."conversation_reads" TO "authenticated";
GRANT INSERT ON TABLE public."conversation_reads" TO "service_role";
GRANT SELECT ON TABLE public."conversation_reads" TO "service_role";
GRANT UPDATE ON TABLE public."conversation_reads" TO "service_role";
GRANT DELETE ON TABLE public."conversation_reads" TO "service_role";
GRANT TRUNCATE ON TABLE public."conversation_reads" TO "service_role";
GRANT REFERENCES ON TABLE public."conversation_reads" TO "service_role";
GRANT TRIGGER ON TABLE public."conversation_reads" TO "service_role";
GRANT INSERT ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."accessory_declarations" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."accessory_declarations" TO "service_role";
GRANT SELECT ON TABLE public."accessory_declarations" TO "service_role";
GRANT UPDATE ON TABLE public."accessory_declarations" TO "service_role";
GRANT DELETE ON TABLE public."accessory_declarations" TO "service_role";
GRANT TRUNCATE ON TABLE public."accessory_declarations" TO "service_role";
GRANT REFERENCES ON TABLE public."accessory_declarations" TO "service_role";
GRANT TRIGGER ON TABLE public."accessory_declarations" TO "service_role";
GRANT SELECT ON TABLE public."accessory_declarations" TO "authenticated";
GRANT INSERT ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."listing_declarations" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."listing_declarations" TO "service_role";
GRANT SELECT ON TABLE public."listing_declarations" TO "service_role";
GRANT UPDATE ON TABLE public."listing_declarations" TO "service_role";
GRANT DELETE ON TABLE public."listing_declarations" TO "service_role";
GRANT TRUNCATE ON TABLE public."listing_declarations" TO "service_role";
GRANT REFERENCES ON TABLE public."listing_declarations" TO "service_role";
GRANT TRIGGER ON TABLE public."listing_declarations" TO "service_role";
GRANT SELECT ON TABLE public."listing_declarations" TO "authenticated";
GRANT INSERT ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."suggestion_events" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."suggestion_events" TO "service_role";
GRANT SELECT ON TABLE public."suggestion_events" TO "service_role";
GRANT UPDATE ON TABLE public."suggestion_events" TO "service_role";
GRANT DELETE ON TABLE public."suggestion_events" TO "service_role";
GRANT TRUNCATE ON TABLE public."suggestion_events" TO "service_role";
GRANT REFERENCES ON TABLE public."suggestion_events" TO "service_role";
GRANT TRIGGER ON TABLE public."suggestion_events" TO "service_role";
GRANT INSERT ON TABLE public."suggestion_events" TO "authenticated";
REVOKE ALL ON FUNCTION public.declaration_request_ip() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_blocked(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.keep_ai_review_needed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.listings_nearby(double precision,double precision,double precision,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_activity_seen() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_block_peer_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_accessory_declaration(text,integer,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_listing_declaration(uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rentals_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_accessory_declaration() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_cities(text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_listings_similar(text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_conversation_dates(uuid,date,date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.studio_rental_count(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.studio_reply_minutes(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_listings_similar(text,integer) TO "postgres";
GRANT EXECUTE ON FUNCTION public.search_listings_similar(text,integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.search_listings_similar(text,integer) TO "service_role";
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid,uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid,uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid,uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid,uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public.listings_nearby(double precision,double precision,double precision,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.listings_nearby(double precision,double precision,double precision,text) TO "postgres";
GRANT EXECUTE ON FUNCTION public.listings_nearby(double precision,double precision,double precision,text) TO "anon";
GRANT EXECUTE ON FUNCTION public.listings_nearby(double precision,double precision,double precision,text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.listings_nearby(double precision,double precision,double precision,text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public.mark_activity_seen() TO "postgres";
GRANT EXECUTE ON FUNCTION public.mark_activity_seen() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.mark_activity_seen() TO "service_role";
GRANT EXECUTE ON FUNCTION public.keep_ai_review_needed() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_ai_review_needed() TO "postgres";
GRANT EXECUTE ON FUNCTION public.keep_ai_review_needed() TO "anon";
GRANT EXECUTE ON FUNCTION public.keep_ai_review_needed() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.keep_ai_review_needed() TO "service_role";
GRANT EXECUTE ON FUNCTION public.studio_rental_count(uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.studio_rental_count(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.studio_rental_count(uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public.declaration_request_ip() TO "postgres";
GRANT EXECUTE ON FUNCTION public.declaration_request_ip() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.declaration_request_ip() TO "service_role";
GRANT EXECUTE ON FUNCTION public.my_block_peer_ids() TO "postgres";
GRANT EXECUTE ON FUNCTION public.my_block_peer_ids() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.my_block_peer_ids() TO "service_role";
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "postgres";
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "anon";
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO "service_role";
GRANT EXECUTE ON FUNCTION public.rentals_set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rentals_set_updated_at() TO "postgres";
GRANT EXECUTE ON FUNCTION public.rentals_set_updated_at() TO "anon";
GRANT EXECUTE ON FUNCTION public.rentals_set_updated_at() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.rentals_set_updated_at() TO "service_role";
GRANT EXECUTE ON FUNCTION public.search_cities(text,integer) TO "postgres";
GRANT EXECUTE ON FUNCTION public.search_cities(text,integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.search_cities(text,integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.search_cities(text,integer) TO "service_role";
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "postgres";
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "anon";
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO "service_role";
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "postgres";
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "anon";
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO "service_role";
GRANT EXECUTE ON FUNCTION public.studio_reply_minutes(uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION public.studio_reply_minutes(uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.studio_reply_minutes(uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public.set_conversation_dates(uuid,date,date) TO "postgres";
GRANT EXECUTE ON FUNCTION public.set_conversation_dates(uuid,date,date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.set_conversation_dates(uuid,date,date) TO "service_role";
GRANT EXECUTE ON FUNCTION public.record_accessory_declaration(text,integer,text) TO "postgres";
GRANT EXECUTE ON FUNCTION public.record_accessory_declaration(text,integer,text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.record_accessory_declaration(text,integer,text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.record_listing_declaration(uuid,integer) TO "postgres";
GRANT EXECUTE ON FUNCTION public.record_listing_declaration(uuid,integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.record_listing_declaration(uuid,integer) TO "service_role";
GRANT EXECUTE ON FUNCTION public.require_accessory_declaration() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_accessory_declaration() TO "postgres";
GRANT EXECUTE ON FUNCTION public.require_accessory_declaration() TO "anon";
GRANT EXECUTE ON FUNCTION public.require_accessory_declaration() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.require_accessory_declaration() TO "service_role";
CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "service_role";
-- Original schema ACL: {pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."messages";
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."rentals";
