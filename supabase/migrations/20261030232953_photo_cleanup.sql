-- Storage files must be removed through the Storage API before deleting a
-- listing. A guarded DELETE makes this true for every client and auth cascade.
create or replace function app_private.require_empty_listing_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'listings' or tg_op <> 'DELETE'
     or (v_uid is not null and v_uid <> old.lender_id)
     or (v_uid is null and session_user not in
       ('postgres', 'supabase_admin', 'supabase_auth_admin')
       and coalesce(pg_catalog.current_setting('role', true), '') <> 'service_role') then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  -- DELETE already holds the parent row lock. This volatile trigger sees
  -- committed metadata from uploads that held a conflicting KEY SHARE lock.
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'listing-photos'
      and pg_catalog.split_part(o.name, '/', 1) = old.id::text
  ) then
    raise exception 'Remove listing photos through the Storage API before deleting the listing.'
      using errcode = '23503';
  end if;
  return old;
end;
$function$;

create trigger listings_require_empty_photo_folder before delete on public.listings
  for each row execute function app_private.require_empty_listing_folder();

-- Storage can finalize a previously authorized upload using its elevated
-- connection. Lock the parent in the actual metadata transaction as well as
-- enforcing caller ownership in the Storage policies. A failed upload after
-- listing deletion is cleaned up by the Storage service.
create or replace function app_private.lock_photo_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if new.bucket_id <> 'listing-photos' then
    return new;
  end if;
  if tg_table_schema <> 'storage' or tg_table_name <> 'objects'
     or tg_op not in ('INSERT', 'UPDATE') then
    raise exception 'Invalid photo context' using errcode = '42501';
  end if;
  if new.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$' then
    raise exception 'Use listing_id/random.ext for photos' using errcode = '22023';
  end if;
  select l.lender_id into v_owner from public.listings l
    where l.id::text = pg_catalog.split_part(new.name, '/', 1)
    for key share;
  if not found or (v_uid is not null and v_uid <> v_owner)
     or (v_uid is null and (
       session_user not in ('postgres', 'supabase_admin', 'supabase_storage_admin')
       and coalesce(pg_catalog.current_setting('role', true), '') not in
         ('service_role', 'supabase_storage_admin')
     )) then
    raise exception 'Not your listing folder' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger listing_photos_lock_parent before insert or update on storage.objects
  for each row execute function app_private.lock_photo_listing();

revoke execute on function app_private.require_empty_listing_folder() from public, anon, authenticated;
revoke execute on function app_private.lock_photo_listing() from public, anon, authenticated;
