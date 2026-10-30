-- Step 1A: structure from the live read-only reference; no account data.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- Keep all object references deterministic while building constraints/indexes.
SET LOCAL search_path = public, extensions, pg_catalog;

CREATE TABLE public."accessory_declarations" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "email" text,
  "full_legal_name" text NOT NULL,
  "declaration_version" integer NOT NULL,
  "app_version" text,
  "city" text,
  "ip" text,
  "user_agent" text,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."availability" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL
);

CREATE TABLE public."blocks" (
  "blocker_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL
);

CREATE TABLE public."conversation_reads" (
  "user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."conversations" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "renter_id" uuid NOT NULL,
  "lender_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "requested_start" date,
  "requested_end" date
);

CREATE TABLE public."listing_declarations" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "listing_id" uuid,
  "user_id" uuid,
  "declaration_version" integer NOT NULL,
  "ip" text,
  "session_id" text,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."listing_events" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."listing_measurements" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "label" text NOT NULL,
  "value" numeric NOT NULL,
  "unit" text NOT NULL
);

CREATE TABLE public."listing_photos" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "storage_path" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "slot" text
);

CREATE TABLE public."listings" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
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
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "retail_value" numeric,
  "deposit_note" text,
  "item_type" text,
  "price_usd" numeric,
  "listing_styles" text[] DEFAULT '{}'::text[] NOT NULL,
  "garment_type" text,
  "ai_review_needed" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."messages" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
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
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "fit_profile" text,
  "style_interests" text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "display_name" text DEFAULT ''::text NOT NULL,
  "role" text DEFAULT 'renter'::text NOT NULL,
  "city" text,
  "approx_lat" double precision,
  "approx_lng" double precision,
  "adult_confirmed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "studio_name" text,
  "studio_handle" text,
  "studio_bio" text,
  "style_tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "pickup_area" text
);

CREATE TABLE public."rental_outcomes" (
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "happened" boolean NOT NULL,
  "answered_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."rentals" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "renter_id" uuid NOT NULL,
  "lender_id" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "start_date" date,
  "end_date" date,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."reports" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "reporter_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL,
  "details" text
);

CREATE TABLE public."saved_listings" (
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."saved_studios" (
  "user_id" uuid NOT NULL,
  "lender_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."suggestion_events" (
  "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "listing_id" uuid,
  "field" text NOT NULL,
  "label" text NOT NULL,
  "action" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT pg_catalog.now() NOT NULL
);

CREATE TABLE public."us_cities" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "state" text NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL
);

ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_name_check" CHECK (char_length(btrim(full_legal_name)) >= 2 AND char_length(btrim(full_legal_name)) <= 120);
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_pkey" PRIMARY KEY (id);
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_version_check" CHECK (declaration_version > 0);
ALTER TABLE public."availability" ADD CONSTRAINT "availability_check" CHECK (end_date >= start_date);
ALTER TABLE public."availability" ADD CONSTRAINT "availability_pkey" PRIMARY KEY (id);
ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_pkey" PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_pkey" PRIMARY KEY (user_id, conversation_id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_renter_id_key" UNIQUE (listing_id, renter_id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_pkey" PRIMARY KEY (id);
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_requested_dates_check" CHECK (requested_start IS NULL AND requested_end IS NULL OR requested_start IS NOT NULL AND requested_end IS NOT NULL AND requested_end >= requested_start);
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_version_check" CHECK (declaration_version > 0);
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_type_check" CHECK (type = ANY (ARRAY['view'::text, 'save'::text, 'message'::text]));
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_label_check" CHECK (char_length(label) >= 1 AND char_length(label) <= 40);
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_unit_check" CHECK (unit = ANY (ARRAY['cm'::text, 'in'::text]));
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_value_check" CHECK (value > 0::numeric AND value < 1000::numeric);
ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_pkey" PRIMARY KEY (id);
ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_slot_check" CHECK (slot IS NULL OR (slot = ANY (ARRAY['front'::text, 'back'::text, 'close_up'::text, 'size_tag'::text, 'extra_1'::text, 'extra_2'::text])));
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
ALTER TABLE public."messages" ADD CONSTRAINT "messages_body_check" CHECK (char_length(body) >= 1 AND char_length(body) <= 2000);
ALTER TABLE public."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_chest_cm_range" CHECK (chest_cm > 0::numeric AND chest_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_fit_profile_check" CHECK (fit_profile = ANY (ARRAY['man'::text, 'woman'::text]));
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_height_cm_range" CHECK (height_cm > 0::numeric AND height_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_hips_cm_range" CHECK (hips_cm > 0::numeric AND hips_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_inseam_cm_range" CHECK (inseam_cm > 0::numeric AND inseam_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_shoulder_cm_range" CHECK (shoulder_cm > 0::numeric AND shoulder_cm < 300::numeric);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_style_interests_check" CHECK (style_interests <@ ARRAY['South Asian'::text, 'East Asian'::text, 'Southeast Asian'::text, 'Middle Eastern'::text, 'African'::text, 'Mexican & Latin American'::text, 'Country & Western'::text, 'Western formal'::text, 'Western casual'::text]);
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_waist_cm_range" CHECK (waist_cm > 0::numeric AND waist_cm < 300::numeric);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pickup_area_length" CHECK (char_length(pickup_area) <= 60);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['renter'::text, 'lender'::text, 'both'::text]));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_bio_length" CHECK (char_length(studio_bio) <= 200);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_handle_format" CHECK (studio_handle ~ '^[a-z0-9._]{3,30}$'::text);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_studio_name_length" CHECK (char_length(studio_name) >= 1 AND char_length(studio_name) <= 40);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_style_tags_check" CHECK (cardinality(style_tags) <= 5 AND style_tags <@ ARRAY['Minimalist'::text, 'Classic'::text, 'Vintage'::text, 'Streetwear'::text, 'Boho'::text, 'Glam'::text, 'Traditional'::text, 'Workwear'::text, 'Designer'::text, 'Plus size'::text, 'Petite'::text, 'Maternity'::text]);
ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_pkey" PRIMARY KEY (conversation_id, user_id);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_conversation_id_key" UNIQUE (conversation_id);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_dates_check" CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_pkey" PRIMARY KEY (id);
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_status_check" CHECK (status = ANY (ARRAY['active'::text, 'returned'::text, 'cancelled'::text]));
ALTER TABLE public."reports" ADD CONSTRAINT "reports_details_length" CHECK (char_length(details) <= 500);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_reason_check" CHECK (char_length(reason) <= 500);
ALTER TABLE public."reports" ADD CONSTRAINT "reports_target_type_check" CHECK (target_type = ANY (ARRAY['listing'::text, 'user'::text, 'message'::text]));
ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_pkey" PRIMARY KEY (user_id, listing_id);
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_not_self" CHECK (user_id <> lender_id);
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_pkey" PRIMARY KEY (user_id, lender_id);
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_action_check" CHECK (action = ANY (ARRAY['kept'::text, 'cleared'::text, 'edited'::text, 'picked'::text, 'removed'::text, 'kept_override'::text]));
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_field_check" CHECK (field = ANY (ARRAY['title'::text, 'category'::text, 'description'::text, 'style'::text, 'type_chip'::text, 'tier'::text]));
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_label_check" CHECK (char_length(label) <= 80);
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."us_cities" ADD CONSTRAINT "us_cities_pkey" PRIMARY KEY (id);
ALTER TABLE public."us_cities" ADD CONSTRAINT "us_cities_state_check" CHECK (state ~ '^[A-Z]{2}$'::text);
ALTER TABLE public."accessory_declarations" ADD CONSTRAINT "accessory_declarations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."availability" ADD CONSTRAINT "availability_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public."conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CONSTRAINT "conversations_renter_id_fkey" FOREIGN KEY (renter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;
ALTER TABLE public."listing_declarations" ADD CONSTRAINT "listing_declarations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."listing_events" ADD CONSTRAINT "listing_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."listing_measurements" ADD CONSTRAINT "listing_measurements_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."listings" ADD CONSTRAINT "listings_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."private_profiles" ADD CONSTRAINT "private_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public."rental_outcomes" ADD CONSTRAINT "rental_outcomes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_renter_id_fkey" FOREIGN KEY (renter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."rentals" ADD CONSTRAINT "rentals_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public."reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;
ALTER TABLE public."saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_lender_id_fkey" FOREIGN KEY (lender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."saved_studios" ADD CONSTRAINT "saved_studios_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public."suggestion_events" ADD CONSTRAINT "suggestion_events_listing_id_fkey" FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;
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

ALTER PUBLICATION "supabase_realtime" ADD TABLE public."messages";
ALTER PUBLICATION "supabase_realtime" ADD TABLE public."rentals";
SET LOCAL search_path = '';
