-- P5A: admin tools need a two-step code checked within the last 24 hours, not just once per session.
-- The session's JWT lists its sign-in methods with their times (claim "amr"); Supabase Auth updates
-- the TOTP entry each time a code is verified. A session whose last code is older than 24 hours is
-- refused by every admin function and by is_admin() until the admin enters a new code; the website
-- then shows the code step and continues to the page that was asked for.

-- True when the caller's session verified a two-step code within the last 24 hours.
create or replace function app_private.admin_code_fresh()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select pg_catalog.max((m.value ->> 'timestamp')::bigint)
    from pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
    ) m(value)
    where m.value ->> 'method' = 'totp' or m.value ->> 'method' like 'mfa/%'
  ) >= extract(epoch from pg_catalog.now() - interval '24 hours')::bigint, false);
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
     and app_private.admin_code_fresh()
     and exists (select 1 from app_private.admin_users a where a.user_id = (select auth.uid()));
$function$;

create or replace function app_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from app_private.admin_users a where a.user_id = v_uid) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Sign in with two-step verification to use admin tools' using errcode = '42501';
  end if;
  if not app_private.admin_code_fresh() then
    raise exception 'Enter a new two-step code to keep using admin tools' using errcode = '42501';
  end if;
  return v_uid;
end;
$function$;

revoke execute on function app_private.admin_code_fresh() from public, anon, authenticated;
