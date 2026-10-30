CREATE OR REPLACE FUNCTION public.declaration_request_ip()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), '');
$function$

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
end; $function$

CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$function$

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
end $function$

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
$function$

CREATE OR REPLACE FUNCTION public.mark_activity_seen()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.private_profiles (user_id, activity_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set activity_seen_at = now();
$function$

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  insert into public.conversation_reads (user_id, conversation_id, last_read_at)
  values (auth.uid(), p_conversation_id, now())
  on conflict (user_id, conversation_id) do update set last_read_at = now();
$function$

CREATE OR REPLACE FUNCTION public.my_block_peer_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select blocked_id from public.blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.blocks where blocked_id = auth.uid();
$function$

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
end $function$

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
end $function$

CREATE OR REPLACE FUNCTION public.rentals_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end; $function$

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
end $function$

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
$function$

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
$function$

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
end $function$

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
end $function$

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end; $function$

CREATE OR REPLACE FUNCTION public.studio_rental_count(p_lender_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::int from public.rentals r
  where r.lender_id = p_lender_id and r.status in ('active', 'returned');
$function$

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
$function$
