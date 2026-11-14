-- C4 (2026-11-13): the payments backend (Stripe Connect, Appendix A of pranalika/architecture.md)
-- and the C3 follow-ups. Payments stay switched off (payments_enabled) and the Stripe keys blank;
-- every payment Edge Function answers "Payments aren't available yet." until both are set.
--
-- Rentals follow-ups (owner decisions):
-- 1. A rental accepted (or paid) but not marked picked up rental_autocancel_days after its start
--    date is cancelled by the expiry job, with an event and the cancellation refund rule.
-- 2. A listing with no availability windows is always available (request_rental takes any future
--    dates; browse_listings already listed it). Windows the lender adds still limit the dates.
-- 3. New pushes: rental_cancelled (to the other person; both for a cancel by Dzirent) and
--    rental_expired (to both); claim_filed, claim_decided and deposit_hold_ending for payments.
-- 4. admin_end_rental: an admin ends a stuck rental as cancelled or completed, with the refund and
--    deposit hold choice when it has a payment.
--
-- Payments model (only while payments_enabled is on; nothing changes while it is off):
--   accept -> awaiting_payment; a succeeded payment (webhook) -> paid; marking picked up needs the
--   deposit hold first when the rental has a deposit; return opens the claim window; no claim by
--   its end -> hold released, completed; an accepted claim captures up to the claimed amount; a
--   disputed claim waits for an admin decision.
-- Money moves only in the Edge Functions (Stripe API). The database decides and records: each
-- server-side money step is a row in app_private.payment_operations, sent to stripe-refund or
-- stripe-deposit through the outbox (retries; idempotency key "dz-op-<operation id>").
-- Dzirent never stores card numbers or bank details: Stripe holds them; only Stripe ids are kept.

-- 1. Listings: an optional deposit (empty = no deposit). Editors show it in C5. -----------------
alter table public.listings
  add column deposit_amount numeric(10,2) constraint listings_deposit_amount_check
    check (deposit_amount is null or (deposit_amount > 0 and deposit_amount <= 99999.99));
comment on column public.listings.deposit_amount is 'Refundable deposit in USD held on the renter''s card at pickup (C4); null = no deposit. deposit_note stays as free text.';
grant update (deposit_amount) on public.listings to authenticated;

-- 2. Stripe customers and payout accounts -------------------------------------------------------
-- A renter's Stripe customer (the saved card lives at Stripe). The owner can see that it exists,
-- not its id; only the server writes.
create table public.stripe_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamp with time zone not null default pg_catalog.now()
);
alter table public.stripe_customers enable row level security;
revoke all on public.stripe_customers from anon, authenticated;
grant select (user_id, created_at) on public.stripe_customers to authenticated;
create policy stripe_customers_owner_read on public.stripe_customers
  for select to authenticated using (user_id = (select auth.uid()));
comment on table public.stripe_customers is 'C4: the renter''s Stripe customer id (server-written). Card details stay at Stripe.';

-- A lender's Stripe Express account and whether Stripe lets it take charges and pay out.
create table public.payout_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamp with time zone not null default pg_catalog.now(),
  updated_at timestamp with time zone not null default pg_catalog.now()
);
alter table public.payout_accounts enable row level security;
revoke all on public.payout_accounts from anon, authenticated;
grant select on public.payout_accounts to authenticated;
create policy payout_accounts_owner_read on public.payout_accounts
  for select to authenticated using (user_id = (select auth.uid()));
comment on table public.payout_accounts is 'C4: the lender''s Stripe Express account (server-written). Bank details stay at Stripe.';

-- 3. Rentals: the payment columns (server-written, readable by the two people) ------------------
alter table public.rentals
  add column deposit_amount numeric(10,2) check (deposit_amount is null or deposit_amount > 0),
  add column payment_intent_id text,
  add column payment_status text not null default 'none'
    constraint rentals_payment_status_check check (payment_status in
      ('none', 'pending', 'paid', 'failed', 'canceled', 'partially_refunded', 'refunded')),
  add column fee_amount numeric(10,2),
  add column tax_amount numeric(10,2),
  add column refund_amount numeric(10,2) not null default 0 check (refund_amount >= 0),
  add column deposit_intent_id text,
  add column deposit_status text not null default 'none'
    constraint rentals_deposit_status_check check (deposit_status in
      ('none', 'pending', 'held', 'released', 'captured', 'failed')),
  add column deposit_capture_before timestamp with time zone,
  add column deposit_captured_amount numeric(10,2) not null default 0 check (deposit_captured_amount >= 0),
  add column deposit_warned_at timestamp with time zone,
  add column claim_window_ends_at timestamp with time zone;
create unique index rentals_payment_intent_idx on public.rentals (payment_intent_id) where payment_intent_id is not null;
create unique index rentals_deposit_intent_idx on public.rentals (deposit_intent_id) where deposit_intent_id is not null;
create index rentals_claim_window_idx on public.rentals (claim_window_ends_at) where status = 'returned';
comment on column public.rentals.deposit_amount is 'Snapshot of listings.deposit_amount at request time (C4).';
comment on column public.rentals.payment_status is 'The rental payment at Stripe (C4): none, pending, paid, failed, canceled, partially_refunded, refunded.';
comment on column public.rentals.deposit_status is 'The deposit hold at Stripe (C4): none, pending, held, released, captured, failed.';
comment on column public.rentals.deposit_capture_before is 'When Stripe''s authorization ends (capture_before); the nightly job renews the hold before then.';

-- The card a rental was paid with (a Stripe payment method id, not card data): used off-session
-- for the deposit hold. Closed: the lender reads the rental row, never the renter's card id.
create table app_private.rental_payment_methods (
  rental_id uuid primary key references public.rentals (id) on delete cascade,
  payment_method_id text not null check (payment_method_id ~ '^(pm|card)_[A-Za-z0-9_]+$'),
  created_at timestamp with time zone not null default pg_catalog.now()
);
alter table app_private.rental_payment_methods enable row level security;
revoke all on app_private.rental_payment_methods from public, anon, authenticated, service_role;

-- 4. Claims against the deposit -----------------------------------------------------------------
create table public.rental_claims (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  rental_id uuid not null unique references public.rentals (id) on delete cascade,
  lender_id uuid references public.profiles (id) on delete set null,
  renter_id uuid references public.profiles (id) on delete set null,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null check (pg_catalog.char_length(reason) between 3 and 500),
  evidence_paths text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'accepted', 'disputed', 'decided')),
  renter_note text check (pg_catalog.char_length(renter_note) <= 300),
  decided_by uuid,
  decision text check (pg_catalog.char_length(decision) <= 500),
  decision_amount numeric(10,2) check (decision_amount is null or decision_amount >= 0),
  created_at timestamp with time zone not null default pg_catalog.now(),
  responded_at timestamp with time zone,
  decided_at timestamp with time zone,
  updated_at timestamp with time zone not null default pg_catalog.now()
);
create index rental_claims_status_idx on public.rental_claims (status) where status in ('open', 'disputed');
create index rental_claims_lender_idx on public.rental_claims (lender_id);
create index rental_claims_renter_idx on public.rental_claims (renter_id);
alter table public.rental_claims enable row level security;
revoke all on public.rental_claims from anon, authenticated;
grant select on public.rental_claims to authenticated;
create policy rental_claims_participant_read on public.rental_claims
  for select to authenticated using ((select auth.uid()) in (lender_id, renter_id));
comment on table public.rental_claims is 'C4: a lender''s damage claim against the deposit (file_claim, respond_claim, admin_decide_claim). Written only by those functions.';

-- 5. Stripe events (idempotency), card disputes and money operations (closed) -------------------
create table app_private.payment_events (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique,
  type text not null,
  payload_hash text not null,
  received_at timestamp with time zone not null default pg_catalog.now(),
  processed_at timestamp with time zone,
  result text
);
alter table app_private.payment_events enable row level security;
revoke all on app_private.payment_events from public, anon, authenticated, service_role;
comment on table app_private.payment_events is 'C4: every Stripe webhook event once (id unique): type, a hash of the payload (not the payload), when it was received and processed.';

create table app_private.card_disputes (
  stripe_dispute_id text primary key,
  rental_id uuid references public.rentals (id) on delete set null,
  payment_intent_id text,
  amount numeric(10,2),
  reason text,
  status text,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  updated_at timestamp with time zone not null default pg_catalog.now()
);
alter table app_private.card_disputes enable row level security;
revoke all on app_private.card_disputes from public, anon, authenticated, service_role;

create table app_private.payment_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  rental_id uuid references public.rentals (id) on delete set null,
  claim_id uuid references public.rental_claims (id) on delete set null,
  kind text not null check (kind in ('deposit_place', 'deposit_release', 'deposit_capture', 'deposit_renew', 'refund', 'payment_cancel')),
  amount numeric(10,2) check (amount is null or amount >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  stripe_id text,
  error text check (pg_catalog.char_length(error) <= 300),
  details jsonb,
  requested_by uuid,
  reason text check (pg_catalog.char_length(reason) <= 500),
  attempts integer not null default 0,
  created_at timestamp with time zone not null default pg_catalog.now(),
  updated_at timestamp with time zone not null default pg_catalog.now(),
  finished_at timestamp with time zone
);
create index payment_operations_rental_idx on app_private.payment_operations (rental_id);
create index payment_operations_open_idx on app_private.payment_operations (status) where status in ('queued', 'running', 'failed');
alter table app_private.payment_operations enable row level security;
revoke all on app_private.payment_operations from public, anon, authenticated, service_role;
comment on table app_private.payment_operations is 'C4: each server-side money step (refund, cancel an unpaid payment, place / release / capture / renew a deposit hold) with its Stripe id and outcome. Idempotency key dz-op-<id>.';

-- 6. The outbox carries the payment steps --------------------------------------------------------
alter table app_private.async_jobs drop constraint async_jobs_kind_check;
alter table app_private.async_jobs add constraint async_jobs_kind_check
  check (kind in ('send_push', 'scan_listing', 'stripe_deposit', 'stripe_refund'));

create or replace function app_private.dispatch_job(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job app_private.async_jobs;
  v_url text;
  v_secret text;
  v_header text;
  v_request bigint;
begin
  select * into v_job from app_private.async_jobs j where j.id = p_id for update;
  if not found or v_job.status <> 'pending' then
    return;
  end if;
  if v_job.kind = 'scan_listing' and not exists (
    select 1 from public.listing_scans s
    where s.id = (v_job.payload->>'scan_id')::uuid and s.status = 'queued'
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the photo check is no longer waiting',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;
  if v_job.kind in ('stripe_deposit', 'stripe_refund') and not exists (
    select 1 from app_private.payment_operations o
    where o.id = (v_job.payload->>'operation_id')::uuid and o.status in ('queued', 'running')
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the payment step already finished',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;

  if v_job.kind = 'send_push' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'send_push_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'send_push_secret';
    v_header := 'x-send-push-secret';
  elsif v_job.kind = 'scan_listing' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'scan_listing_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'scan_listing_secret';
    v_header := 'x-scan-listing-secret';
  else
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds
      where ds.name = case v_job.kind when 'stripe_deposit' then 'stripe_deposit_url' else 'stripe_refund_url' end;
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'payments_job_secret';
    v_header := 'x-payments-secret';
  end if;

  update app_private.async_jobs
    set attempts = attempts + 1, dispatched_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_id;
  if v_url is null or v_secret is null then
    perform app_private.job_failed(p_id, 'not configured: the address or secret is missing in Vault');
    return;
  end if;

  v_request := net.http_post(
    url := v_url,
    body := v_job.payload,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', v_header, v_secret),
    timeout_milliseconds := 10000
  );
  update app_private.async_jobs
    set status = 'running', request_id = v_request, updated_at = pg_catalog.now()
    where id = p_id;
end;
$$;

create or replace function app_private.job_failed(p_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job app_private.async_jobs;
begin
  select * into v_job from app_private.async_jobs j where j.id = p_id for update;
  if not found then
    return;
  end if;
  if v_job.attempts >= app_private.job_max_attempts() then
    update app_private.async_jobs
      set status = 'dead', last_error = pg_catalog.left(coalesce(p_error, 'failed'), 300), request_id = null,
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    if v_job.kind = 'scan_listing' then
      perform public.vision_fail_scan((v_job.payload->>'scan_id')::uuid, 'dispatch_failed');
    elsif v_job.kind in ('stripe_deposit', 'stripe_refund') then
      -- C4: the payment step shows as failed on the admin Payments page.
      update app_private.payment_operations
        set status = 'failed', error = pg_catalog.left('The payment job could not run: ' || coalesce(p_error, 'failed'), 300),
            finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
        where id = (v_job.payload->>'operation_id')::uuid and status in ('queued', 'running');
    end if;
  else
    update app_private.async_jobs
      set status = 'pending', last_error = pg_catalog.left(coalesce(p_error, 'failed'), 300), request_id = null,
          next_attempt_at = pg_catalog.now() + app_private.job_backoff(v_job.attempts),
          updated_at = pg_catalog.now()
      where id = p_id;
  end if;
end;
$$;

-- Admin job views: the two payment kinds too.
create or replace function public.admin_jobs_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
      'kinds', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'kind', k.kind,
            'pending', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'pending'),
            'running', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'running'),
            'done_day', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'done'
                           and j.finished_at > pg_catalog.now() - interval '1 day'),
            'dead', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'dead'),
            'retrying', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'pending'
                           and j.attempts > 0))
          order by k.ord)
        from pg_catalog.unnest(array['send_push', 'scan_listing', 'stripe_deposit', 'stripe_refund']) with ordinality as k(kind, ord)),
      'oldest_waiting_at', (select min(j.created_at) from app_private.async_jobs j where j.status in ('pending', 'running')),
      'last_dead_at', (select max(j.finished_at) from app_private.async_jobs j where j.status = 'dead'),
      'schedule_minutes', pg_catalog.jsonb_build_array(1, 5, 30, 120),
      'max_attempts', app_private.job_max_attempts())
    into v_result;
  perform app_private.log_admin_action(v_admin, 'view_background_jobs', null, null, null, null, null);
  return v_result;
end;
$$;

create or replace function public.admin_list_dead_jobs(p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', j.id,
      'kind', j.kind,
      'attempts', j.attempts,
      'last_error', j.last_error,
      'created_at', j.created_at,
      'died_at', j.finished_at,
      'push_kind', case when j.kind = 'send_push' then j.payload->>'kind' end,
      'conversation_id', case when j.kind = 'send_push' then j.payload->>'conversation_id' end,
      'scan_id', case when j.kind = 'scan_listing' then j.payload->>'scan_id' end,
      'operation_id', case when j.kind in ('stripe_deposit', 'stripe_refund') then j.payload->>'operation_id' end)
      order by j.finished_at desc, j.id desc), '[]'::jsonb)
    into v_rows
  from (
    select * from app_private.async_jobs d where d.status = 'dead'
    order by d.finished_at desc, d.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) j;
  perform app_private.log_admin_action(v_admin, 'view_dead_jobs', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$$;

-- Vault: where the two payment functions live, and the secret that proves the database is calling
-- (generated here, never in this file; the same value is the functions' PAYMENTS_JOB_SECRET).
do $vault$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'payments_job_secret') then
    perform vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'), 'payments_job_secret',
      'Proves to the stripe-deposit and stripe-refund Edge Functions that this database is calling');
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'stripe_deposit_url') then
    perform vault.create_secret('https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/stripe-deposit',
      'stripe_deposit_url', 'Address of the stripe-deposit Edge Function');
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'stripe_refund_url') then
    perform vault.create_secret('https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/stripe-refund',
      'stripe_refund_url', 'Address of the stripe-refund Edge Function');
  end if;
end
$vault$;

-- 7. Helpers -----------------------------------------------------------------------------------
create function app_private.money_label(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select '$' || pg_catalog.to_char(coalesce(p_amount, 0), 'FM999999990.00') $$;

-- What is still refundable of the rental price (total + sales tax): paid minus refunded minus
-- refunds already on their way.
create function app_private.refundable_amount(p_rental public.rentals)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_rental.payment_status in ('paid', 'partially_refunded')
    then greatest(0, coalesce(p_rental.total, 0) + coalesce(p_rental.tax_amount, 0) - p_rental.refund_amount
      - coalesce((select pg_catalog.sum(o.amount) from app_private.payment_operations o
                  where o.rental_id = p_rental.id and o.kind = 'refund' and o.status in ('queued', 'running')), 0))
    else 0 end;
$$;

-- The cancellation rule (settings): a lender cancellation refunds in full; a renter (or automatic)
-- cancellation refunds in full until cancellation_refund_cutoff_hours before the start of the start
-- date in the rental time zone, after that late_cancellation_refund_percent of the rental price.
create function app_private.cancellation_refund(p_rental public.rentals, p_by_lender boolean)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_left numeric := app_private.refundable_amount(p_rental);
  v_paid numeric := coalesce(p_rental.total, 0) + coalesce(p_rental.tax_amount, 0);
  v_start timestamp with time zone;
begin
  if v_left <= 0 then
    return 0;
  end if;
  if p_by_lender then
    return v_left;
  end if;
  v_start := p_rental.start_date::timestamp at time zone app_private.setting_text('rental_timezone');
  if pg_catalog.now() <= v_start - pg_catalog.make_interval(hours => app_private.setting_int('cancellation_refund_cutoff_hours')) then
    return v_left;
  end if;
  return least(v_left, greatest(0,
    pg_catalog.round(v_paid * app_private.setting_num('late_cancellation_refund_percent') / 100, 2) - p_rental.refund_amount));
end;
$$;

-- The sales tax hook: $0 while sales_tax_enabled is off, and $0 when on until the tax adviser
-- decides how it is computed (Stripe Tax later).
create function app_private.sales_tax_amount(p_rental public.rentals)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$ select case when app_private.setting_bool('sales_tax_enabled') then 0::numeric else 0::numeric end $$;

-- One money step: a row in payment_operations, sent through the outbox to stripe-refund
-- (refund, payment_cancel) or stripe-deposit (the deposit steps).
create function app_private.enqueue_payment_operation(p_rental uuid, p_kind text, p_amount numeric,
  p_admin uuid default null, p_reason text default null, p_claim uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app_private.payment_operations (rental_id, kind, amount, requested_by, reason, claim_id)
  values (p_rental, p_kind, p_amount, p_admin, pg_catalog.left(p_reason, 500), p_claim)
  returning id into v_id;
  perform app_private.enqueue_job(case when p_kind in ('refund', 'payment_cancel') then 'stripe_refund' else 'stripe_deposit' end,
    pg_catalog.jsonb_build_object('operation_id', v_id));
  return v_id;
end;
$$;

-- Releases the deposit hold (once) when the rental has one.
create function app_private.release_deposit(p_rental public.rentals, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_rental.deposit_intent_id is null or p_rental.deposit_status not in ('held', 'pending')
     or exists (select 1 from app_private.payment_operations o
                where o.rental_id = p_rental.id and o.kind in ('deposit_release', 'deposit_capture')
                  and o.status in ('queued', 'running', 'done')) then
    return null;
  end if;
  return app_private.enqueue_payment_operation(p_rental.id, 'deposit_release', p_rental.deposit_amount, null, p_reason);
end;
$$;

-- After a cancellation by a person or by the system: the refund rule, an unpaid payment cancelled,
-- the deposit hold released.
create function app_private.after_cancel_payments(p_rental public.rentals, p_by_lender boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund numeric;
begin
  if p_rental.payment_status in ('paid', 'partially_refunded') then
    v_refund := app_private.cancellation_refund(p_rental, p_by_lender);
    if v_refund > 0 then
      perform app_private.enqueue_payment_operation(p_rental.id, 'refund', v_refund, null, p_reason);
    end if;
  elsif p_rental.payment_intent_id is not null and p_rental.payment_status in ('pending', 'failed') then
    perform app_private.enqueue_payment_operation(p_rental.id, 'payment_cancel', null, null, p_reason);
  end if;
  perform app_private.release_deposit(p_rental, p_reason);
end;
$$;

-- The rental pushes (C3) plus the C4 kinds. p_detail is extra text for the body (an amount).
drop function app_private.queue_rental_push(text, public.rentals, uuid, uuid);
create function app_private.queue_rental_push(p_kind text, p_rental public.rentals, p_recipient uuid,
                                              p_sender uuid default null, p_detail text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages boolean;
  v_reminders boolean;
  v_name text;
  v_listing text;
  v_dates text;
  v_detail text := app_private.push_safe_text(p_detail, 120);
  v_title text;
  v_body text;
begin
  if p_recipient is null or p_recipient = p_sender then
    return false;
  end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = p_rental.renter_id and bl.blocked_id = p_rental.lender_id)
       or (bl.blocker_id = p_rental.lender_id and bl.blocked_id = p_rental.renter_id)
  ) then
    return false;
  end if;
  select ns.messages, ns.rental_reminders into v_messages, v_reminders
  from public.notification_settings ns where ns.user_id = p_recipient;
  if not found then
    v_messages := true;
    v_reminders := true;
  end if;
  if (p_kind in ('pickup_tomorrow', 'return_tomorrow', 'return_overdue') and not v_reminders)
     or (p_kind not in ('pickup_tomorrow', 'return_tomorrow', 'return_overdue') and not v_messages)
     or not exists (select 1 from public.device_tokens dt where dt.user_id = p_recipient)
     or not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'send_push_url') then
    return false;
  end if;

  select app_private.push_safe_text(coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name), 60)
    into v_name from public.profiles p where p.id = p_sender;
  select app_private.push_safe_text(l.title, 80) into v_listing from public.listings l where l.id = p_rental.listing_id;
  v_dates := case when p_rental.start_date is not null and p_rental.end_date is not null
                  then app_private.push_dates_label(p_rental.start_date, p_rental.end_date) end;

  case p_kind
    when 'rental_request' then
      v_title := 'Rental request' || coalesce(' from ' || v_name, '');
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing,
        case when p_rental.total is not null then p_rental.days || case when p_rental.days = 1 then ' day' else ' days' end
          || ' · $' || pg_catalog.to_char(p_rental.total, 'FM999999990.00') end);
    when 'rental_accepted' then
      v_title := coalesce(v_name, 'The lender') || ' accepted your request';
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing);
    when 'rental_declined' then
      v_title := coalesce(v_name, 'The lender') || ' declined your request';
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing);
    when 'pickup_tomorrow' then
      v_title := 'Pickup tomorrow';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
    when 'return_tomorrow' then
      v_title := 'Return due tomorrow';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
    when 'return_overdue' then
      v_title := 'Return overdue';
      v_body := coalesce(v_listing, 'The piece') || ' was due back '
        || pg_catalog.to_char(p_rental.end_date::timestamp, 'Mon FMDD') || '.';
    when 'rental_completed' then
      v_title := 'Rental completed';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates, v_detail);
    when 'rental_cancelled' then
      v_title := coalesce(v_name || ' cancelled the rental', 'Rental cancelled');
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing, v_detail);
    when 'rental_expired' then
      v_title := 'Rental request expired';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
    when 'claim_filed' then
      v_title := coalesce(v_name, 'The lender') || ' filed a claim';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_detail);
    when 'claim_decided' then
      v_title := 'Claim decided';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_detail);
    when 'deposit_hold_ending' then
      v_title := 'Deposit hold renews';
      v_body := pg_catalog.concat_ws(' · ', v_listing, 'A new hold replaces the current one before it ends.');
    else
      return false;
  end case;

  perform app_private.enqueue_job('send_push', pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'conversation_id', p_rental.conversation_id,
    'recipient_id', p_recipient,
    'title', v_title,
    'body', nullif(v_body, '')));
  return true;
exception when others then
  -- A push never stops a rental change.
  raise warning 'Rental push skipped: %', sqlerrm;
  return false;
end;
$$;

-- 8. The rental functions with the follow-ups and the payment rules ------------------------------
-- request_rental: a listing with no availability windows takes any dates from today; the deposit
-- snapshot; the request deadline from the setting.
create or replace function public.request_rental(p_listing_id uuid, p_start date default null, p_end date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.listings;
  v_conv public.conversations;
  v_start date := p_start;
  v_end date := p_end;
  v_days integer;
  v_rental public.rentals;
  v_hours integer := app_private.setting_int('rental_request_hours');
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  select * into v_listing from public.listings l where l.id = p_listing_id;
  if not found or v_listing.status <> 'active' or v_listing.hold is not null or v_listing.price_usd is null then
    raise exception 'DZ-E4011: This piece isn''t available to rent right now.' using errcode = 'P0001';
  end if;
  if v_listing.lender_id = v_uid then
    raise exception 'DZ-E4004: You can''t rent your own piece.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_listing.lender_id, true);

  select * into v_conv from public.conversations c where c.listing_id = p_listing_id and c.renter_id = v_uid;
  if found and (v_start is null or v_end is null) then
    v_start := coalesce(v_start, v_conv.requested_start);
    v_end := coalesce(v_end, v_conv.requested_end);
  end if;
  if v_start is null or v_end is null then
    raise exception 'DZ-E4005: Choose the dates you want to rent.' using errcode = '22023', hint = 'dates';
  end if;
  if v_end < v_start then
    raise exception 'DZ-E4007: The last day can''t be before the first day.' using errcode = '22023', hint = 'dates';
  end if;
  if v_start < app_private.rental_today() then
    raise exception 'DZ-E4006: Pick dates from today on.' using errcode = '22023', hint = 'dates';
  end if;
  -- C4: no windows = always available; windows the lender adds limit the dates.
  if exists (select 1 from public.availability av where av.listing_id = p_listing_id)
     and not coalesce((
       select pg_catalog.range_agg(pg_catalog.daterange(av.start_date, av.end_date, '[]'))
       from public.availability av where av.listing_id = p_listing_id
     ) operator(pg_catalog.@>) pg_catalog.daterange(v_start, v_end, '[]'), false) then
    raise exception 'DZ-E4008: Those dates aren''t open for this piece. Pick dates inside its available dates.'
      using errcode = 'P0001', hint = 'dates';
  end if;
  if exists (
    select 1 from public.rentals r
    where r.listing_id = p_listing_id
      and r.status in ('accepted', 'awaiting_payment', 'paid', 'picked_up')
      and pg_catalog.daterange(r.start_date, r.end_date, '[]') operator(pg_catalog.&&) pg_catalog.daterange(v_start, v_end, '[]')
  ) then
    raise exception 'DZ-E4009: Those dates are already booked. Pick other dates.' using errcode = 'P0001', hint = 'dates';
  end if;

  if v_conv.id is null then
    perform public.start_conversation(p_listing_id, null, null);
    select * into v_conv from public.conversations c where c.listing_id = p_listing_id and c.renter_id = v_uid;
  end if;
  if exists (
    select 1 from public.rentals r
    where r.conversation_id = v_conv.id
      and r.status in ('requested', 'accepted', 'awaiting_payment', 'paid', 'picked_up', 'returned', 'claimed', 'disputed')
  ) then
    raise exception 'DZ-E4010: You already have a rental for this piece in progress.' using errcode = 'P0001';
  end if;

  perform app_private.enforce_rate_limit(v_uid, 'rental_request');

  v_days := app_private.rental_days(v_start, v_end);
  insert into public.rentals (conversation_id, listing_id, renter_id, lender_id, status, start_date, end_date,
                              updated_by, price_per_day, days, total, currency, expires_at, deposit_amount)
  values (v_conv.id, p_listing_id, v_uid, v_listing.lender_id, 'requested', v_start, v_end,
          v_uid, v_listing.price_usd, v_days, v_listing.price_usd * v_days, 'USD',
          pg_catalog.now() + pg_catalog.make_interval(hours => v_hours), v_listing.deposit_amount)
  returning * into v_rental;
  insert into public.rental_events (rental_id, from_status, to_status, actor_id, actor_role)
  values (v_rental.id, null, 'requested', v_uid, 'renter');
  perform app_private.queue_rental_push('rental_request', v_rental, v_rental.lender_id, v_uid);
  return v_rental.id;
end;
$$;

-- cancel_rental: as in C3, plus the refund rule, the deposit hold released and a push to the other
-- person.
create or replace function public.cancel_rental(p_rental_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_reason);
  v_other uuid;
begin
  v_other := case when v_uid = v_rental.renter_id then v_rental.lender_id else v_rental.renter_id end;
  perform app_private.rental_guard(v_uid, v_other, false);
  if v_rental.status = 'requested' then
    if v_uid <> v_rental.renter_id then
      raise exception 'DZ-E4018: To turn down a request, decline it.' using errcode = 'P0001';
    end if;
  elsif v_rental.status not in ('accepted', 'awaiting_payment', 'paid') then
    raise exception 'DZ-E4014: This rental can''t be cancelled now.' using errcode = 'P0001';
  end if;
  v_rental := app_private.rental_move(v_rental, 'cancelled', v_uid, v_note);
  perform app_private.after_cancel_payments(v_rental, v_uid = v_rental.lender_id,
    case when v_uid = v_rental.lender_id then 'Cancelled by the lender' else 'Cancelled by the renter' end);
  perform app_private.queue_rental_push('rental_cancelled', v_rental, v_other, v_uid);
  return 'cancelled';
end;
$$;

-- mark_picked_up: a paid rental with a deposit needs the hold in place first (stripe-deposit
-- "place" does both).
create or replace function public.mark_picked_up(p_rental_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_note);
begin
  if v_uid <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_rental.renter_id, true);
  if v_rental.status not in ('accepted', 'paid') then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  if app_private.rental_photo_count(v_rental.id, 'pickup', v_uid) < 2 then
    raise exception 'DZ-E4020: Add at least 2 photos of the piece first.' using errcode = 'P0001', hint = 'photos';
  end if;
  if v_rental.status = 'paid' and coalesce(v_rental.deposit_amount, 0) > 0 and v_rental.deposit_status <> 'held' then
    raise exception 'DZ-E4033: Place the deposit hold before marking the piece picked up.' using errcode = 'P0001';
  end if;
  perform app_private.rental_move(v_rental, 'picked_up', v_uid, v_note);
  return 'picked_up';
end;
$$;

-- mark_returned: with a deposit hold, the rental waits in returned for the claim window
-- (claim_window_hours); otherwise it completes at once, as with payments off.
create or replace function public.mark_returned(p_rental_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_note);
begin
  if v_uid <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_rental.renter_id, false);
  if v_rental.status <> 'picked_up' then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  if app_private.rental_photo_count(v_rental.id, 'return', v_uid) < 2 then
    raise exception 'DZ-E4020: Add at least 2 photos of the piece first.' using errcode = 'P0001', hint = 'photos';
  end if;
  v_rental := app_private.rental_move(v_rental, 'returned', v_uid, v_note);
  if coalesce(v_rental.deposit_amount, 0) > 0 and v_rental.deposit_intent_id is not null
     and v_rental.deposit_status in ('held', 'pending') then
    update public.rentals
      set claim_window_ends_at = pg_catalog.now() + pg_catalog.make_interval(hours => app_private.setting_int('claim_window_hours'))
      where id = v_rental.id;
    return 'returned';
  end if;
  v_rental := app_private.rental_move(v_rental, 'completed', null,
    case when v_rental.payment_intent_id is null then 'Completed on return (payments are off)'
         else 'Completed on return (no deposit)' end);
  perform app_private.queue_rental_push('rental_completed', v_rental, v_rental.renter_id, v_uid);
  return 'completed';
end;
$$;

-- complete_rental: returned -> completed by the lender (waiving a claim) or the server; the deposit
-- hold is released.
create or replace function public.complete_rental(p_rental_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals;
begin
  if v_uid is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
    end if;
    select * into v_rental from public.rentals r where r.id = p_rental_id for update;
    if not found then
      raise exception 'DZ-E4001: Rental not found' using errcode = 'P0002';
    end if;
  else
    v_rental := app_private.rental_for_actor(p_rental_id, v_uid);
    if v_uid <> v_rental.lender_id then
      raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
    end if;
    perform app_private.rental_guard(v_uid, v_rental.renter_id, false);
  end if;
  if v_rental.status <> 'returned' then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  v_rental := app_private.rental_move(v_rental, 'completed', v_uid, null);
  perform app_private.release_deposit(v_rental, 'Completed without a claim');
  perform app_private.queue_rental_push('rental_completed', v_rental, v_rental.renter_id, v_uid);
  return 'completed';
end;
$$;

-- 9. Claims ------------------------------------------------------------------------------------
-- file_claim: the lender, while returned and inside the claim window, for up to the deposit, with
-- a reason and at least one of this rental's return photos.
create function public.file_claim(p_rental_id uuid, p_amount numeric, p_reason text, p_photo_paths text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_paths text[];
  v_claim uuid;
begin
  if v_uid <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_rental.renter_id, false);
  if exists (select 1 from public.rental_claims c where c.rental_id = v_rental.id) then
    raise exception 'DZ-E4048: A claim was already filed for this rental.' using errcode = 'P0001';
  end if;
  if coalesce(v_rental.deposit_amount, 0) <= 0 or v_rental.deposit_intent_id is null then
    raise exception 'DZ-E4047: This rental has no deposit to claim from.' using errcode = 'P0001';
  end if;
  if v_rental.status <> 'returned' or v_rental.claim_window_ends_at is null or v_rental.claim_window_ends_at <= pg_catalog.now() then
    raise exception 'DZ-E4040: Claims can be filed only after the return, until the claim window ends.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_rental.deposit_amount or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', hint = 'amount', message =
      'DZ-E4041: Claim an amount above $0 and up to the deposit (' || app_private.money_label(v_rental.deposit_amount) || ').';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) not between 3 and 500 then
    raise exception 'DZ-E4042: Give a reason for the claim (3 to 500 characters).' using errcode = '22023', hint = 'reason';
  end if;
  select pg_catalog.array_agg(distinct p) into v_paths from pg_catalog.unnest(coalesce(p_photo_paths, '{}')) p;
  if v_paths is null or pg_catalog.cardinality(v_paths) > 10 or exists (
    select 1 from pg_catalog.unnest(v_paths) p
    where not exists (select 1 from storage.objects o
                      where o.bucket_id = 'rental-photos' and o.name = p
                        and o.name like v_rental.id::text || '/return/%')
  ) then
    raise exception 'DZ-E4043: Add at least one return photo of this rental as evidence.' using errcode = '22023', hint = 'photos';
  end if;

  insert into public.rental_claims (rental_id, lender_id, renter_id, amount, reason, evidence_paths)
  values (v_rental.id, v_rental.lender_id, v_rental.renter_id, p_amount, v_reason, v_paths)
  returning id into v_claim;
  v_rental := app_private.rental_move(v_rental, 'claimed', v_uid, pg_catalog.left('Claim for ' || app_private.money_label(p_amount) || ': ' || v_reason, 300));
  perform app_private.queue_rental_push('claim_filed', v_rental, v_rental.renter_id, v_uid,
    app_private.money_label(p_amount) || ' from the deposit');
  return v_claim;
end;
$$;

-- respond_claim: the renter accepts (the claimed amount is captured, the rental completes) or
-- disputes (an admin decides).
create function public.respond_claim(p_claim_id uuid, p_answer text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.rental_claims;
  v_rental public.rentals;
  v_note text := app_private.rental_note(p_note);
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  select * into v_claim from public.rental_claims c where c.id = p_claim_id for update;
  if not found or v_uid not in (v_claim.renter_id, v_claim.lender_id) then
    raise exception 'DZ-E4044: Claim not found' using errcode = 'P0002';
  end if;
  if v_uid <> v_claim.renter_id then
    raise exception 'DZ-E4032: Only the renter can do this.' using errcode = '42501';
  end if;
  v_rental := app_private.rental_for_actor(v_claim.rental_id, v_uid);
  perform app_private.rental_guard(v_uid, v_rental.lender_id, false);
  if p_answer is null or p_answer not in ('accept', 'dispute') then
    raise exception 'DZ-E4046: Answer accept or dispute.' using errcode = '22023';
  end if;
  if v_claim.status <> 'open' or v_rental.status <> 'claimed' then
    raise exception 'DZ-E4045: This claim can''t be changed now.' using errcode = 'P0001';
  end if;

  if p_answer = 'accept' then
    update public.rental_claims
      set status = 'accepted', renter_note = v_note, responded_at = pg_catalog.now(),
          decision_amount = v_claim.amount, decided_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_claim.id;
    v_rental := app_private.rental_move(v_rental, 'completed', v_uid, coalesce(v_note, 'Claim accepted'));
    perform app_private.enqueue_payment_operation(v_rental.id, 'deposit_capture', v_claim.amount, null,
      'Claim accepted by the renter', v_claim.id);
    perform app_private.queue_rental_push('claim_decided', v_rental, v_rental.lender_id, v_uid,
      app_private.money_label(v_claim.amount) || ' accepted by the renter');
    return 'accepted';
  end if;
  update public.rental_claims
    set status = 'disputed', renter_note = v_note, responded_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_claim.id;
  perform app_private.rental_move(v_rental, 'disputed', v_uid, coalesce(v_note, 'Claim disputed'));
  return 'disputed';
end;
$$;

-- 10. Background: expiry, automatic cancel, claim windows, deposit holds -------------------------
-- The claim window ended with no claim: the hold is released and the rental completes.
create function app_private.close_claim_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_count integer := 0;
begin
  for v_rental in
    select * from public.rentals r
    where r.status = 'returned' and r.claim_window_ends_at is not null and r.claim_window_ends_at <= pg_catalog.now()
      and not exists (select 1 from public.rental_claims c where c.rental_id = r.id)
    order by r.claim_window_ends_at for update skip locked
  loop
    v_rental := app_private.rental_move(v_rental, 'completed', null, 'No claim in the claim window; the deposit hold is released');
    perform app_private.release_deposit(v_rental, 'No claim in the claim window');
    perform app_private.queue_rental_push('rental_completed', v_rental, v_rental.renter_id, null, 'Deposit hold released');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Every 10 minutes (dzirent-rental-expiry): unanswered requests expire; rentals not picked up
-- rental_autocancel_days after the start date are cancelled; claim windows close.
create or replace function app_private.expire_rental_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_hours integer := app_private.setting_int('rental_request_hours');
  v_days integer := app_private.setting_int('rental_autocancel_days');
  v_today date := app_private.rental_today();
  v_count integer := 0;
begin
  for v_rental in
    select * from public.rentals r
    where r.status = 'requested' and r.expires_at <= pg_catalog.now()
    order by r.expires_at for update skip locked
  loop
    v_rental := app_private.rental_move(v_rental, 'expired', null, 'No answer in ' || v_hours || ' hours');
    perform app_private.queue_rental_push('rental_expired', v_rental, v_rental.renter_id, null);
    perform app_private.queue_rental_push('rental_expired', v_rental, v_rental.lender_id, null);
    v_count := v_count + 1;
  end loop;

  for v_rental in
    select * from public.rentals r
    where r.status in ('accepted', 'awaiting_payment', 'paid') and r.start_date + v_days < v_today
    order by r.start_date for update skip locked
  loop
    v_rental := app_private.rental_move(v_rental, 'cancelled', null,
      'Not picked up within ' || v_days || case when v_days = 1 then ' day' else ' days' end || ' after the start date');
    perform app_private.after_cancel_payments(v_rental, false, 'Automatic cancellation: not picked up');
    perform app_private.queue_rental_push('rental_cancelled', v_rental, v_rental.renter_id, null, 'Not picked up in time');
    perform app_private.queue_rental_push('rental_cancelled', v_rental, v_rental.lender_id, null, 'Not picked up in time');
    v_count := v_count + 1;
  end loop;

  return v_count + app_private.close_claim_windows();
end;
$$;

-- Nightly (dzirent-deposit-holds): a hold that ends within deposit_hold_warning_hours (plus the day
-- until the next run) while the piece is still picked up: both people are told once, and a new
-- hold replaces the old one (stripe-deposit "renew").
create function app_private.check_deposit_holds()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_hours integer := app_private.setting_int('deposit_hold_warning_hours');
  v_warned integer := 0;
  v_renewing integer := 0;
begin
  for v_rental in
    select * from public.rentals r
    where r.status = 'picked_up' and r.deposit_status = 'held' and r.deposit_capture_before is not null
      and r.deposit_capture_before < pg_catalog.now() + pg_catalog.make_interval(hours => v_hours + 24)
      and not exists (select 1 from app_private.payment_operations o
                      where o.rental_id = r.id and o.kind = 'deposit_renew' and o.status in ('queued', 'running'))
    for update skip locked
  loop
    if v_rental.deposit_warned_at is null then
      perform app_private.queue_rental_push('deposit_hold_ending', v_rental, v_rental.renter_id, null);
      perform app_private.queue_rental_push('deposit_hold_ending', v_rental, v_rental.lender_id, null);
      update public.rentals set deposit_warned_at = pg_catalog.now() where id = v_rental.id;
      v_warned := v_warned + 1;
    end if;
    perform app_private.enqueue_payment_operation(v_rental.id, 'deposit_renew', v_rental.deposit_amount, null,
      'The deposit hold ends soon');
    v_renewing := v_renewing + 1;
  end loop;
  return pg_catalog.jsonb_build_object('warned', v_warned, 'renewing', v_renewing);
end;
$$;

select cron.schedule('dzirent-deposit-holds', '45 9 * * *', 'select app_private.check_deposit_holds()');

-- 11. What the two people see: the payment state and the claim ----------------------------------
create or replace function app_private.rental_json(p_rental public.rentals, p_uid uuid, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_rental.id,
    'conversation_id', p_rental.conversation_id,
    'listing_id', p_rental.listing_id,
    'listing_title', l.title,
    'cover_photo_path', (select lp.storage_path from public.listing_photos lp
                         where lp.listing_id = p_rental.listing_id order by lp.position, lp.id limit 1),
    'your_role', case when p_rental.renter_id = p_uid then 'renter' else 'lender' end,
    'other_name', coalesce(nullif(pg_catalog.btrim(o.studio_name), ''), o.display_name),
    'other_handle', o.studio_handle,
    'status', p_rental.status,
    'start_date', p_rental.start_date,
    'end_date', p_rental.end_date,
    'price_per_day', p_rental.price_per_day,
    'days', p_rental.days,
    'total', p_rental.total,
    'currency', p_rental.currency,
    'expires_at', p_rental.expires_at,
    'created_at', p_rental.created_at,
    'updated_at', p_rental.updated_at,
    'payments_enabled', app_private.payments_enabled(),
    -- C4 (shown by the C5 screens; clients ignore them until then)
    'deposit_amount', p_rental.deposit_amount,
    'payment_status', p_rental.payment_status,
    'deposit_status', p_rental.deposit_status,
    'refund_amount', p_rental.refund_amount,
    'claim_window_ends_at', p_rental.claim_window_ends_at)
  || case when not p_full then '{}'::jsonb else pg_catalog.jsonb_build_object(
    'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'from', e.from_status, 'to', e.to_status,
        'by', case when e.actor_role = 'system' then 'dzirent' when e.actor_id = p_uid then 'you' else 'other' end,
        'by_role', e.actor_role, 'note', e.note, 'at', e.created_at) order by e.id)
      from public.rental_events e where e.rental_id = p_rental.id), '[]'::jsonb),
    'photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'storage_path', ob.name, 'stage', (pg_catalog.string_to_array(ob.name, '/'))[2],
        'by', case when ob.owner_id = p_uid::text then 'you' else 'other' end,
        'by_role', case when ob.owner_id = p_rental.lender_id::text then 'lender' else 'renter' end,
        'uploaded_at', ob.created_at) order by ob.created_at, ob.name)
      from storage.objects ob
      where ob.bucket_id = 'rental-photos' and ob.name like p_rental.id::text || '/%'), '[]'::jsonb),
    'claim', (select pg_catalog.jsonb_build_object(
        'id', c.id, 'status', c.status, 'amount', c.amount, 'reason', c.reason,
        'evidence_paths', pg_catalog.to_jsonb(c.evidence_paths), 'renter_note', c.renter_note,
        'decision_amount', c.decision_amount, 'decision', c.decision,
        'created_at', c.created_at, 'responded_at', c.responded_at, 'decided_at', c.decided_at)
      from public.rental_claims c where c.rental_id = p_rental.id)) end
  from public.listings l
  left join public.profiles o on o.id = case when p_rental.renter_id = p_uid then p_rental.lender_id else p_rental.renter_id end
  where l.id = p_rental.listing_id;
$$;

-- 12. Admin: end a rental, refund, decide a claim, the Payments queue -----------------------------
create function public.admin_end_rental(p_rental_id uuid, p_outcome text, p_reason text,
  p_refund_amount numeric default null, p_deposit_action text default null, p_capture_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_rental public.rentals;
  v_before jsonb;
  v_hold boolean;
  v_left numeric;
  v_refund_op uuid;
  v_deposit_op uuid;
  v_cancel_op uuid;
  v_after jsonb;
begin
  if p_outcome is null or p_outcome not in ('cancelled', 'completed') then
    raise exception 'DZ-E5080: Choose cancelled or completed.' using errcode = '22023';
  end if;
  select * into v_rental from public.rentals r where r.id = p_rental_id for update;
  if not found then
    raise exception 'DZ-E4001: Rental not found' using errcode = 'P0002';
  end if;
  if v_rental.status not in ('requested', 'accepted', 'awaiting_payment', 'paid', 'picked_up', 'returned', 'claimed', 'disputed') then
    raise exception 'DZ-E5081: This rental has already ended.' using errcode = 'P0001';
  end if;
  if p_outcome = 'completed' and v_rental.status not in ('picked_up', 'returned', 'claimed', 'disputed') then
    raise exception 'DZ-E5082: Only a rental that was picked up can be ended as completed.' using errcode = 'P0001';
  end if;
  v_hold := v_rental.deposit_intent_id is not null and v_rental.deposit_status in ('held', 'pending');
  if v_hold and (p_deposit_action is null or p_deposit_action not in ('release', 'capture')) then
    raise exception 'DZ-E5083: Choose what happens to the deposit hold: release or capture.' using errcode = '22023';
  end if;
  if not v_hold and p_deposit_action is not null then
    raise exception 'DZ-E4039: This rental has no deposit hold to change.' using errcode = 'P0001';
  end if;
  if p_deposit_action = 'capture' and (p_capture_amount is null or p_capture_amount <= 0 or p_capture_amount > v_rental.deposit_amount) then
    raise exception using errcode = '22023', hint = 'amount', message =
      'DZ-E5086: Capture an amount above $0 and up to the deposit (' || app_private.money_label(v_rental.deposit_amount) || ').';
  end if;
  if p_refund_amount is not null and p_refund_amount <> 0 then
    if v_rental.payment_status not in ('paid', 'partially_refunded') then
      raise exception 'DZ-E5085: This rental has no payment to refund.' using errcode = 'P0001';
    end if;
    v_left := app_private.refundable_amount(v_rental);
    if p_refund_amount < 0 or p_refund_amount > v_left then
      raise exception using errcode = '22023', hint = 'amount', message =
        'DZ-E5084: Refund an amount above $0 and up to what is still paid (' || app_private.money_label(v_left) || ').';
    end if;
  end if;

  v_before := pg_catalog.jsonb_build_object('status', v_rental.status, 'payment_status', v_rental.payment_status,
    'deposit_status', v_rental.deposit_status, 'refund_amount', v_rental.refund_amount);
  update public.rental_claims
    set status = 'decided', decided_by = v_admin, decision = pg_catalog.left('Ended by Dzirent: ' || v_reason, 500),
        decision_amount = case when p_deposit_action = 'capture' then p_capture_amount else 0 end,
        decided_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where rental_id = v_rental.id and status in ('open', 'disputed');
  v_rental := app_private.rental_move(v_rental, p_outcome, null, pg_catalog.left('Ended by Dzirent: ' || v_reason, 300));

  if coalesce(p_refund_amount, 0) > 0 then
    v_refund_op := app_private.enqueue_payment_operation(v_rental.id, 'refund', p_refund_amount, v_admin, v_reason);
  end if;
  if p_outcome = 'cancelled' and v_rental.payment_intent_id is not null and v_rental.payment_status in ('pending', 'failed') then
    v_cancel_op := app_private.enqueue_payment_operation(v_rental.id, 'payment_cancel', null, v_admin, v_reason);
  end if;
  if p_deposit_action = 'release' then
    v_deposit_op := app_private.enqueue_payment_operation(v_rental.id, 'deposit_release', v_rental.deposit_amount, v_admin, v_reason);
  elsif p_deposit_action = 'capture' then
    v_deposit_op := app_private.enqueue_payment_operation(v_rental.id, 'deposit_capture', p_capture_amount, v_admin, v_reason,
      (select c.id from public.rental_claims c where c.rental_id = v_rental.id));
  end if;
  perform app_private.queue_rental_push(case when p_outcome = 'cancelled' then 'rental_cancelled' else 'rental_completed' end,
    v_rental, v_rental.renter_id, null, 'Ended by Dzirent');
  perform app_private.queue_rental_push(case when p_outcome = 'cancelled' then 'rental_cancelled' else 'rental_completed' end,
    v_rental, v_rental.lender_id, null, 'Ended by Dzirent');

  v_after := pg_catalog.jsonb_build_object('status', p_outcome, 'refund_amount', coalesce(p_refund_amount, 0),
    'deposit_action', p_deposit_action, 'capture_amount', p_capture_amount,
    'refund_operation', v_refund_op, 'deposit_operation', v_deposit_op, 'payment_cancel_operation', v_cancel_op);
  perform app_private.log_admin_action(v_admin, 'end_rental', 'rental', v_rental.id::text, v_reason, v_before, v_after);
  return v_after;
end;
$$;

create function public.admin_refund_rental(p_rental_id uuid, p_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_rental public.rentals;
  v_left numeric;
  v_op uuid;
begin
  select * into v_rental from public.rentals r where r.id = p_rental_id for update;
  if not found then
    raise exception 'DZ-E4001: Rental not found' using errcode = 'P0002';
  end if;
  if v_rental.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'DZ-E5085: This rental has no payment to refund.' using errcode = 'P0001';
  end if;
  v_left := app_private.refundable_amount(v_rental);
  if p_amount is null or p_amount <= 0 or p_amount > v_left or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', hint = 'amount', message =
      'DZ-E5084: Refund an amount above $0 and up to what is still paid (' || app_private.money_label(v_left) || ').';
  end if;
  v_op := app_private.enqueue_payment_operation(v_rental.id, 'refund', p_amount, v_admin, v_reason);
  perform app_private.log_admin_action(v_admin, 'refund_rental', 'rental', v_rental.id::text, v_reason,
    pg_catalog.jsonb_build_object('refund_amount', v_rental.refund_amount, 'payment_status', v_rental.payment_status),
    pg_catalog.jsonb_build_object('refund', p_amount, 'operation_id', v_op));
  return pg_catalog.jsonb_build_object('operation_id', v_op, 'amount', p_amount);
end;
$$;

-- p_amount: what to capture from the deposit (0 releases the hold), at most the claimed amount.
create function public.admin_decide_claim(p_claim_id uuid, p_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_claim public.rental_claims;
  v_rental public.rentals;
  v_max numeric;
  v_op uuid;
  v_detail text;
begin
  select * into v_claim from public.rental_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'DZ-E4044: Claim not found' using errcode = 'P0002';
  end if;
  select * into v_rental from public.rentals r where r.id = v_claim.rental_id for update;
  if v_claim.status not in ('open', 'disputed') or v_rental.status not in ('claimed', 'disputed') then
    raise exception 'DZ-E4045: This claim can''t be changed now.' using errcode = 'P0001';
  end if;
  v_max := least(v_claim.amount, coalesce(v_rental.deposit_amount, 0));
  if p_amount is null or p_amount < 0 or p_amount > v_max or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception using errcode = '22023', hint = 'amount', message =
      'DZ-E5086: Capture from $0 up to the claim (' || app_private.money_label(v_max) || ').';
  end if;
  update public.rental_claims
    set status = 'decided', decided_by = v_admin, decision = v_reason, decision_amount = p_amount,
        decided_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_claim.id;
  v_detail := case when p_amount > 0 then app_private.money_label(p_amount) || ' from the deposit'
                   else 'No charge; the deposit hold is released' end;
  v_rental := app_private.rental_move(v_rental, 'completed', null, pg_catalog.left('Claim decided by Dzirent: ' || v_detail, 300));
  if p_amount > 0 then
    v_op := app_private.enqueue_payment_operation(v_rental.id, 'deposit_capture', p_amount, v_admin, v_reason, v_claim.id);
  else
    v_op := app_private.release_deposit(v_rental, v_reason);
  end if;
  perform app_private.queue_rental_push('claim_decided', v_rental, v_rental.renter_id, null, v_detail);
  perform app_private.queue_rental_push('claim_decided', v_rental, v_rental.lender_id, null, v_detail);
  perform app_private.log_admin_action(v_admin, 'decide_claim', 'claim', v_claim.id::text, v_reason,
    pg_catalog.jsonb_build_object('status', v_claim.status, 'amount', v_claim.amount),
    pg_catalog.jsonb_build_object('status', 'decided', 'capture', p_amount, 'operation_id', v_op));
  return pg_catalog.jsonb_build_object('claim_id', v_claim.id, 'capture', p_amount, 'operation_id', v_op);
end;
$$;

create function app_private.admin_person(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('id', p.id, 'name', coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name),
    'handle', p.studio_handle)
  from public.profiles p where p.id = p_user;
$$;

-- The admin Payments page: open and disputed claims, card disputes, failed payments and deposit
-- holds, failed money steps, payout accounts with problems, and rentals that can be refunded.
create function public.admin_payments_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'payments_enabled', app_private.payments_enabled(),
    'claims', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id, 'rental_id', c.rental_id, 'status', c.status, 'amount', c.amount, 'reason', c.reason,
        'evidence_paths', pg_catalog.to_jsonb(c.evidence_paths), 'renter_note', c.renter_note,
        'deposit_amount', r.deposit_amount, 'deposit_status', r.deposit_status,
        'listing_title', l.title, 'lender', app_private.admin_person(c.lender_id), 'renter', app_private.admin_person(c.renter_id),
        'created_at', c.created_at, 'responded_at', c.responded_at) order by c.created_at)
      from public.rental_claims c join public.rentals r on r.id = c.rental_id left join public.listings l on l.id = r.listing_id
      where c.status in ('open', 'disputed')), '[]'::jsonb),
    'card_disputes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', d.stripe_dispute_id, 'rental_id', d.rental_id, 'amount', d.amount, 'reason', d.reason, 'status', d.status,
        'opened_at', d.opened_at, 'closed_at', d.closed_at) order by d.opened_at desc)
      from app_private.card_disputes d
      where d.closed_at is null or d.closed_at > pg_catalog.now() - interval '30 days'), '[]'::jsonb),
    'failed_payments', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rental_id', r.id, 'status', r.status, 'payment_status', r.payment_status, 'deposit_status', r.deposit_status,
        'total', r.total, 'deposit_amount', r.deposit_amount, 'listing_title', l.title,
        'lender', app_private.admin_person(r.lender_id), 'renter', app_private.admin_person(r.renter_id),
        'updated_at', r.updated_at) order by r.updated_at desc)
      from public.rentals r left join public.listings l on l.id = r.listing_id
      where r.payment_status = 'failed' or r.deposit_status = 'failed'), '[]'::jsonb),
    'failed_operations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', o.id, 'rental_id', o.rental_id, 'kind', o.kind, 'amount', o.amount, 'error', o.error,
        'attempts', o.attempts, 'created_at', o.created_at, 'finished_at', o.finished_at) order by o.created_at desc)
      from (select * from app_private.payment_operations o2 where o2.status = 'failed' order by o2.created_at desc limit 50) o), '[]'::jsonb),
    'payout_problems', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'lender', app_private.admin_person(a.user_id), 'charges_enabled', a.charges_enabled,
        'payouts_enabled', a.payouts_enabled, 'details_submitted', a.details_submitted, 'updated_at', a.updated_at)
        order by a.updated_at desc)
      from public.payout_accounts a where a.details_submitted and not (a.payouts_enabled and a.charges_enabled)), '[]'::jsonb),
    'refundable', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rental_id', x.id, 'status', x.status, 'payment_status', x.payment_status, 'total', x.total,
        'refund_amount', x.refund_amount, 'refundable', app_private.refundable_amount(x), 'listing_title', l.title,
        'renter', app_private.admin_person(x.renter_id), 'lender', app_private.admin_person(x.lender_id),
        'start_date', x.start_date, 'end_date', x.end_date) order by x.updated_at desc)
      from (select * from public.rentals r2 where r2.payment_status in ('paid', 'partially_refunded')
            order by r2.updated_at desc limit 50) x left join public.listings l on l.id = x.listing_id), '[]'::jsonb)
  ) into v_result;
  perform app_private.log_admin_action(v_admin, 'view_payments', null, null, null, null, null);
  return v_result;
end;
$$;

-- 13. What the payment Edge Functions call (server key only) --------------------------------------
-- Payments are on (the flag). The functions also need the Stripe keys; the database can't see them.
create function public.payments_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select app_private.payments_enabled() $$;

create function app_private.require_payments()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.payments_enabled() then
    raise exception 'DZ-E4030: Payments aren''t available yet.' using errcode = 'P0001';
  end if;
end;
$$;

-- stripe-onboard: the caller may set up payouts (a lender, allowed to act); their account, if any.
create function public.payment_onboard_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_payments();
  perform app_private.rental_guard(p_user, null, false);
  if not exists (select 1 from public.profiles p where p.id = p_user and p.role in ('lender', 'both')) then
    raise exception 'DZ-E4037: Only lenders can set up payouts.' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object('account_id',
    (select a.stripe_account_id from public.payout_accounts a where a.user_id = p_user));
end;
$$;

-- Saves the new Express account; a second account for the same person is never kept (the first wins).
create function public.payment_save_account(p_user uuid, p_account text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payout_accounts (user_id, stripe_account_id) values (p_user, p_account)
  on conflict (user_id) do nothing;
  return (select a.stripe_account_id from public.payout_accounts a where a.user_id = p_user);
end;
$$;

-- Stripe's view of a lender's account (stripe-account-status and the account.updated webhook).
create function public.payment_update_account(p_account text, p_charges boolean, p_payouts boolean, p_details boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.payout_accounts;
begin
  update public.payout_accounts
    set charges_enabled = coalesce(p_charges, false), payouts_enabled = coalesce(p_payouts, false),
        details_submitted = coalesce(p_details, false), updated_at = pg_catalog.now()
    where stripe_account_id = p_account
    returning * into v_row;
  if not found then
    return null;
  end if;
  return pg_catalog.jsonb_build_object('charges_enabled', v_row.charges_enabled, 'payouts_enabled', v_row.payouts_enabled,
    'details_submitted', v_row.details_submitted, 'updated_at', v_row.updated_at);
end;
$$;

create function public.payment_account_for(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.require_payments();
  perform app_private.rental_guard(p_user, null, false);
  return (select a.stripe_account_id from public.payout_accounts a where a.user_id = p_user);
end;
$$;

create function public.payment_save_customer(p_user uuid, p_customer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stripe_customers (user_id, stripe_customer_id) values (p_user, p_customer)
  on conflict (user_id) do nothing;
  return (select c.stripe_customer_id from public.stripe_customers c where c.user_id = p_user);
end;
$$;

-- stripe-pay: the renter of a rental waiting for payment, with the lender able to take charges.
-- Amounts in USD: the C3 price snapshot plus the sales tax hook; the fee from the setting.
create function public.payment_pay_prepare(p_user uuid, p_rental uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_account public.payout_accounts;
  v_tax numeric;
  v_fee numeric;
begin
  perform app_private.require_payments();
  v_rental := app_private.rental_for_actor(p_rental, p_user);
  if p_user <> v_rental.renter_id then
    raise exception 'DZ-E4032: Only the renter can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(p_user, v_rental.lender_id, true);
  if v_rental.status <> 'awaiting_payment' or v_rental.payment_status in ('paid', 'partially_refunded', 'refunded') then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  select * into v_account from public.payout_accounts a where a.user_id = v_rental.lender_id;
  if not found or not v_account.charges_enabled then
    raise exception 'DZ-E4031: The lender hasn''t finished setting up payouts yet.' using errcode = 'P0001';
  end if;
  v_tax := app_private.sales_tax_amount(v_rental);
  v_fee := pg_catalog.round(v_rental.total * app_private.setting_num('platform_fee_percent') / 100, 2);
  return pg_catalog.jsonb_build_object(
    'rental_id', v_rental.id, 'currency', 'usd',
    'amount', v_rental.total + v_tax, 'fee', v_fee, 'tax', v_tax,
    'lender_account', v_account.stripe_account_id,
    'customer_id', (select c.stripe_customer_id from public.stripe_customers c where c.user_id = p_user),
    'payment_intent_id', v_rental.payment_intent_id);
end;
$$;

-- Keeps the first PaymentIntent of a rental (a second create for the same rental is never stored).
create function public.payment_save_intent(p_rental uuid, p_intent text, p_fee numeric, p_tax numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent text;
begin
  update public.rentals
    set payment_intent_id = p_intent, fee_amount = p_fee, tax_amount = p_tax, payment_status = 'pending'
    where id = p_rental and payment_intent_id is null;
  select r.payment_intent_id into v_intent from public.rentals r where r.id = p_rental;
  return v_intent;
end;
$$;

-- stripe-deposit "place": the lender of a paid rental with a deposit, 2 pickup photos, the card
-- the rental was paid with. Reuses an unfinished placement (same idempotency key).
create function public.payment_deposit_prepare(p_user uuid, p_rental uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_account text;
  v_method text;
  v_op uuid;
begin
  perform app_private.require_payments();
  v_rental := app_private.rental_for_actor(p_rental, p_user);
  if p_user <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(p_user, v_rental.renter_id, true);
  if v_rental.status <> 'paid' then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  if coalesce(v_rental.deposit_amount, 0) <= 0 or v_rental.deposit_status = 'held' then
    return pg_catalog.jsonb_build_object('needs_hold', false, 'deposit_status', v_rental.deposit_status);
  end if;
  if app_private.rental_photo_count(v_rental.id, 'pickup', p_user) < 2 then
    raise exception 'DZ-E4020: Add at least 2 photos of the piece first.' using errcode = 'P0001', hint = 'photos';
  end if;
  select m.payment_method_id into v_method from app_private.rental_payment_methods m where m.rental_id = v_rental.id;
  if v_method is null then
    raise exception 'DZ-E4034: There''s no saved card for this rental.' using errcode = 'P0001';
  end if;
  select a.stripe_account_id into v_account from public.payout_accounts a
  where a.user_id = v_rental.lender_id and a.charges_enabled;
  if v_account is null then
    raise exception 'DZ-E4031: The lender hasn''t finished setting up payouts yet.' using errcode = 'P0001';
  end if;
  select o.id into v_op from app_private.payment_operations o
  where o.rental_id = v_rental.id and o.kind = 'deposit_place' and o.status in ('queued', 'running')
  order by o.created_at desc limit 1;
  if v_op is null then
    insert into app_private.payment_operations (rental_id, kind, amount, status, attempts, reason)
    values (v_rental.id, 'deposit_place', v_rental.deposit_amount, 'running', 1, 'Pickup')
    returning id into v_op;
  else
    update app_private.payment_operations set attempts = attempts + 1, updated_at = pg_catalog.now() where id = v_op;
  end if;
  return pg_catalog.jsonb_build_object('needs_hold', true, 'operation_id', v_op, 'idempotency_key', 'dz-op-' || v_op,
    'rental_id', v_rental.id, 'amount', v_rental.deposit_amount, 'currency', 'usd', 'lender_account', v_account,
    'customer_id', (select c.stripe_customer_id from public.stripe_customers c where c.user_id = v_rental.renter_id),
    'payment_method_id', v_method,
    'pending_intent', case when v_rental.deposit_status = 'pending' then v_rental.deposit_intent_id end);
end;
$$;

-- The result of placing a hold: requires_capture = held (until capture_before; card networks
-- allow about 7 days when Stripe doesn't say), anything else = pending (the webhook says when it is
-- capturable), an error = failed.
create function public.payment_deposit_result(p_operation uuid, p_intent text, p_status text,
                                              p_capture_before timestamp with time zone, p_error text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op app_private.payment_operations;
  v_status text;
begin
  select * into v_op from app_private.payment_operations o where o.id = p_operation and o.kind = 'deposit_place' for update;
  if not found then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = 'P0002';
  end if;
  if p_error is not null then
    update app_private.payment_operations
      set status = 'failed', error = pg_catalog.left(p_error, 300), finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_op.id;
    update public.rentals set deposit_status = 'failed' where id = v_op.rental_id and deposit_status in ('none', 'pending', 'failed');
    return pg_catalog.jsonb_build_object('deposit_status', 'failed');
  end if;
  v_status := case p_status when 'requires_capture' then 'held' when 'canceled' then 'failed' else 'pending' end;
  update app_private.payment_operations
    set status = 'done', stripe_id = p_intent, details = pg_catalog.jsonb_build_object('stripe_status', p_status),
        finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_op.id;
  update public.rentals
    set deposit_intent_id = p_intent, deposit_status = v_status, deposit_warned_at = null,
        deposit_capture_before = case when v_status = 'held'
          then coalesce(p_capture_before, pg_catalog.now() + interval '7 days') end
    where id = v_op.rental_id;
  return pg_catalog.jsonb_build_object('deposit_status', v_status);
end;
$$;

-- An outbox payment step starts (or is retried): what the Edge Function needs for it.
create function public.payment_operation_start(p_operation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op app_private.payment_operations;
  v_rental public.rentals;
begin
  select * into v_op from app_private.payment_operations o where o.id = p_operation for update;
  if not found then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = 'P0002';
  end if;
  if v_op.status in ('done', 'failed') then
    return pg_catalog.jsonb_build_object('state', v_op.status, 'stripe_id', v_op.stripe_id);
  end if;
  update app_private.payment_operations
    set status = 'running', attempts = attempts + 1, updated_at = pg_catalog.now()
    where id = v_op.id;
  select * into v_rental from public.rentals r where r.id = v_op.rental_id;
  return pg_catalog.jsonb_build_object(
    'state', 'running', 'operation_id', v_op.id, 'kind', v_op.kind, 'amount', v_op.amount,
    'idempotency_key', 'dz-op-' || v_op.id, 'currency', 'usd', 'rental_id', v_rental.id,
    'payment_intent_id', v_rental.payment_intent_id, 'deposit_intent_id', v_rental.deposit_intent_id,
    'deposit_status', v_rental.deposit_status, 'deposit_amount', v_rental.deposit_amount,
    'lender_account', (select a.stripe_account_id from public.payout_accounts a where a.user_id = v_rental.lender_id),
    'customer_id', (select c.stripe_customer_id from public.stripe_customers c where c.user_id = v_rental.renter_id),
    'payment_method_id', (select m.payment_method_id from app_private.rental_payment_methods m where m.rental_id = v_rental.id));
end;
$$;

-- An outbox payment step finished: its effect on the rental.
create function public.payment_operation_finish(p_operation uuid, p_ok boolean, p_stripe_id text,
                                                p_error text, p_details jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op app_private.payment_operations;
  v_rental public.rentals;
  v_paid numeric;
begin
  select * into v_op from app_private.payment_operations o where o.id = p_operation for update;
  if not found then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = 'P0002';
  end if;
  if v_op.status in ('done', 'failed') then
    return pg_catalog.jsonb_build_object('state', v_op.status);
  end if;
  if not coalesce(p_ok, false) then
    update app_private.payment_operations
      set status = 'failed', error = pg_catalog.left(coalesce(p_error, 'failed'), 300), details = p_details,
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = v_op.id;
    return pg_catalog.jsonb_build_object('state', 'failed');
  end if;
  update app_private.payment_operations
    set status = 'done', stripe_id = p_stripe_id, details = p_details, error = null,
        finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_op.id;
  select * into v_rental from public.rentals r where r.id = v_op.rental_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'done');
  end if;
  v_paid := coalesce(v_rental.total, 0) + coalesce(v_rental.tax_amount, 0);
  case v_op.kind
    when 'refund' then
      update public.rentals
        set refund_amount = least(v_paid, refund_amount + v_op.amount),
            payment_status = case when refund_amount + v_op.amount >= v_paid then 'refunded' else 'partially_refunded' end
        where id = v_rental.id;
    when 'payment_cancel' then
      update public.rentals set payment_status = 'canceled'
        where id = v_rental.id and payment_status in ('pending', 'failed');
    when 'deposit_release' then
      update public.rentals set deposit_status = 'released'
        where id = v_rental.id and deposit_status in ('held', 'pending', 'failed');
    when 'deposit_capture' then
      update public.rentals set deposit_status = 'captured', deposit_captured_amount = v_op.amount
        where id = v_rental.id;
    when 'deposit_renew' then
      update public.rentals
        set deposit_intent_id = coalesce(p_details ->> 'intent', deposit_intent_id),
            deposit_status = case p_details ->> 'stripe_status' when 'requires_capture' then 'held' else 'pending' end,
            deposit_capture_before = case when p_details ->> 'stripe_status' = 'requires_capture'
              then coalesce((p_details ->> 'capture_before')::timestamptz, pg_catalog.now() + interval '7 days') end,
            deposit_warned_at = null
        where id = v_rental.id;
    else
      null;
  end case;
  return pg_catalog.jsonb_build_object('state', 'done');
end;
$$;

-- stripe-webhook: one verified event, once. Rows are found by the Stripe ids Dzirent stored, never
-- by the event's metadata. The whole event is one transaction: a failure leaves no trace, so Stripe
-- sends it again.
create function public.payment_handle_event(p_event_id text, p_type text, p_payload_hash text, p_object jsonb,
                                            p_capture_before timestamp with time zone default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new integer;
  v_id text := p_object ->> 'id';
  v_rental public.rentals;
  v_result text := 'ignored';
  v_refund numeric;
  v_pi text;
begin
  insert into app_private.payment_events (stripe_event_id, type, payload_hash)
  values (p_event_id, p_type, p_payload_hash)
  on conflict (stripe_event_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then
    return pg_catalog.jsonb_build_object('result', 'duplicate');
  end if;

  case p_type
    when 'payment_intent.succeeded' then
      select * into v_rental from public.rentals r where r.payment_intent_id = v_id for update;
      if found then
        if v_rental.payment_status not in ('paid', 'partially_refunded', 'refunded') then
          update public.rentals set payment_status = 'paid' where id = v_rental.id returning * into v_rental;
          if p_object ->> 'payment_method' ~ '^(pm|card)_[A-Za-z0-9_]+$' then
            insert into app_private.rental_payment_methods (rental_id, payment_method_id)
            values (v_rental.id, p_object ->> 'payment_method')
            on conflict (rental_id) do update set payment_method_id = excluded.payment_method_id;
          end if;
          if v_rental.status = 'awaiting_payment' then
            perform app_private.rental_move(v_rental, 'paid', null, 'Payment received');
            v_result := 'rental_paid';
          elsif v_rental.status in ('cancelled', 'expired', 'declined') then
            -- Paid after the rental ended: everything goes back.
            v_refund := app_private.refundable_amount(v_rental);
            if v_refund > 0 then
              perform app_private.enqueue_payment_operation(v_rental.id, 'refund', v_refund, null, 'Paid after the rental ended');
            end if;
            v_result := 'refund_late_payment';
          else
            v_result := 'payment_recorded';
          end if;
        else
          v_result := 'already_paid';
        end if;
      else
        update public.rentals
          set deposit_status = 'captured',
              deposit_captured_amount = coalesce((p_object ->> 'amount_received')::numeric / 100, deposit_captured_amount)
          where deposit_intent_id = v_id;
        get diagnostics v_new = row_count;
        if v_new > 0 then
          v_result := 'deposit_captured';
        end if;
      end if;
    when 'payment_intent.payment_failed' then
      update public.rentals set payment_status = 'failed' where payment_intent_id = v_id and payment_status = 'pending';
      get diagnostics v_new = row_count;
      if v_new > 0 then
        v_result := 'payment_failed';
      else
        update public.rentals set deposit_status = 'failed' where deposit_intent_id = v_id and deposit_status = 'pending';
        get diagnostics v_new = row_count;
        if v_new > 0 then
          v_result := 'deposit_failed';
        end if;
      end if;
    when 'payment_intent.canceled' then
      update public.rentals set deposit_status = 'released'
        where deposit_intent_id = v_id and deposit_status in ('held', 'pending', 'failed');
      get diagnostics v_new = row_count;
      if v_new > 0 then
        v_result := 'deposit_released';
      else
        update public.rentals set payment_status = 'canceled' where payment_intent_id = v_id and payment_status in ('pending', 'failed');
        get diagnostics v_new = row_count;
        if v_new > 0 then
          v_result := 'payment_canceled';
        end if;
      end if;
    when 'payment_intent.amount_capturable_updated' then
      update public.rentals
        set deposit_status = 'held', deposit_warned_at = null,
            deposit_capture_before = coalesce(p_capture_before, pg_catalog.now() + interval '7 days')
        where deposit_intent_id = v_id and deposit_status in ('pending', 'held', 'failed')
          and coalesce((p_object ->> 'amount_capturable')::numeric, 0) > 0;
      get diagnostics v_new = row_count;
      if v_new > 0 then
        v_result := 'deposit_held';
      end if;
    when 'charge.refunded' then
      v_pi := p_object ->> 'payment_intent';
      update public.rentals r
        set refund_amount = greatest(r.refund_amount, coalesce((p_object ->> 'amount_refunded')::numeric / 100, 0)),
            payment_status = case when coalesce((p_object ->> 'amount_refunded')::numeric, 0) >= coalesce((p_object ->> 'amount_captured')::numeric, (p_object ->> 'amount')::numeric)
                                  then 'refunded' else 'partially_refunded' end
        where r.payment_intent_id = v_pi;
      get diagnostics v_new = row_count;
      if v_new > 0 then
        v_result := 'refund_recorded';
      end if;
    when 'charge.dispute.created', 'charge.dispute.closed' then
      v_pi := p_object ->> 'payment_intent';
      insert into app_private.card_disputes (stripe_dispute_id, rental_id, payment_intent_id, amount, reason, status, opened_at, closed_at)
      values (v_id,
              (select r.id from public.rentals r where r.payment_intent_id = v_pi or r.deposit_intent_id = v_pi limit 1),
              v_pi, (p_object ->> 'amount')::numeric / 100, p_object ->> 'reason', p_object ->> 'status',
              pg_catalog.to_timestamp(coalesce((p_object ->> 'created')::double precision, pg_catalog.date_part('epoch', pg_catalog.now()))),
              case when p_type = 'charge.dispute.closed' then pg_catalog.now() end)
      on conflict (stripe_dispute_id) do update
        set status = excluded.status, reason = excluded.reason, amount = excluded.amount,
            closed_at = coalesce(excluded.closed_at, app_private.card_disputes.closed_at), updated_at = pg_catalog.now();
      v_result := case when p_type = 'charge.dispute.created' then 'dispute_opened' else 'dispute_closed' end;
    when 'account.updated' then
      if public.payment_update_account(v_id, (p_object ->> 'charges_enabled')::boolean,
                                       (p_object ->> 'payouts_enabled')::boolean, (p_object ->> 'details_submitted')::boolean) is not null then
        v_result := 'account_updated';
      end if;
    else
      v_result := 'ignored';
  end case;

  update app_private.payment_events set processed_at = pg_catalog.now(), result = v_result where stripe_event_id = p_event_id;
  return pg_catalog.jsonb_build_object('result', v_result);
end;
$$;

-- The admin Integrations page (Edge Function admin-integrations): the admin check, and the read
-- logged with which services had their secrets set (true or false only; never values).
create function public.admin_record_integrations_check(p_status jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_status jsonb;
begin
  select pg_catalog.jsonb_object_agg(k, coalesce((p_status ->> k)::boolean, false)) into v_status
  from pg_catalog.unnest(array['payments', 'id_checks', 'notifications', 'email', 'photo_checks']) k;
  perform app_private.log_admin_action(v_admin, 'view_integrations', null, null, null, null, v_status);
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

-- 14. Who may call what -------------------------------------------------------------------------
revoke execute on function public.admin_record_integrations_check(jsonb) from public, anon;
grant execute on function public.admin_record_integrations_check(jsonb) to authenticated;
revoke execute on function app_private.money_label(numeric) from public, anon, authenticated;
revoke execute on function app_private.refundable_amount(public.rentals) from public, anon, authenticated;
revoke execute on function app_private.cancellation_refund(public.rentals, boolean) from public, anon, authenticated;
revoke execute on function app_private.sales_tax_amount(public.rentals) from public, anon, authenticated;
revoke execute on function app_private.enqueue_payment_operation(uuid, text, numeric, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function app_private.release_deposit(public.rentals, text) from public, anon, authenticated;
revoke execute on function app_private.after_cancel_payments(public.rentals, boolean, text) from public, anon, authenticated;
revoke execute on function app_private.queue_rental_push(text, public.rentals, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app_private.close_claim_windows() from public, anon, authenticated;
revoke execute on function app_private.expire_rental_requests() from public, anon, authenticated;
revoke execute on function app_private.check_deposit_holds() from public, anon, authenticated;
revoke execute on function app_private.rental_json(public.rentals, uuid, boolean) from public, anon, authenticated;
revoke execute on function app_private.admin_person(uuid) from public, anon, authenticated;
revoke execute on function app_private.require_payments() from public, anon, authenticated;
revoke execute on function app_private.dispatch_job(bigint) from public, anon, authenticated;
revoke execute on function app_private.job_failed(bigint, text) from public, anon, authenticated;

revoke execute on function public.request_rental(uuid, date, date) from public, anon;
revoke execute on function public.cancel_rental(uuid, text) from public, anon;
revoke execute on function public.mark_picked_up(uuid, text) from public, anon;
revoke execute on function public.mark_returned(uuid, text) from public, anon;
revoke execute on function public.complete_rental(uuid) from public, anon;
grant execute on function public.request_rental(uuid, date, date) to authenticated;
grant execute on function public.cancel_rental(uuid, text) to authenticated;
grant execute on function public.mark_picked_up(uuid, text) to authenticated;
grant execute on function public.mark_returned(uuid, text) to authenticated;
grant execute on function public.complete_rental(uuid) to authenticated, service_role;

revoke execute on function public.file_claim(uuid, numeric, text, text[]) from public, anon;
revoke execute on function public.respond_claim(uuid, text, text) from public, anon;
grant execute on function public.file_claim(uuid, numeric, text, text[]) to authenticated;
grant execute on function public.respond_claim(uuid, text, text) to authenticated;

revoke execute on function public.admin_end_rental(uuid, text, text, numeric, text, numeric) from public, anon;
revoke execute on function public.admin_refund_rental(uuid, numeric, text) from public, anon;
revoke execute on function public.admin_decide_claim(uuid, numeric, text) from public, anon;
revoke execute on function public.admin_payments_overview() from public, anon;
grant execute on function public.admin_end_rental(uuid, text, text, numeric, text, numeric) to authenticated;
grant execute on function public.admin_refund_rental(uuid, numeric, text) to authenticated;
grant execute on function public.admin_decide_claim(uuid, numeric, text) to authenticated;
grant execute on function public.admin_payments_overview() to authenticated;

-- Server key only (the payment Edge Functions).
revoke execute on function public.payments_available() from public, anon, authenticated;
revoke execute on function public.payment_onboard_prepare(uuid) from public, anon, authenticated;
revoke execute on function public.payment_save_account(uuid, text) from public, anon, authenticated;
revoke execute on function public.payment_update_account(text, boolean, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.payment_account_for(uuid) from public, anon, authenticated;
revoke execute on function public.payment_save_customer(uuid, text) from public, anon, authenticated;
revoke execute on function public.payment_pay_prepare(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.payment_save_intent(uuid, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.payment_deposit_prepare(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.payment_deposit_result(uuid, text, text, timestamp with time zone, text) from public, anon, authenticated;
revoke execute on function public.payment_operation_start(uuid) from public, anon, authenticated;
revoke execute on function public.payment_operation_finish(uuid, boolean, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.payment_handle_event(text, text, text, jsonb, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.payments_available() to service_role;
grant execute on function public.payment_onboard_prepare(uuid) to service_role;
grant execute on function public.payment_save_account(uuid, text) to service_role;
grant execute on function public.payment_update_account(text, boolean, boolean, boolean) to service_role;
grant execute on function public.payment_account_for(uuid) to service_role;
grant execute on function public.payment_save_customer(uuid, text) to service_role;
grant execute on function public.payment_pay_prepare(uuid, uuid) to service_role;
grant execute on function public.payment_save_intent(uuid, text, numeric, numeric) to service_role;
grant execute on function public.payment_deposit_prepare(uuid, uuid) to service_role;
grant execute on function public.payment_deposit_result(uuid, text, text, timestamp with time zone, text) to service_role;
grant execute on function public.payment_operation_start(uuid) to service_role;
grant execute on function public.payment_operation_finish(uuid, boolean, text, text, jsonb) to service_role;
grant execute on function public.payment_handle_event(text, text, text, jsonb, timestamp with time zone) to service_role;

-- 15. Download my data: the interval from the setting; claims, payment states and payout status.
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
  v_hours integer := app_private.setting_int('data_export_interval_hours');
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  -- Once per data_export_interval_hours (24 = once a day; a setting since C4). The lock keeps two exports started at the same moment from both passing.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('data_export:' || v_uid::text));
  select max(e.exported_at) into v_last from public.data_exports e where e.user_id = v_uid;
  if v_last is not null and v_last > pg_catalog.now() - pg_catalog.make_interval(hours => v_hours) then
    raise exception using errcode = 'P0001', message =
      'DZ-E7001: You can download your data once '
      || case when v_hours = 24 then 'a day' else 'every ' || v_hours || ' hours' end
      || '. Try again after '
      || pg_catalog.to_char((v_last + pg_catalog.make_interval(hours => v_hours)) at time zone 'UTC', 'Mon FMDD, YYYY, FMHH12:MI AM')
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

    -- Rentals with the price agreed and every step (C3).
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
        'price_per_day', rt.price_per_day,
        'days', rt.days,
        'total', rt.total,
        'currency', rt.currency,
        'deposit_amount', rt.deposit_amount,
        'payment_status', rt.payment_status,
        'fee', rt.fee_amount,
        'refunded', rt.refund_amount,
        'deposit_status', rt.deposit_status,
        'deposit_captured', rt.deposit_captured_amount,
        'last_changed_by', case when rt.updated_by is null then null
                                when rt.updated_by = v_uid then 'you' else 'other person' end,
        'created_at', rt.created_at,
        'updated_at', rt.updated_at,
        'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'from', e.from_status, 'to', e.to_status,
            'by', case when e.actor_role = 'system' then 'Dzirent' when e.actor_id = v_uid then 'you' else 'other person' end,
            'note', e.note, 'at', e.created_at) order by e.id)
          from public.rental_events e where e.rental_id = rt.id), '[]'::jsonb)) order by rt.created_at)
      from public.rentals rt join public.listings l on l.id = rt.listing_id
      where v_uid in (rt.renter_id, rt.lender_id)), '[]'::jsonb),

    -- Condition photos the caller took at pickup or return (the export adds a link to each).
    'condition_photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rental_id', (pg_catalog.string_to_array(o.name, '/'))[1],
        'stage', (pg_catalog.string_to_array(o.name, '/'))[2],
        'storage_path', o.name,
        'uploaded_at', o.created_at) order by o.created_at, o.name)
      from storage.objects o
      where o.bucket_id = 'rental-photos' and o.owner_id = v_uid::text), '[]'::jsonb),

    -- Claims on the caller's rentals (C4), as lender or renter.
    'claims', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rental_id', c.rental_id,
        'your_role', case when c.lender_id = v_uid then 'lender' else 'renter' end,
        'amount', c.amount, 'reason', c.reason, 'evidence_paths', pg_catalog.to_jsonb(c.evidence_paths),
        'status', c.status, 'renter_note', c.renter_note,
        'decision_amount', c.decision_amount, 'decision', c.decision,
        'created_at', c.created_at, 'responded_at', c.responded_at, 'decided_at', c.decided_at) order by c.created_at)
      from public.rental_claims c where v_uid in (c.lender_id, c.renter_id)), '[]'::jsonb),

    -- Payment set-up (C4): Stripe holds the card and bank details; Dzirent keeps only these.
    'payments', pg_catalog.jsonb_build_object(
      'payment_profile_created_at', (select sc.created_at from public.stripe_customers sc where sc.user_id = v_uid),
      'payout_account', (select pg_catalog.jsonb_build_object('stripe_account_id', pa.stripe_account_id,
          'charges_enabled', pa.charges_enabled, 'payouts_enabled', pa.payouts_enabled,
          'details_submitted', pa.details_submitted, 'updated_at', pa.updated_at)
        from public.payout_accounts pa where pa.user_id = v_uid)),

    'blocked_people', coalesce((select pg_catalog.jsonb_agg(app_private.export_person(b.blocked_id))
      from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),

    -- Reports the caller filed. Not reports about them, and not the outcome, admin notes or
    -- evidence (those describe moderation of the other person).
    'reports_filed', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', rp.id,
        'about', rp.target_type,
        'person', app_private.export_person(rp.target_user_id),
        'listing_id', case when rp.target_type = 'listing' then rp.target_id end,
        'rental_id', case when rp.target_type = 'rental' then rp.target_id end,
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
        'messages', ns.messages, 'show_message_text', ns.show_message_text,
        'rental_reminders', ns.rental_reminders, 'updated_at', ns.updated_at)
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
