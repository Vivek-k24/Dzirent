-- Step 1B fix: greatest and least are SQL language constructs, not pg_catalog functions.

create or replace function public.browse_listings(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles double precision default null,
  p_query text default null,
  p_category text default null,
  p_item_type text default null,
  p_garment_type text default null,
  p_size text default null,
  p_styles text[] default null,
  p_start_date date default null,
  p_end_date date default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_new_days integer default null,
  p_saved_only boolean default false,
  p_saved_studios_only boolean default false,
  p_sort text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  price numeric,
  distance integer,
  city text,
  category text,
  cover_photo_path text,
  studio_name text,
  studio_handle text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    f.studio_handle
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

create or replace function public.fit_listings(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles double precision default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  price numeric,
  distance integer,
  city text,
  category text,
  cover_photo_path text,
  studio_name text,
  studio_handle text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.private_profiles%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into v_profile from public.private_profiles where user_id = v_uid;

  if v_profile.chest_cm is null and v_profile.waist_cm is null
     and v_profile.hips_cm is null and v_profile.shoulder_cm is null then
    return;
  end if;

  return query
  with candidate_matches as (
    select
      l.id as listing_id,
      match_calc.part
    from public.listings l
    join public.listing_measurements lm on lm.listing_id = l.id
    cross join lateral (
      select
        case
          when pg_catalog.lower(lm.label) like '%shoulder%' then 'shoulder'
          when pg_catalog.lower(lm.label) like '%chest%'
            or pg_catalog.lower(lm.label) like '%bust%'
            or pg_catalog.lower(lm.label) like '%pit to pit%'
            or pg_catalog.lower(lm.label) like '%pit-to-pit%' then 'chest'
          when pg_catalog.lower(lm.label) like '%waist%' then 'waist'
          when pg_catalog.lower(lm.label) like '%hip%' then 'hips'
          else null
        end as part,
        case
          when lm.unit = 'in' then lm.value * 2.54
          else lm.value
        end * case
          when pg_catalog.lower(lm.label) like '%flat%'
               and pg_catalog.lower(lm.label) not like '%shoulder%' then 2.0
          else 1.0
        end as garment_cm
    ) parsed
    cross join lateral (
      select
        case parsed.part
          when 'chest' then v_profile.chest_cm
          when 'waist' then v_profile.waist_cm
          when 'hips' then v_profile.hips_cm
          when 'shoulder' then v_profile.shoulder_cm
          else null
        end as body_cm,
        case l.category
          when 'Career & Professional' then
            case parsed.part
              when 'chest' then 4.0 when 'waist' then 2.0 when 'hips' then 4.0 when 'shoulder' then -1.0 else null end
          when 'Occasion & Party' then
            case parsed.part
              when 'chest' then 0.0 when 'waist' then 0.0 when 'hips' then 0.0 when 'shoulder' then -2.0 else null end
          when 'Cultural & Traditional' then
            case parsed.part
              when 'chest' then 4.0 when 'waist' then 4.0 when 'hips' then 6.0 when 'shoulder' then -1.0 else null end
          when 'Outerwear' then
            case parsed.part
              when 'chest' then 10.0 when 'waist' then 8.0 when 'hips' then 8.0 when 'shoulder' then 0.0 else null end
          else
            case parsed.part
              when 'chest' then 4.0 when 'waist' then 0.0 when 'hips' then 2.0 when 'shoulder' then -2.0 else null end
        end as ease_min,
        case l.category
          when 'Career & Professional' then
            case parsed.part
              when 'chest' then 14.0 when 'waist' then 12.0 when 'hips' then 14.0 when 'shoulder' then 3.0 else null end
          when 'Occasion & Party' then
            case parsed.part
              when 'chest' then 8.0 when 'waist' then 6.0 when 'hips' then 10.0 when 'shoulder' then 2.0 else null end
          when 'Cultural & Traditional' then
            case parsed.part
              when 'chest' then 16.0 when 'waist' then 16.0 when 'hips' then 20.0 when 'shoulder' then 3.0 else null end
          when 'Outerwear' then
            case parsed.part
              when 'chest' then 28.0 when 'waist' then 30.0 when 'hips' then 30.0 when 'shoulder' then 5.0 else null end
          else
            case parsed.part
              when 'chest' then 20.0 when 'waist' then 14.0 when 'hips' then 18.0 when 'shoulder' then 4.0 else null end
        end as ease_max
    ) ease
    cross join lateral (
      select
        parsed.part,
        (parsed.garment_cm - ease.body_cm) as extra
    ) match_calc
    where l.status = 'active'
      and l.category <> 'Accessories'
      and l.lender_id <> v_uid
      and not exists (
        select 1 from public.blocks bl
        where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
           or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
      )
      and parsed.part is not null
      and ease.body_cm is not null
      and match_calc.extra >= ease.ease_min
      and match_calc.extra <= ease.ease_max
  ),
  matched_listings as (
    select
      cm.listing_id
    from candidate_matches cm
    group by cm.listing_id
    having pg_catalog.count(distinct cm.part) >= 2
  ),
  results as (
    select
      l.id,
      l.title,
      l.price_usd as price,
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
      l.created_at
    from matched_listings ml
    join public.listings l on l.id = ml.listing_id
    join public.profiles p on p.id = l.lender_id
  )
  select
    r.id,
    r.title,
    r.price,
    r.distance,
    r.city,
    r.category,
    r.cover_photo_path,
    r.studio_name,
    r.studio_handle
  from results r
  where (p_radius_miles is null or (r.distance is not null and r.distance <= p_radius_miles))
  order by r.distance asc nulls last, r.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

create or replace function public.my_conversations(
  p_conversation_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  listing_id uuid,
  listing_title text,
  cover_photo_path text,
  price numeric,
  other_name text,
  other_handle text,
  last_message text,
  last_message_at timestamp with time zone,
  unread boolean,
  requested_start date,
  requested_end date
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return query
  with convs as (
    select
      c.id,
      c.listing_id,
      c.renter_id,
      c.lender_id,
      c.requested_start,
      c.requested_end,
      c.created_at,
      case when c.renter_id = v_uid then c.lender_id else c.renter_id end as other_id
    from public.conversations c
    where (c.renter_id = v_uid or c.lender_id = v_uid)
      and (p_conversation_id is null or c.id = p_conversation_id)
  )
  select
    c.id,
    c.listing_id,
    l.title as listing_title,
    (
      select lp.storage_path
      from public.listing_photos lp
      where lp.listing_id = l.id
      order by lp.position asc, lp.id asc
      limit 1
    ) as cover_photo_path,
    l.price_usd as price,
    coalesce(nullif(other_p.studio_name, ''), nullif(other_p.display_name, ''), 'User') as other_name,
    other_p.studio_handle as other_handle,
    last_msg.body as last_message,
    last_msg.created_at as last_message_at,
    coalesce(
      exists (
        select 1 from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> v_uid
          and (cr.last_read_at is null or m.created_at > cr.last_read_at)
      ),
      false
    ) as unread,
    c.requested_start,
    c.requested_end
  from convs c
  join public.listings l on l.id = c.listing_id
  join public.profiles other_p on other_p.id = c.other_id
  left join public.conversation_reads cr on cr.conversation_id = c.id and cr.user_id = v_uid
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_msg on true
  where not exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = c.other_id)
       or (bl.blocker_id = c.other_id and bl.blocked_id = v_uid)
  )
  order by coalesce(last_msg.created_at, c.created_at) desc
  limit v_limit
  offset v_offset;
end;
$function$;

create or replace function public.my_saved_studios(
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  studio_name text,
  studio_handle text,
  city text,
  cover_photo_path text,
  piece_count integer,
  distance integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  return query
  select
    coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio') as studio_name,
    p.studio_handle,
    p.city,
    (
      select lp.storage_path
      from public.listings l
      join public.listing_photos lp on lp.listing_id = l.id
      where l.lender_id = p.id and l.status = 'active'
      order by l.created_at desc, lp.position asc
      limit 1
    ) as cover_photo_path,
    (
      select pg_catalog.count(*)::integer
      from public.listings l
      where l.lender_id = p.id and l.status = 'active'
    ) as piece_count,
    case
      when p_lat is not null and p_lng is not null and p.approx_lat is not null and p.approx_lng is not null then
        pg_catalog.round(
          3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p.approx_lat - p_lat) / 2.0), 2) +
            pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(p.approx_lat)) *
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p.approx_lng - p_lng) / 2.0), 2)
          ))
        )::integer
      else null
    end as distance
  from public.saved_studios ss
  join public.profiles p on p.id = ss.lender_id
  where ss.user_id = v_uid
    and not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = v_uid and bl.blocked_id = p.id)
         or (bl.blocker_id = p.id and bl.blocked_id = v_uid)
    )
  order by ss.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

