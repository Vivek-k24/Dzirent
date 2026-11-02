-- Step 3A: Moderation by studio handle (block_user, unblock_user, report_user)
-- Resolves the target handle inside the function; never returns account IDs.

create or replace function public.block_user(p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found or v_target_id = v_uid then
    return;
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_uid, v_target_id)
  on conflict do nothing;
end;
$function$;

create or replace function public.unblock_user(p_handle text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found then
    return;
  end if;

  delete from public.blocks
  where blocker_id = v_uid and blocked_id = v_target_id;
end;
$function$;

create or replace function public.report_user(
  p_handle text,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
  v_clean_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_clean_reason) < 1 then
    raise exception 'Reason is required' using errcode = '22023';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found or v_target_id = v_uid then
    return;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, 'user', v_target_id, v_clean_reason, nullif(pg_catalog.btrim(coalesce(p_details, '')), ''));
end;
$function$;

grant execute on function public.block_user to authenticated, service_role;
revoke execute on function public.block_user from anon, public;

grant execute on function public.unblock_user to authenticated, service_role;
revoke execute on function public.unblock_user from anon, public;

grant execute on function public.report_user to authenticated, service_role;
revoke execute on function public.report_user from anon, public;

