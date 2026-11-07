-- P1B part 1: Terms of Use and Privacy Policy acceptance, and consent before body measurements
-- are saved. Apps record acceptance with accept_legal and ask needs_legal_acceptance at sign-in;
-- measurements can be saved only after give_measurements_consent, and
-- withdraw_measurements_consent deletes them.

-- 1. The current version of each legal document. Readable by everyone; only migrations change it.
-- The versions are TERMS_VERSION and PRIVACY_VERSION in apps/web/src/content/legal/config.ts:
-- publishing a new version there needs a migration that updates this row, which makes every
-- user accept it again.
create table public.legal_documents (
  document text not null,
  version text not null,
  url text not null,
  updated_at timestamp with time zone default pg_catalog.now() not null,
  constraint legal_documents_pkey primary key (document),
  constraint legal_documents_document_check check (document in ('terms', 'privacy')),
  constraint legal_documents_version_check check (version ~ '^[0-9]+(\.[0-9]+){0,3}$')
);
insert into public.legal_documents (document, version, url) values
  ('terms', '1.0.0', 'https://dzirent.com/terms'),
  ('privacy', '1.0.0', 'https://dzirent.com/privacy');

-- 2. Who accepted which version, when and where. Written only by accept_legal; removed with the account.
create table public.legal_acceptances (
  id uuid default pg_catalog.gen_random_uuid() not null,
  user_id uuid not null,
  document text not null,
  version text not null,
  platform text not null,
  accepted_at timestamp with time zone default pg_catalog.now() not null,
  constraint legal_acceptances_pkey primary key (id),
  constraint legal_acceptances_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade,
  constraint legal_acceptances_document_fkey foreign key (document)
    references public.legal_documents(document),
  constraint legal_acceptances_platform_check check (platform in ('web', 'android', 'ios')),
  -- The first acceptance of a version is the one kept.
  constraint legal_acceptances_once unique (user_id, document, version)
);

-- New tables get no Data API grants by default, so every grant is explicit.
alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;
revoke all on public.legal_documents, public.legal_acceptances
  from public, anon, authenticated, service_role;
grant select on public.legal_documents to anon, authenticated, service_role;
create policy legal_documents_read on public.legal_documents
  for select to anon, authenticated using (true);
grant select on public.legal_acceptances to authenticated, service_role;
create policy legal_acceptances_owner_read on public.legal_acceptances
  for select to authenticated using (user_id = (select auth.uid()));

-- Records that the caller accepts the current version of both documents, from [p_platform].
create or replace function public.accept_legal(p_platform text)
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
  if p_platform is null or p_platform not in ('web', 'android', 'ios') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  insert into public.legal_acceptances (user_id, document, version, platform)
  select v_uid, d.document, d.version, p_platform
  from public.legal_documents d
  on conflict (user_id, document, version) do nothing;
end;
$function$;

-- True while the caller hasn't accepted the current version of either document. Runs as the
-- caller: it reads the public versions and the caller's own acceptances.
create or replace function public.needs_legal_acceptance()
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.legal_documents d
    where not exists (
      select 1 from public.legal_acceptances a
      where a.user_id = v_uid and a.document = d.document and a.version = d.version
    )
  );
end;
$function$;

-- 3. Consent before body measurements are saved.
alter table public.private_profiles add column measurements_consent_at timestamp with time zone;

-- Measurements saved before consent existed are removed, so everyone is asked fresh.
update public.private_profiles
  set chest_cm = null, waist_cm = null, hips_cm = null,
      shoulder_cm = null, height_cm = null, inseam_cm = null
  where coalesce(chest_cm, waist_cm, hips_cm, shoulder_cm, height_cm, inseam_cm) is not null;

-- Apps can't write the consent time (only the two consent functions can), and a new body
-- measurement value is refused while there is no consent. Clearing a measurement is always allowed.
create or replace function app_private.require_measurements_consent()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_adds boolean;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' then
      new.measurements_consent_at := old.measurements_consent_at;
    else
      -- An upsert reaches this INSERT trigger before its conflict turns it into an update,
      -- so the consent comes from the row that is already there (none for a new row).
      new.measurements_consent_at := (
        select p.measurements_consent_at from public.private_profiles p where p.user_id = new.user_id
      );
    end if;
  end if;

  if tg_op = 'UPDATE' then
    v_adds := (new.chest_cm is not null and new.chest_cm is distinct from old.chest_cm)
      or (new.waist_cm is not null and new.waist_cm is distinct from old.waist_cm)
      or (new.hips_cm is not null and new.hips_cm is distinct from old.hips_cm)
      or (new.shoulder_cm is not null and new.shoulder_cm is distinct from old.shoulder_cm)
      or (new.height_cm is not null and new.height_cm is distinct from old.height_cm)
      or (new.inseam_cm is not null and new.inseam_cm is distinct from old.inseam_cm);
  else
    v_adds := pg_catalog.num_nonnulls(new.chest_cm, new.waist_cm, new.hips_cm,
      new.shoulder_cm, new.height_cm, new.inseam_cm) > 0;
  end if;

  if v_adds and new.measurements_consent_at is null then
    raise exception 'Give consent before saving your measurements.' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create trigger private_profiles_measurements_consent before insert or update on public.private_profiles
  for each row execute function app_private.require_measurements_consent();

-- Gives consent (keeps the first consent time if it was already given) and returns its time.
create or replace function public.give_measurements_consent()
returns timestamp with time zone
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_at timestamp with time zone;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.private_profiles as pp (user_id, measurements_consent_at)
  values (v_uid, pg_catalog.now())
  on conflict (user_id) do update
    set measurements_consent_at = coalesce(pp.measurements_consent_at, pg_catalog.now())
  returning pp.measurements_consent_at into v_at;
  return v_at;
end;
$function$;

-- Withdraws consent: deletes the six body measurements and the consent time. Fit profile and
-- style interests stay (they are not measurements).
create or replace function public.withdraw_measurements_consent()
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
  update public.private_profiles
    set chest_cm = null, waist_cm = null, hips_cm = null,
        shoulder_cm = null, height_cm = null, inseam_cm = null,
        measurements_consent_at = null
    where user_id = v_uid;
end;
$function$;

-- 4. Access to the functions.
revoke execute on function public.accept_legal(text) from public, anon, authenticated;
grant execute on function public.accept_legal(text) to authenticated, service_role;
revoke execute on function public.needs_legal_acceptance() from public, anon, authenticated;
grant execute on function public.needs_legal_acceptance() to authenticated, service_role;
revoke execute on function public.give_measurements_consent() from public, anon, authenticated;
grant execute on function public.give_measurements_consent() to authenticated, service_role;
revoke execute on function public.withdraw_measurements_consent() from public, anon, authenticated;
grant execute on function public.withdraw_measurements_consent() to authenticated, service_role;
revoke execute on function app_private.require_measurements_consent() from public, anon, authenticated;

notify pgrst, 'reload schema';
