-- Step 1B: shop window functions and safe cross-account access
-- Fully qualified names and empty search paths throughout.

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
     or v_uid is null or new.renter_id <> v_uid then
    raise exception 'Invalid conversation' using errcode = '42501';
  end if;

  if new.lender_id is null then
    select l.lender_id into new.lender_id from public.listings l where l.id = new.listing_id;
  end if;

  if new.renter_id = new.lender_id then
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
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := pg_catalog.greatest(coalesce(p_offset, 0), 0);
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
          pg_catalog.greatest(
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

create or replace function public.get_listing(
  p_listing_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  id uuid,
  title text,
  category text,
  item_type text,
  garment_type text,
  size_label text,
  description text,
  price numeric,
  price_note text,
  deposit_note text,
  retail_value numeric,
  listing_styles text[],
  city text,
  distance integer,
  studio_name text,
  studio_handle text,
  photos jsonb,
  measurements jsonb,
  availability jsonb,
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
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
    l.created_at
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
  listings jsonb
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
    v_listings;
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
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := pg_catalog.greatest(coalesce(p_offset, 0), 0);
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
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := pg_catalog.greatest(coalesce(p_offset, 0), 0);
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
  v_limit integer := pg_catalog.least(pg_catalog.greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := pg_catalog.greatest(coalesce(p_offset, 0), 0);
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

create or replace function public.save_studio(p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select p.id into v_lender_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found or v_lender_id = v_uid then
    return;
  end if;

  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender_id)
       or (bl.blocker_id = v_lender_id and bl.blocked_id = v_uid)
  ) then
    raise exception 'Cannot save blocked studio' using errcode = '42501';
  end if;

  insert into public.saved_studios (user_id, lender_id)
  values (v_uid, v_lender_id)
  on conflict do nothing;
end;
$function$;

create or replace function public.unsave_studio(p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select p.id into v_lender_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found then
    return;
  end if;

  delete from public.saved_studios
  where user_id = v_uid and lender_id = v_lender_id;
end;
$function$;

create or replace function public.start_conversation(
  p_listing_id uuid,
  p_start date default null,
  p_end date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
  v_conv_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select l.lender_id into v_lender_id
  from public.listings l
  where l.id = p_listing_id and l.status = 'active';

  if not found then
    raise exception 'Listing not available' using errcode = '42501';
  end if;

  if v_lender_id = v_uid then
    raise exception 'Cannot message your own listing' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender_id)
       or (bl.blocker_id = v_lender_id and bl.blocked_id = v_uid)
  ) then
    raise exception 'You cannot message this user' using errcode = '42501';
  end if;

  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'Invalid dates' using errcode = '22023';
  end if;

  insert into public.conversations (listing_id, renter_id, lender_id, requested_start, requested_end)
  values (p_listing_id, v_uid, v_lender_id, p_start, p_end)
  on conflict (listing_id, renter_id) do update set
    requested_start = coalesce(excluded.requested_start, conversations.requested_start),
    requested_end = coalesce(excluded.requested_end, conversations.requested_end)
  returning id into v_conv_id;

  return v_conv_id;
end;
$function$;

-- Permissions:
-- Guests and authenticated can browse and view listings.
grant execute on function public.browse_listings to anon, authenticated, service_role;
grant execute on function public.get_listing to anon, authenticated, service_role;

-- Signed-in only functions:
grant execute on function public.get_studio to authenticated, service_role;
revoke execute on function public.get_studio from anon, public;

grant execute on function public.fit_listings to authenticated, service_role;
revoke execute on function public.fit_listings from anon, public;

grant execute on function public.my_conversations to authenticated, service_role;
revoke execute on function public.my_conversations from anon, public;

grant execute on function public.my_saved_studios to authenticated, service_role;
revoke execute on function public.my_saved_studios from anon, public;

grant execute on function public.save_studio to authenticated, service_role;
revoke execute on function public.save_studio from anon, public;

grant execute on function public.unsave_studio to authenticated, service_role;
revoke execute on function public.unsave_studio from anon, public;

grant execute on function public.start_conversation to authenticated, service_role;
revoke execute on function public.start_conversation from anon, public;
