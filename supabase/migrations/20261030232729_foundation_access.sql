-- Raw rows belong to their owner (or both participants for a shared workflow).
-- App roles get explicit DML grants; no guest has raw-table privileges.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

do $migration$
declare
  v_table record;
begin
  for v_table in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table.relname);
  end loop;
end;
$migration$;

grant select, update on public.profiles to authenticated;
create policy profiles_owner_read on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select, insert, update, delete on public.private_profiles to authenticated;
create policy private_profiles_owner on public.private_profiles
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, delete on public.listings to authenticated;
-- A listing's ID is also its Storage folder and cannot be renamed by a client.
grant update (
  title, category, size_label, description, price_note, city, approx_lat, approx_lng,
  status, retail_value, deposit_note, item_type, price_usd, listing_styles,
  garment_type, ai_review_needed
) on public.listings to authenticated;
create policy listings_owner_read on public.listings
  for select to authenticated using (lender_id = (select auth.uid()));
create policy listings_owner_insert on public.listings
  for insert to authenticated with check (
    lender_id = (select auth.uid()) and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('lender', 'both')
    )
  );
create policy listings_owner_update on public.listings
  for update to authenticated
  using (lender_id = (select auth.uid())) with check (lender_id = (select auth.uid()));
-- A BEFORE DELETE trigger refuses deletion while any files remain in the folder.
create policy listings_owner_delete on public.listings
  for delete to authenticated using (lender_id = (select auth.uid()));

grant select, insert, update, delete on
  public.listing_photos, public.listing_measurements, public.availability to authenticated;
create policy listing_photos_owner on public.listing_photos
  for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_photos.listing_id and l.lender_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.listings l
    where l.id = listing_photos.listing_id and l.lender_id = (select auth.uid())
  ));
create policy listing_measurements_owner on public.listing_measurements
  for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_measurements.listing_id and l.lender_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.listings l
    where l.id = listing_measurements.listing_id and l.lender_id = (select auth.uid())
  ));
create policy availability_owner on public.availability
  for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = availability.listing_id and l.lender_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.listings l
    where l.id = availability.listing_id and l.lender_id = (select auth.uid())
  ));

grant select, insert on public.conversations to authenticated;
create policy conversations_participant_read on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (renter_id, lender_id));
-- The private INSERT trigger validates the listing and its lender without
-- exposing the lender's raw listing through RLS.
create policy conversations_renter_insert on public.conversations
  for insert to authenticated with check (
    renter_id = (select auth.uid()) and renter_id <> lender_id
    and not app_private.is_blocked(renter_id, lender_id)
  );

grant select, insert on public.messages to authenticated;
create policy messages_participant_read on public.messages
  for select to authenticated using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (select auth.uid()) in (c.renter_id, c.lender_id)
  ));
create policy messages_sender_insert on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (select auth.uid()) in (c.renter_id, c.lender_id)
        and not app_private.is_blocked(c.renter_id, c.lender_id)
    )
  );

grant select, insert, update, delete on public.blocks to authenticated;
create policy blocks_owner on public.blocks
  for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

grant select, insert, update, delete on public.rental_outcomes to authenticated;
create policy rental_outcomes_owner on public.rental_outcomes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = rental_outcomes.conversation_id
        and (select auth.uid()) in (c.renter_id, c.lender_id)
    )
  );

grant select, insert on public.reports to authenticated;
create policy reports_owner_read on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
create policy reports_owner_insert on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

grant select, insert, update, delete on public.saved_listings, public.saved_studios to authenticated;
create policy saved_listings_owner on public.saved_listings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_studios_owner on public.saved_studios
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert on public.listing_events to authenticated;
create policy listing_events_owner_read on public.listing_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy listing_events_owner_insert on public.listing_events
  for insert to authenticated with check (user_id = (select auth.uid()));

grant select, insert on public.rentals to authenticated;
-- Participant IDs, listing ID, conversation ID and creation metadata are immutable.
grant update (status, start_date, end_date, updated_by) on public.rentals to authenticated;
create policy rentals_participant_read on public.rentals
  for select to authenticated using ((select auth.uid()) in (renter_id, lender_id));
create policy rentals_participant_insert on public.rentals
  for insert to authenticated with check (
    (select auth.uid()) in (renter_id, lender_id)
    and updated_by = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = rentals.conversation_id and c.listing_id = rentals.listing_id
        and c.renter_id = rentals.renter_id and c.lender_id = rentals.lender_id
    )
  );
create policy rentals_participant_update on public.rentals
  for update to authenticated
  using ((select auth.uid()) in (renter_id, lender_id)) with check (
    (select auth.uid()) in (renter_id, lender_id)
    and updated_by = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = rentals.conversation_id and c.listing_id = rentals.listing_id
        and c.renter_id = rentals.renter_id and c.lender_id = rentals.lender_id
    )
  );

grant select, insert, update, delete on public.conversation_reads to authenticated;
create policy conversation_reads_owner on public.conversation_reads
  for all to authenticated
  using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.conversations c
      where c.id = conversation_reads.conversation_id
        and (select auth.uid()) in (c.renter_id, c.lender_id)
    )
  );

-- Declarations are immutable audit records and are created only through RPCs.
grant select on public.accessory_declarations, public.listing_declarations to authenticated;
create policy accessory_declarations_owner_read on public.accessory_declarations
  for select to authenticated using (user_id = (select auth.uid()));
create policy listing_declarations_owner_read on public.listing_declarations
  for select to authenticated using (user_id = (select auth.uid()));

grant select, insert on public.suggestion_events to authenticated;
create policy suggestion_events_owner_read on public.suggestion_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy suggestion_events_owner_insert on public.suggestion_events
  for insert to authenticated with check (
    user_id = (select auth.uid()) and (listing_id is null or exists (
      select 1 from public.listings l
      where l.id = suggestion_events.listing_id and l.lender_id = (select auth.uid())
    ))
  );

-- us_cities has RLS enabled and deliberately has no raw-table app grants or policy.
-- Its only client access is the bounded search_cities RPC.
grant select, insert, update, delete on all tables in schema public to service_role;

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = true;

-- Public downloads use the bucket endpoint. Metadata and modifications remain
-- restricted to the owner of the listing encoded by the first path component.
create policy listing_photos_storage_owner_read on storage.objects
  for select to authenticated using (
    bucket_id = 'listing-photos' and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.lender_id = (select auth.uid())
    )
  );
create policy listing_photos_storage_owner_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'listing-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.lender_id = (select auth.uid())
    )
  );
create policy listing_photos_storage_owner_update on storage.objects
  for update to authenticated using (
    bucket_id = 'listing-photos' and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.lender_id = (select auth.uid())
    )
  ) with check (
    bucket_id = 'listing-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.lender_id = (select auth.uid())
    )
  );
create policy listing_photos_storage_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'listing-photos' and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(name))[1]
        and l.lender_id = (select auth.uid())
    )
  );

-- Revoke PostgreSQL's inherited EXECUTE default and opt in only app RPCs.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app_private from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public, anon, authenticated;

grant execute on function public.search_cities(text, integer) to anon, authenticated;
-- Policy helper is outside the exposed API schema.
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.my_block_peer_ids() to authenticated;
grant execute on function public.record_accessory_declaration(text, integer, text) to authenticated;
grant execute on function public.record_listing_declaration(uuid, integer) to authenticated;
grant execute on function public.set_conversation_dates(uuid, date, date) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_activity_seen() to authenticated;

-- Existing platform event triggers are preserved. The blanket revoke above also
-- removes client EXECUTE from public.rls_auto_enable() when it exists.
do $migration$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    alter function public.rls_auto_enable() set search_path = '';
  end if;
end;
$migration$;
