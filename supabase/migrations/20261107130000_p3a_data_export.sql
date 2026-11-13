-- P3A: "Download my data". export_my_data() builds one JSON document of everything Dzirent holds
-- about the caller (compliance.md section 1), once per 24 hours. The export-my-data Edge Function
-- calls it with the caller's own token and adds the plain-language "about" part and photo links.
--
-- The rule: nothing in the export comes from another user's private data. Every query below is
-- keyed to auth.uid(). Other people appear only as a name (studio name, else display name) and a
-- studio handle, the same as the shop window and the chat list show them: never their account
-- id, email, location, measurements, city or any other private field. Other people's messages
-- in the caller's own chats are included (the caller can already read them), marked
-- "other person". Reports about the caller, report evidence, admin notes and the admin log are
-- not included.

-- 1. When each export ran. Owner reads their own; written only by export_my_data.
create table public.data_exports (
  id bigint generated always as identity,
  user_id uuid not null,
  exported_at timestamp with time zone default pg_catalog.now() not null,
  constraint data_exports_pkey primary key (id),
  constraint data_exports_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);
create index data_exports_user_idx on public.data_exports using btree (user_id, exported_at desc);
alter table public.data_exports enable row level security;
revoke all on public.data_exports from public, anon, authenticated, service_role;
grant select on public.data_exports to authenticated;
create policy data_exports_owner_read on public.data_exports
  for select to authenticated using (user_id = (select auth.uid()));

-- How another person is shown in the caller's export: a name and a studio handle only.
create or replace function app_private.export_person(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'name', coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name),
    'handle', p.studio_handle)
  from public.profiles p where p.id = p_user;
$function$;

-- 2. The export.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_last timestamp with time zone;
  v_result jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Once per 24 hours. The lock keeps two exports started at the same moment from both passing.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('data_export:' || v_uid::text));
  select max(e.exported_at) into v_last from public.data_exports e where e.user_id = v_uid;
  if v_last is not null and v_last > pg_catalog.now() - interval '24 hours' then
    raise exception using errcode = 'P0001', message =
      'You can download your data once a day. Try again after '
      || pg_catalog.to_char((v_last + interval '24 hours') at time zone 'UTC', 'Mon FMDD, YYYY, FMHH12:MI AM')
      || ' UTC.';
  end if;

  select pg_catalog.jsonb_build_object(
    -- Sign-in account (Supabase Auth). The password is never readable, so it isn't here.
    'account', (select pg_catalog.jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
      from auth.users u where u.id = v_uid),

    -- Profile and studio: every column is the caller's own.
    'profile', (select pg_catalog.to_jsonb(p) from public.profiles p where p.id = v_uid),

    -- Measurements, consent time, fit profile, style interests.
    'private_profile', (select pg_catalog.to_jsonb(pp) - 'user_id'
      from public.private_profiles pp where pp.user_id = v_uid),

    -- The caller's listings, with everything attached to them.
    'listings', coalesce((select pg_catalog.jsonb_agg(
        (pg_catalog.to_jsonb(l) - 'lender_id') || pg_catalog.jsonb_build_object(
          'measurements', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'label', m.label, 'value', m.value, 'unit', m.unit) order by m.label)
            from public.listing_measurements m where m.listing_id = l.id), '[]'::jsonb),
          'availability', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'start_date', a.start_date, 'end_date', a.end_date) order by a.start_date)
            from public.availability a where a.listing_id = l.id), '[]'::jsonb),
          'photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', ph.id, 'storage_path', ph.storage_path, 'position', ph.position, 'slot', ph.slot)
              order by ph.position)
            from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb),
          -- Photo checks of this listing; "duplicate" is only true or false, never another listing.
          'photo_checks', coalesce((select pg_catalog.jsonb_agg(
              (pg_catalog.to_jsonb(s) - 'listing_id') || pg_catalog.jsonb_build_object(
                'photos', coalesce((select pg_catalog.jsonb_agg(
                    (pg_catalog.to_jsonb(ps) - 'listing_id' - 'scan_id' - 'fingerprint')
                    || pg_catalog.jsonb_build_object('fingerprint', (ps.fingerprint::text)::jsonb)
                    order by ps.scanned_at, ps.id)
                  from public.photo_scans ps where ps.scan_id = s.id), '[]'::jsonb))
              order by s.created_at)
            from public.listing_scans s where s.listing_id = l.id), '[]'::jsonb))
        order by l.created_at)
      from public.listings l where l.lender_id = v_uid), '[]'::jsonb),

    -- Saved pieces: the title only while the piece is public (active, not blocked either way).
    'saved_pieces', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'listing_id', sl.listing_id,
        'title', case when l.status = 'active' and not exists (
            select 1 from public.blocks b
            where (b.blocker_id = v_uid and b.blocked_id = l.lender_id)
               or (b.blocker_id = l.lender_id and b.blocked_id = v_uid)) then l.title end,
        'saved_at', sl.created_at) order by sl.created_at)
      from public.saved_listings sl left join public.listings l on l.id = sl.listing_id
      where sl.user_id = v_uid), '[]'::jsonb),

    'saved_studios', coalesce((select pg_catalog.jsonb_agg(
        coalesce(app_private.export_person(ss.lender_id), '{}'::jsonb)
        || pg_catalog.jsonb_build_object('saved_at', ss.created_at) order by ss.created_at)
      from public.saved_studios ss where ss.user_id = v_uid), '[]'::jsonb),

    -- Chats the caller is part of, with every message in them.
    'chats', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id,
        'listing_id', c.listing_id,
        'listing_title', l.title,
        'your_role', case when c.renter_id = v_uid then 'renter' else 'lender' end,
        'other_person', app_private.export_person(case when c.renter_id = v_uid then c.lender_id else c.renter_id end),
        'requested_start', c.requested_start,
        'requested_end', c.requested_end,
        'started_at', c.created_at,
        'you_last_read_at', (select r.last_read_at from public.conversation_reads r
                             where r.user_id = v_uid and r.conversation_id = c.id),
        'your_rental_answer', (select pg_catalog.jsonb_build_object('happened', ro.happened, 'answered_at', ro.answered_at)
                               from public.rental_outcomes ro where ro.conversation_id = c.id and ro.user_id = v_uid),
        'messages', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'from', case when m.sender_id = v_uid then 'you' else 'other person' end,
            'text', m.body,
            'sent_at', m.created_at) order by m.created_at, m.id)
          from public.messages m where m.conversation_id = c.id), '[]'::jsonb))
        order by c.created_at)
      from public.conversations c join public.listings l on l.id = c.listing_id
      where v_uid in (c.renter_id, c.lender_id)), '[]'::jsonb),

    'rentals', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', rt.id,
        'chat_id', rt.conversation_id,
        'listing_id', rt.listing_id,
        'listing_title', l.title,
        'your_role', case when rt.renter_id = v_uid then 'renter' else 'lender' end,
        'other_person', app_private.export_person(case when rt.renter_id = v_uid then rt.lender_id else rt.renter_id end),
        'status', rt.status,
        'start_date', rt.start_date,
        'end_date', rt.end_date,
        'last_changed_by', case when rt.updated_by is null then null
                                when rt.updated_by = v_uid then 'you' else 'other person' end,
        'created_at', rt.created_at,
        'updated_at', rt.updated_at) order by rt.created_at)
      from public.rentals rt join public.listings l on l.id = rt.listing_id
      where v_uid in (rt.renter_id, rt.lender_id)), '[]'::jsonb),

    'blocked_people', coalesce((select pg_catalog.jsonb_agg(app_private.export_person(b.blocked_id))
      from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),

    -- Reports the caller filed. Not reports about them, and not the outcome, admin notes or
    -- evidence (those describe moderation of the other person).
    'reports_filed', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', rp.id,
        'about', rp.target_type,
        'person', app_private.export_person(rp.target_user_id),
        'listing_id', case when rp.target_type = 'listing' then rp.target_id end,
        'reason', rp.reason,
        'details', rp.details,
        'status', rp.status,
        'created_at', rp.created_at) order by rp.created_at)
      from public.reports rp where rp.reporter_id = v_uid), '[]'::jsonb),

    'warnings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'note', w.note, 'created_at', w.created_at) order by w.created_at)
      from public.user_warnings w where w.user_id = v_uid), '[]'::jsonb),

    'accessory_declarations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) - 'user_id' order by d.created_at)
      from public.accessory_declarations d where d.user_id = v_uid), '[]'::jsonb),

    'listing_declarations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) - 'user_id' order by d.created_at)
      from public.listing_declarations d where d.user_id = v_uid), '[]'::jsonb),

    'legal_acceptances', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'document', la.document, 'version', la.version, 'platform', la.platform, 'accepted_at', la.accepted_at)
        order by la.accepted_at)
      from public.legal_acceptances la where la.user_id = v_uid), '[]'::jsonb),

    'age_checks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'source', ac.source, 'result', ac.result, 'platform', ac.platform, 'checked_at', ac.checked_at)
        order by ac.id)
      from public.age_checks ac where ac.user_id = v_uid), '[]'::jsonb),

    'notification_settings', (select pg_catalog.jsonb_build_object(
        'messages', ns.messages, 'show_message_text', ns.show_message_text, 'updated_at', ns.updated_at)
      from public.notification_settings ns where ns.user_id = v_uid),

    -- Which kinds of phone get notifications. Not the push tokens.
    'devices', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'platform', dt.platform, 'registered_at', dt.created_at, 'last_seen_at', dt.last_seen_at)
        order by dt.created_at)
      from public.device_tokens dt where dt.user_id = v_uid), '[]'::jsonb),

    'suggestion_choices', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'listing_id', se.listing_id, 'field', se.field, 'suggested_from', se.label, 'choice', se.action,
        'created_at', se.created_at) order by se.created_at)
      from public.suggestion_events se where se.user_id = v_uid), '[]'::jsonb),

    'listing_activity', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'listing_id', le.listing_id, 'type', le.type, 'created_at', le.created_at) order by le.created_at)
      from public.listing_events le where le.user_id = v_uid), '[]'::jsonb),

    'earlier_exports', coalesce((select pg_catalog.jsonb_agg(e.exported_at order by e.exported_at)
      from public.data_exports e where e.user_id = v_uid), '[]'::jsonb)
  ) into v_result;

  insert into public.data_exports (user_id) values (v_uid);
  return v_result;
end;
$function$;

-- 3. Whether the caller's account is blocked by the age gate (P2C), for the website's blocked page.
create or replace function public.age_blocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select app_private.age_blocked(auth.uid());
$function$;

-- 4. Access.
revoke execute on function app_private.export_person(uuid) from public, anon, authenticated;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
revoke execute on function public.age_blocked() from public, anon;
grant execute on function public.age_blocked() to authenticated;
