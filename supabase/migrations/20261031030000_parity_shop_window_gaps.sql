-- Migration: 20261031030000_parity_shop_window_gaps.sql
-- Step 4C parity gaps:
-- 1. my_blocked_users(): returns caller's blocked users with names (display or studio name)
-- 2. my_saved_listings(): returns saved pieces with is_available flag (paused/blocked -> false)
-- 3. get_studio(): adds is_own flag and since line (month and year only)

-- 1. Blocked users list with names for caller's own blocks
create or replace function public.my_blocked_users()
returns table (
  blocked_id uuid,
  display_name text,
  studio_name text,
  studio_handle text,
  city text
)
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

  return query
  select
    b.blocked_id,
    coalesce(nullif(p.display_name, ''), nullif(p.studio_name, ''), 'Dzirent member') as display_name,
    p.studio_name,
    p.studio_handle,
    p.city
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = v_uid;
end;
$function$;

revoke all on function public.my_blocked_users() from public;
grant execute on function public.my_blocked_users() to authenticated;

-- 2. Saved pieces list with is_available flag (paused / blocked listings marked unavailable)
create or replace function public.my_saved_listings(
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  listing_id uuid,
  is_available boolean,
  title text,
  price numeric,
  distance integer,
  city text,
  category text,
  cover_photo_path text,
  studio_name text,
  studio_handle text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return query
  select
    sl.listing_id,
    case
      when l.id is not null
       and l.status = 'active'
       and not exists (
         select 1 from public.blocks bl
         where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
            or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
       ) then true
      else false
    end as is_available,
    case
      when l.id is not null
       and l.status = 'active'
       and not exists (
         select 1 from public.blocks bl
         where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
            or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
       ) then l.title
      else null
    end as title,
    case
      when l.id is not null and l.status = 'active' then l.price_usd
      else null
    end as price,
    case
      when l.id is not null and l.status = 'active' and p_lat is not null and p_lng is not null then
        pg_catalog.round(
          3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lat - p_lat) / 2.0), 2) +
            pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(l.approx_lat)) *
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lng - p_lng) / 2.0), 2)
          ))
        )::integer
      else null
    end as distance,
    case
      when l.id is not null and l.status = 'active' then coalesce(nullif(l.city, ''), nullif(p.city, ''))
      else null
    end as city,
    case
      when l.id is not null and l.status = 'active' then l.category
      else null
    end as category,
    case
      when l.id is not null and l.status = 'active' then (
        select lp.storage_path
        from public.listing_photos lp
        where lp.listing_id = l.id
        order by lp.position asc, lp.id asc
        limit 1
      )
      else null
    end as cover_photo_path,
    case
      when l.id is not null and l.status = 'active' then coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio')
      else null
    end as studio_name,
    case
      when l.id is not null and l.status = 'active' then p.studio_handle
      else null
    end as studio_handle,
    sl.created_at
  from public.saved_listings sl
  left join public.listings l on l.id = sl.listing_id
  left join public.profiles p on p.id = l.lender_id
  where sl.user_id = v_uid
  order by sl.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

revoke all on function public.my_saved_listings(double precision, double precision, integer, integer) from public;
grant execute on function public.my_saved_listings(double precision, double precision, integer, integer) to authenticated;

-- 3. Studio page: add is_own flag and since line (month and year only)
drop function if exists public.get_studio(text, double precision, double precision);

create or replace function public.get_studio(
  p_handle text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  studio_name text,
  studio_handle text,
  studio_bio text,
  style_tags text[],
  city text,
  pickup_area text,
  rental_count integer,
  reply_minutes integer,
  is_saved boolean,
  listings jsonb,
  is_own boolean,
  since text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lender record;
  v_rental_count integer;
  v_reply_minutes integer;
  v_is_saved boolean;
  v_listings jsonb;
  v_is_own boolean;
  v_since text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select p.* into v_lender
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found then
    return;
  end if;

  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender.id)
       or (bl.blocker_id = v_lender.id and bl.blocked_id = v_uid)
  ) then
    return;
  end if;

  v_is_own := (v_lender.id = v_uid);
  v_since := case
    when v_lender.created_at is not null then 'Since ' || to_char(v_lender.created_at, 'Mon YYYY')
    else null
  end;

  select pg_catalog.count(*)::integer into v_rental_count
  from public.rentals r
  where r.lender_id = v_lender.id and r.status in ('active', 'returned');

  with asked as (
    select c.id,
           (select pg_catalog.min(m.created_at) from public.messages m
            where m.conversation_id = c.id and m.sender_id = c.renter_id) as asked_at
    from public.conversations c
    where c.lender_id = v_lender.id and c.created_at > pg_catalog.now() - interval '90 days'
  ), replies as (
    select pg_catalog.date_part('epoch', (
             (select pg_catalog.min(m.created_at) from public.messages m
              where m.conversation_id = a.id and m.sender_id = v_lender.id and m.created_at > a.asked_at)
             - a.asked_at)) / 60 as minutes
    from asked a
    where a.asked_at is not null
  )
  select case when pg_catalog.count(minutes) >= 3
              then pg_catalog.round(pg_catalog.percentile_cont(0.5) within group (order by minutes))::integer end
  into v_reply_minutes
  from replies;

  select exists (
    select 1 from public.saved_studios ss
    where ss.user_id = v_uid and ss.lender_id = v_lender.id
  ) into v_is_saved;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', act.id,
        'title', act.title,
        'price', act.price_usd,
        'distance', case
          when p_lat is not null and p_lng is not null then
            pg_catalog.round(
              3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
                pg_catalog.power(pg_catalog.sin(pg_catalog.radians(act.approx_lat - p_lat) / 2.0), 2) +
                pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(act.approx_lat)) *
                pg_catalog.power(pg_catalog.sin(pg_catalog.radians(act.approx_lng - p_lng) / 2.0), 2)
              ))
            )::integer
          else null
        end,
        'city', coalesce(nullif(act.city, ''), nullif(v_lender.city, '')),
        'category', act.category,
        'cover_photo_path', (
          select lp.storage_path
          from public.listing_photos lp
          where lp.listing_id = act.id
          order by lp.position asc, lp.id asc
          limit 1
        ),
        'studio_name', coalesce(nullif(v_lender.studio_name, ''), nullif(v_lender.display_name, ''), 'Studio'),
        'studio_handle', v_lender.studio_handle
      ) order by act.created_at desc
    ),
    '[]'::jsonb
  ) into v_listings
  from (
    select * from public.listings l
    where l.lender_id = v_lender.id and l.status = 'active'
    order by l.created_at desc
    limit 30
  ) act;

  return query select
    coalesce(nullif(v_lender.studio_name, ''), nullif(v_lender.display_name, ''), 'Studio'),
    v_lender.studio_handle,
    v_lender.studio_bio,
    v_lender.style_tags,
    v_lender.city,
    v_lender.pickup_area,
    coalesce(v_rental_count, 0),
    v_reply_minutes,
    v_is_saved,
    v_listings,
    v_is_own,
    v_since;
end;
$function$;

revoke all on function public.get_studio(text, double precision, double precision) from public;
grant execute on function public.get_studio(text, double precision, double precision) to authenticated;

