-- C1 Part 2: a listing's price is a price per day.
-- listings.price_usd now means USD per day; price_unit says so ('per_day', the only unit for now).
-- browse_listings and get_listing also return price_per_day and price_unit, and, when both dates
-- are passed, days (inclusive: Nov 5 - Nov 8 is 4 days) and total (price per day x days).
-- The old `price` column stays in both (the same number) so installed apps keep working.

alter table public.listings
  add column price_unit text not null default 'per_day'
  constraint listings_price_unit_check check (price_unit in ('per_day'));
comment on column public.listings.price_usd is 'Price per day in USD (C1); the unit is price_unit.';
comment on column public.listings.price_unit is 'What price_usd is for: per_day (the only unit for now).';

-- Days in an inclusive date range, or null without both dates or when the end is before the start.
create function app_private.rental_days(p_start date, p_end date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_start is not null and p_end is not null and p_end >= p_start
              then (p_end - p_start) + 1 end;
$$;
revoke execute on function app_private.rental_days(date, date) from public, anon, authenticated;

drop function public.browse_listings(double precision, double precision, double precision, text, text, text, text,
  text, text[], date, date, numeric, numeric, integer, boolean, boolean, text, integer, integer);

create function public.browse_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double precision DEFAULT NULL::double precision, p_query text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_item_type text DEFAULT NULL::text, p_garment_type text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_styles text[] DEFAULT NULL::text[], p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_new_days integer DEFAULT NULL::integer, p_saved_only boolean DEFAULT false, p_saved_studios_only boolean DEFAULT false, p_sort text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text, price_per_day numeric, price_unit text, days integer, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_q text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_sort text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_sort, '')));
  v_new_cutoff timestamp with time zone := case
    when p_new_days is not null and p_new_days > 0
    then pg_catalog.now() - (p_new_days || ' days')::interval
    else null
  end;
  v_norm_size text := nullif(pg_catalog.lower(pg_catalog.replace(coalesce(p_size, ''), ' ', '')), '');
  v_days integer := app_private.rental_days(p_start_date, p_end_date);
begin
  if v_q is not null then
    perform pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.3', true);
  end if;

  return query
  with filtered as (
    select
      l.id,
      l.title,
      l.price_usd as price,
      l.price_unit,
      case
        when p_lat is not null and p_lng is not null then
          pg_catalog.round(
            3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
              pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lat - p_lat) / 2.0), 2) +
              pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(l.approx_lat)) *
              pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lng - p_lng) / 2.0), 2)
            ))
          )::integer
        else null
      end as distance,
      coalesce(nullif(l.city, ''), nullif(p.city, '')) as city,
      l.category,
      (
        select lp.storage_path
        from public.listing_photos lp
        where lp.listing_id = l.id
        order by lp.position asc, lp.id asc
        limit 1
      ) as cover_photo_path,
      coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio') as studio_name,
      p.studio_handle,
      l.created_at,
      case
        when v_q is not null then
          greatest(
            extensions.word_similarity(v_q, pg_catalog.lower(l.title)),
            extensions.word_similarity(v_q, pg_catalog.lower(coalesce(l.description, '')))
          )
        else 0.0
      end as similarity_score
    from public.listings l
    join public.profiles p on p.id = l.lender_id
    where l.status = 'active'
      and (v_uid is null or l.lender_id <> v_uid)
      and (v_uid is null or not exists (
        select 1 from public.blocks bl
        where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
           or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
      ))
      and (
        v_q is null
        or pg_catalog.lower(l.title) like '%' || v_q || '%'
        or pg_catalog.lower(coalesce(l.description, '')) like '%' || v_q || '%'
        or extensions.word_similarity(v_q, pg_catalog.lower(l.title)) >= 0.3
        or extensions.word_similarity(v_q, pg_catalog.lower(coalesce(l.description, ''))) >= 0.3
      )
      and (p_category is null or l.category = p_category)
      and (p_item_type is null or l.item_type = p_item_type)
      and (p_garment_type is null or l.garment_type = p_garment_type)
      and (
        v_norm_size is null
        or (l.size_label is not null and (
          pg_catalog.lower(pg_catalog.replace(l.size_label, ' ', '')) = v_norm_size
          or v_norm_size = any(
            pg_catalog.string_to_array(
              pg_catalog.lower(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(l.size_label, ' ', ''), '/', ','), '|', ',')),
              ','
            )
          )
        ))
      )
      and (
        p_styles is null
        or pg_catalog.cardinality(p_styles) = 0
        or l.listing_styles operator(pg_catalog.&&) p_styles
      )
      and (
        p_start_date is null or p_end_date is null
        or not exists (select 1 from public.availability av where av.listing_id = l.id)
        or (
          select coalesce(
            pg_catalog.range_agg(pg_catalog.daterange(av.start_date, av.end_date, '[]')),
            pg_catalog.datemultirange()
          )
          from public.availability av
          where av.listing_id = l.id
        ) operator(pg_catalog.@>) pg_catalog.daterange(p_start_date, p_end_date, '[]')
      )
      and (p_min_price is null or l.price_usd >= p_min_price)
      and (p_max_price is null or l.price_usd <= p_max_price)
      and (v_new_cutoff is null or l.created_at >= v_new_cutoff)
      and (
        not p_saved_only
        or (v_uid is not null and exists (
          select 1 from public.saved_listings sl
          where sl.user_id = v_uid and sl.listing_id = l.id
        ))
      )
      and (
        not p_saved_studios_only
        or (v_uid is not null and exists (
          select 1 from public.saved_studios ss
          where ss.user_id = v_uid and ss.lender_id = l.lender_id
        ))
      )
  )
  select
    f.id,
    f.title,
    f.price,
    f.distance,
    f.city,
    f.category,
    f.cover_photo_path,
    f.studio_name,
    f.studio_handle,
    f.price,
    f.price_unit,
    v_days,
    case when v_days is not null then f.price * v_days end
  from filtered f
  where (p_radius_miles is null or (f.distance is not null and f.distance <= p_radius_miles))
  order by
    case when v_sort = 'price_low' then f.price end asc nulls last,
    case when v_sort = 'price_high' then f.price end desc nulls last,
    case when v_sort = 'newest' then f.created_at end desc,
    case when v_sort = 'nearest' then f.distance end asc nulls last,
    case when v_sort = '' and v_q is not null then f.similarity_score end desc,
    case when v_sort = '' and p_lat is not null and p_lng is not null then f.distance end asc nulls last,
    f.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

grant execute on function public.browse_listings(double precision, double precision, double precision, text, text, text, text,
  text, text[], date, date, numeric, numeric, integer, boolean, boolean, text, integer, integer) to anon, authenticated, service_role;

drop function public.get_listing(uuid, double precision, double precision);

create function public.get_listing(p_listing_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, title text, category text, item_type text, garment_type text, size_label text, description text, price numeric, price_note text, deposit_note text, retail_value numeric, listing_styles text[], city text, distance integer, studio_name text, studio_handle text, photos jsonb, measurements jsonb, availability jsonb, created_at timestamp with time zone, price_per_day numeric, price_unit text, days integer, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := app_private.rental_days(p_start_date, p_end_date);
begin
  return query
  select
    l.id,
    l.title,
    l.category,
    l.item_type,
    l.garment_type,
    l.size_label,
    l.description,
    l.price_usd as price,
    l.price_note,
    l.deposit_note,
    l.retail_value,
    l.listing_styles,
    coalesce(nullif(l.city, ''), nullif(p.city, '')) as city,
    case
      when p_lat is not null and p_lng is not null then
        pg_catalog.round(
          3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lat - p_lat) / 2.0), 2) +
            pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(l.approx_lat)) *
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lng - p_lng) / 2.0), 2)
          ))
        )::integer
      else null
    end as distance,
    coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio') as studio_name,
    p.studio_handle,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'storage_path', lp.storage_path,
          'position', lp.position,
          'slot', lp.slot
        ) order by lp.position asc, lp.id asc
      )
      from public.listing_photos lp
      where lp.listing_id = l.id
    ), '[]'::jsonb) as photos,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'label', lm.label,
          'value', lm.value,
          'unit', lm.unit
        ) order by lm.label asc
      )
      from public.listing_measurements lm
      where lm.listing_id = l.id
    ), '[]'::jsonb) as measurements,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'start_date', av.start_date,
          'end_date', av.end_date
        ) order by av.start_date asc
      )
      from public.availability av
      where av.listing_id = l.id
    ), '[]'::jsonb) as availability,
    l.created_at,
    l.price_usd as price_per_day,
    l.price_unit,
    v_days as days,
    case when v_days is not null then l.price_usd * v_days end as total
  from public.listings l
  join public.profiles p on p.id = l.lender_id
  where l.id = p_listing_id
    and l.status = 'active'
    and (v_uid is null or not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
         or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
    ));
end;
$function$;

grant execute on function public.get_listing(uuid, double precision, double precision, date, date) to anon, authenticated, service_role;
