-- Step 7A: push notifications for new messages, new chats and date changes.
-- Phones register their push tokens. Database triggers decide whether a push is due
-- (blocks, the recipient's settings, wording) and ask the send-push Edge Function to
-- deliver it through Firebase. Apps never call send-push.

create extension if not exists pg_net with schema extensions;

-- 1. Device tokens: one row per app install. A token belongs to whoever signed in on
-- that phone last, so registering moves it (see register_push_token).
create table public.device_tokens (
  token text not null,
  user_id uuid not null,
  platform text not null,
  created_at timestamp with time zone default pg_catalog.now() not null,
  last_seen_at timestamp with time zone default pg_catalog.now() not null,
  constraint device_tokens_pkey primary key (token),
  constraint device_tokens_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade,
  constraint device_tokens_platform_check check (platform in ('android', 'ios')),
  constraint device_tokens_token_length check (pg_catalog.char_length(token) between 1 and 4096)
);
create index device_tokens_user_id_idx on public.device_tokens using btree (user_id);

-- 2. Notification settings. No row means the defaults: messages on, message text hidden.
create table public.notification_settings (
  user_id uuid not null,
  messages boolean default true not null,
  show_message_text boolean default false not null,
  updated_at timestamp with time zone default pg_catalog.now() not null,
  constraint notification_settings_pkey primary key (user_id),
  constraint notification_settings_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade
);
create trigger notification_settings_set_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- Owner-only. New tables get no Data API grants by default, so every grant is explicit.
alter table public.device_tokens enable row level security;
alter table public.notification_settings enable row level security;
revoke all on public.device_tokens, public.notification_settings from public, anon, authenticated;
-- Tokens are added only through register_push_token (it may move a token between users).
grant select, delete on public.device_tokens to authenticated;
grant select, insert, update on public.notification_settings to authenticated;
-- send-push reads and removes tokens with the service role.
grant select, insert, update, delete on public.device_tokens, public.notification_settings to service_role;

create policy device_tokens_owner on public.device_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_settings_owner on public.notification_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3. Client RPCs.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_token text := pg_catalog.btrim(coalesce(p_token, ''));
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_token) not between 1 and 4096 then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  insert into public.device_tokens as dt (token, user_id, platform)
  values (v_token, v_uid, p_platform)
  on conflict (token) do update set
    created_at = case when dt.user_id = excluded.user_id then dt.created_at else pg_catalog.now() end,
    user_id = excluded.user_id,
    platform = excluded.platform,
    last_seen_at = pg_catalog.now();
end;
$function$;

-- Runs as the caller: removes the token only if it is the caller's.
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
set search_path = ''
as $function$
  delete from public.device_tokens
  where token = pg_catalog.btrim(coalesce(p_token, ''))
    and user_id = (select auth.uid());
$function$;

-- 4. Push decisions (internal, not callable through the API).

-- Text a notification may show, or null. Anything that looks like a phone number, an email
-- or street address, a map link or coordinates never goes into a notification, so such
-- text is left out entirely.
create or replace function app_private.push_safe_text(p_text text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_text text := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if v_text = '' then
    return null;
  end if;
  if pg_catalog.regexp_replace(v_text, '[\s().+-]', '', 'g') ~ '[0-9]{7,}'
     or v_text ~* '[^\s@]+@[^\s@]+\.[a-z]{2,}'
     or v_text ~* '\m[0-9]{1,6}\s+([a-z0-9.''-]+\s+){0,4}(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|trl|trail|sq|square)\M'
     or v_text ~* '\m(apt|apartment|suite|ste|unit)\M\.?\s*#?\s*[0-9]'
     or v_text ~* '(maps\.google|google\.[a-z.]+/maps|goo\.gl/maps|maps\.app\.goo\.gl|maps\.apple|waze\.com|what3words|w3w\.co)'
     or v_text ~ '-?[0-9]{1,3}\.[0-9]{3,}\s*,\s*-?[0-9]{1,3}\.[0-9]{3,}' then
    return null;
  end if;
  if pg_catalog.char_length(v_text) > p_max then
    v_text := pg_catalog.rtrim(pg_catalog.left(v_text, p_max - 1)) || '…';
  end if;
  return v_text;
end;
$function$;

-- Same wording as the app's date chip: "Oct 26 - 30", "Oct 26 - Nov 1", "Oct 26".
create or replace function app_private.push_dates_label(p_start date, p_end date)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when p_start = p_end then pg_catalog.to_char(p_start::timestamp, 'Mon FMDD')
    when pg_catalog.date_trunc('month', p_start::timestamp) = pg_catalog.date_trunc('month', p_end::timestamp)
      then pg_catalog.to_char(p_start::timestamp, 'Mon FMDD') || ' - ' || pg_catalog.to_char(p_end::timestamp, 'FMDD')
    else pg_catalog.to_char(p_start::timestamp, 'Mon FMDD') || ' - ' || pg_catalog.to_char(p_end::timestamp, 'Mon FMDD')
  end;
$function$;

-- Decides whether [p_recipient] gets a push about [p_kind] ('message', 'new_chat' or
-- 'dates') and queues the call to send-push. Never for blocked pairs (either direction),
-- never when the recipient turned Messages off or has no registered phone. Message text is
-- included only when the recipient turned on "Show message text".
create or replace function app_private.queue_push(
  p_kind text, p_conversation_id uuid, p_sender uuid, p_recipient uuid, p_text text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_messages boolean;
  v_show_text boolean;
  v_name text;
  v_listing text;
  v_dates text;
  v_title text;
  v_body text;
  v_url text;
  v_secret text;
begin
  if p_recipient is null or p_sender is null or p_recipient = p_sender then
    return;
  end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = p_sender and bl.blocked_id = p_recipient)
       or (bl.blocker_id = p_recipient and bl.blocked_id = p_sender)
  ) then
    return;
  end if;

  select ns.messages, ns.show_message_text into v_messages, v_show_text
  from public.notification_settings ns where ns.user_id = p_recipient;
  if not found then
    v_messages := true;
    v_show_text := false;
  end if;
  if not v_messages
     or not exists (select 1 from public.device_tokens dt where dt.user_id = p_recipient) then
    return;
  end if;

  -- The sender as the recipient's inbox shows them: studio name, else display name.
  select app_private.push_safe_text(coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name), 60)
    into v_name
  from public.profiles p where p.id = p_sender;

  select app_private.push_safe_text(l.title, 80),
         case when c.requested_start is not null and c.requested_end is not null
              then app_private.push_dates_label(c.requested_start, c.requested_end) end
    into v_listing, v_dates
  from public.conversations c
  left join public.listings l on l.id = c.listing_id
  where c.id = p_conversation_id;

  if p_kind = 'message' then
    v_title := 'New message' || coalesce(' from ' || v_name, '');
    v_body := case when v_show_text then app_private.push_safe_text(p_text, 200) end;
  elsif p_kind = 'new_chat' then
    v_title := 'New chat' || coalesce(' from ' || v_name, '');
    v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
  elsif p_kind = 'dates' and v_dates is not null then
    v_title := 'New dates' || coalesce(' from ' || v_name, '');
    v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing);
  else
    return;
  end if;

  -- Both live in Vault. The secret proves to send-push that the database is calling.
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'send_push_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'send_push_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := pg_catalog.jsonb_build_object(
      'kind', p_kind,
      'conversation_id', p_conversation_id,
      'recipient_id', p_recipient,
      'title', v_title,
      'body', nullif(v_body, '')
    ),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-send-push-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
end;
$function$;

-- Triggers. A push problem never stops the message, chat or date change itself.
create or replace function app_private.push_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_renter uuid;
  v_lender uuid;
begin
  select c.renter_id, c.lender_id into v_renter, v_lender
  from public.conversations c where c.id = new.conversation_id;
  perform app_private.queue_push(
    'message', new.conversation_id, new.sender_id,
    case new.sender_id when v_renter then v_lender when v_lender then v_renter end,
    new.body
  );
  return null;
exception when others then
  raise warning 'Push for a new message skipped: %', sqlerrm;
  return null;
end;
$function$;

create or replace function app_private.push_new_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform app_private.queue_push('new_chat', new.id, new.renter_id, new.lender_id);
  return null;
exception when others then
  raise warning 'Push for a new chat skipped: %', sqlerrm;
  return null;
end;
$function$;

-- Only renters set dates today (set_conversation_dates, start_conversation); the other
-- participant is told.
create or replace function app_private.push_dates_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is distinct from new.lender_id then
    v_actor := new.renter_id;
  end if;
  perform app_private.queue_push(
    'dates', new.id, v_actor,
    case when v_actor = new.renter_id then new.lender_id else new.renter_id end
  );
  return null;
exception when others then
  raise warning 'Push for new dates skipped: %', sqlerrm;
  return null;
end;
$function$;

create trigger messages_push after insert on public.messages
  for each row execute function app_private.push_new_message();
create trigger conversations_push_new after insert on public.conversations
  for each row execute function app_private.push_new_conversation();
create trigger conversations_push_dates after update of requested_start, requested_end on public.conversations
  for each row
  when (old.requested_start is distinct from new.requested_start
        or old.requested_end is distinct from new.requested_end)
  execute function app_private.push_dates_changed();

-- 5. Access to the functions.
revoke execute on function public.register_push_token(text, text) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated, service_role;
revoke execute on function public.unregister_push_token(text) from public, anon, authenticated;
grant execute on function public.unregister_push_token(text) to authenticated, service_role;
revoke execute on function app_private.push_safe_text(text, integer) from public, anon, authenticated;
revoke execute on function app_private.push_dates_label(date, date) from public, anon, authenticated;
revoke execute on function app_private.queue_push(text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app_private.push_new_message() from public, anon, authenticated;
revoke execute on function app_private.push_new_conversation() from public, anon, authenticated;
revoke execute on function app_private.push_dates_changed() from public, anon, authenticated;

-- 6. Vault: where send-push lives and the shared secret, generated here (never in this
-- file). The same secret is set as the function's SEND_PUSH_SECRET.
do $migration$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'send_push_secret') then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'send_push_secret',
      'Proves to the send-push Edge Function that this database is calling'
    );
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'send_push_url') then
    perform vault.create_secret(
      'https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/send-push',
      'send_push_url',
      'Address of the send-push Edge Function'
    );
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
