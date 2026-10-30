-- Internal trigger functions have no API EXECUTE grants (see foundation_access).
-- Auth signup runs before there is a JWT. This one trigger permits a NULL uid
-- only while firing on an actual INSERT into auth.users; a JWT cannot nominate
-- somebody else's profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lat double precision;
  v_lng double precision;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users'
     or tg_op <> 'INSERT' or pg_catalog.pg_trigger_depth() < 1
     or (v_uid is not null and v_uid <> new.id) then
    raise exception 'Invalid profile creation context' using errcode = '42501';
  end if;

  if new.raw_user_meta_data->>'approx_lat' ~ '^-?[0-9]{1,3}([.][0-9]+)?$'
     and new.raw_user_meta_data->>'approx_lng' ~ '^-?[0-9]{1,3}([.][0-9]+)?$' then
    v_lat := pg_catalog.round((new.raw_user_meta_data->>'approx_lat')::numeric, 2);
    v_lng := pg_catalog.round((new.raw_user_meta_data->>'approx_lng')::numeric, 2);
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_lat := null;
      v_lng := null;
    end if;
  end if;

  insert into public.profiles
    (id, display_name, role, adult_confirmed, city, approx_lat, approx_lng)
  values
    (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''),
     coalesce(new.raw_user_meta_data->>'role', 'renter'),
     coalesce((new.raw_user_meta_data->>'adult_confirmed')::boolean, false),
     nullif(new.raw_user_meta_data->>'city', ''), v_lat, v_lng);
  return new;
end;
$function$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

create or replace function public.rentals_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

create or replace function public.keep_ai_review_needed()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.ai_review_needed and not new.ai_review_needed
     and current_user in ('authenticated', 'anon') then
    new.ai_review_needed := true;
  end if;
  return new;
end;
$function$;

create or replace function public.require_accessory_declaration()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.category = 'Accessories' and new.status = 'active'
     and current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' or old.status is distinct from 'active'
          or old.category is distinct from new.category)
     and not exists (
       select 1 from public.accessory_declarations d
       where d.user_id = new.lender_id
     ) then
    raise exception 'Sign the accessory declaration before listing accessories.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create or replace function public.declaration_request_ip()
returns text
language sql
stable
set search_path = ''
as $function$
  select nullif(pg_catalog.btrim(pg_catalog.split_part(
    coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::json
      ->>'x-forwarded-for', ''), ',', 1)), '');
$function$;

-- Block helpers reveal only whether the caller's own pair is blocked and the
-- caller's own peer IDs. They cannot be used to inspect somebody else's graph.
create or replace function app_private.is_blocked(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or (v_uid is distinct from a and v_uid is distinct from b) then
    raise exception 'Not your block relationship' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
end;
$function$;

create or replace function public.my_block_peer_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return query
    select bl.blocked_id from public.blocks bl where bl.blocker_id = v_uid
    union
    select bl.blocker_id from public.blocks bl where bl.blocked_id = v_uid;
end;
$function$;

create or replace function public.record_accessory_declaration(
  p_full_legal_name text, p_declaration_version integer,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_headers json := nullif(pg_catalog.current_setting('request.headers', true), '')::json;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_full_legal_name, ''))) < 2 then
    raise exception 'Type your full legal name' using errcode = '22023';
  end if;
  if coalesce(p_declaration_version, 0) < 1 then
    raise exception 'Unknown declaration version' using errcode = '22023';
  end if;
  insert into public.accessory_declarations
    (user_id, email, full_legal_name, declaration_version, app_version,
     city, ip, user_agent, session_id)
  values
    (v_uid,
     coalesce(auth.jwt()->>'email', (select u.email from auth.users u where u.id = v_uid)),
     pg_catalog.left(pg_catalog.btrim(p_full_legal_name), 120), p_declaration_version,
     pg_catalog.left(p_app_version, 40),
     (select nullif(p.city, '') from public.profiles p where p.id = v_uid),
     public.declaration_request_ip(), pg_catalog.left(v_headers->>'user-agent', 400),
     auth.jwt()->>'session_id')
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.record_listing_declaration(
  p_listing_id uuid, p_declaration_version integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid
  ) then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  if coalesce(p_declaration_version, 0) < 1 then
    raise exception 'Unknown declaration version' using errcode = '22023';
  end if;
  insert into public.listing_declarations
    (listing_id, user_id, declaration_version, ip, session_id)
  values
    (p_listing_id, v_uid, p_declaration_version,
     public.declaration_request_ip(), auth.jwt()->>'session_id')
  returning id into v_id;
  return v_id;
end;
$function$;

-- Raw city rows have no API grants. This public reference-data RPC is the
-- explicit guest exception; auth.uid() is deliberately allowed to be NULL.
create or replace function public.search_cities(p_query text, p_limit integer default 20)
returns setof public.us_cities
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  return query
    select c.* from public.us_cities c
    where pg_catalog.char_length(pg_catalog.btrim(p_query)) >= 2
      and pg_catalog.lower(c.name) operator(pg_catalog.~>=~) pg_catalog.lower(pg_catalog.btrim(p_query))
      and pg_catalog.lower(c.name) operator(pg_catalog.~<~)
        (pg_catalog.lower(pg_catalog.btrim(p_query)) || pg_catalog.chr(1114111))
    order by c.name, c.state
    limit greatest(
      least(greatest(coalesce(p_limit, 20), 1), 100),
      (select pg_catalog.count(*) from public.us_cities e
       where pg_catalog.lower(e.name) = pg_catalog.lower(pg_catalog.btrim(p_query))));
end;
$function$;

create or replace function public.set_conversation_dates(
  p_conversation_id uuid, p_start date, p_end date
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Invalid dates' using errcode = '22023';
  end if;
  update public.conversations
    set requested_start = p_start, requested_end = p_end
    where id = p_conversation_id and renter_id = v_uid;
  if not found then
    raise exception 'Only the renter can set dates for this chat' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.conversation_reads (user_id, conversation_id, last_read_at)
  values (v_uid, p_conversation_id, pg_catalog.now())
  on conflict (user_id, conversation_id) do update set last_read_at = pg_catalog.now();
end;
$function$;

create or replace function public.mark_activity_seen()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.private_profiles (user_id, activity_seen_at)
  values (v_uid, pg_catalog.now())
  on conflict (user_id) do update set activity_seen_at = pg_catalog.now();
end;
$function$;

-- Renter INSERT authorization must inspect the lender's listing despite raw
-- owner-only RLS. It returns no listing data and is not an API callable helper.
create or replace function app_private.validate_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'conversations' or tg_op <> 'INSERT'
     or v_uid is null or new.renter_id <> v_uid or new.renter_id = new.lender_id then
    raise exception 'Invalid conversation' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.listings l
    where l.id = new.listing_id and l.lender_id = new.lender_id and l.status = 'active'
  ) or app_private.is_blocked(new.renter_id, new.lender_id) then
    raise exception 'Listing unavailable for conversation' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger rentals_set_updated_at before update on public.rentals
  for each row execute function public.rentals_set_updated_at();
create trigger private_profiles_set_updated_at before update on public.private_profiles
  for each row execute function public.set_updated_at();
create trigger listings_keep_ai_review_needed before update on public.listings
  for each row execute function public.keep_ai_review_needed();
create trigger listings_require_accessory_declaration before insert or update on public.listings
  for each row execute function public.require_accessory_declaration();
create trigger conversations_validate before insert on public.conversations
  for each row execute function app_private.validate_conversation();
