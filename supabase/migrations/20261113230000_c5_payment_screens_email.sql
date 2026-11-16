-- C5 (2026-11-14): payment screens (the client side of C4), transactional emails (provider key
-- blank) and the C4 follow-ups.
--
-- 1. Payment deadline: setting payment_deadline_hours (24, 1-72, business owner). An
--    awaiting_payment rental not paid by rentals.payment_due_at (set when it starts waiting) is
--    cancelled by the expiry job, with an event and a rental_cancelled push to both people.
-- 2. rental_settings(): the rules the screens show (request answer time, payment deadline, claim
--    window, cancellation rule, fee, payments on or off), readable by everyone.
-- 3. rental_json: the fields the payment screens and receipts need (fee, tax, captured deposit,
--    hold end, payment deadline, dates of each step, whether the lender can take payments).
-- 4. Emails: notification_settings.email_rentals ("Email me about rentals", default on); the
--    closed table app_private.email_messages (which email, to whom, its outcome; never its text);
--    the outbox kind send_email (Edge Function send-email; Vault send_email_url, email_job_secret).
--    Rental emails are queued next to the rental pushes (same blocked-pair rule, their own switch,
--    no phone needed); the payment receipt when a payment succeeds; the account-deleted email by
--    delete-account. While the provider key is blank send-email marks the email skipped and the
--    outbox marks its job skipped (not failed). Finished email rows are kept email_log_retention_days
--    (30, a retention setting).
--    Emails go only to the account's own email address and never carry messages, measurements or
--    locations: send-email renders them from email_prepare's fields.

-- 1. Payment deadline ----------------------------------------------------------------------------
insert into app_private.settings (key, value, note, label, area, value_type, unit, min_value, max_value, decided_by, affects_terms)
values ('payment_deadline_hours', '24'::jsonb,
        'With payments on, the renter has this long after the lender accepts to pay. An unpaid rental is then cancelled automatically and both people are told.',
        'Time to pay after acceptance', 'payments', 'integer', 'hours after acceptance', 1, 72, 'business_owner', true)
on conflict (key) do nothing;

-- How long the record of each email is kept (4. below): a retention period the privacy page states.
insert into app_private.settings (key, value, note, label, area, value_type, unit, min_value, max_value, decided_by, affects_terms)
values ('email_log_retention_days', '30'::jsonb,
        'How long Dzirent keeps the record of each email (which one, to which account, the outcome; never its text) after it was sent or skipped.',
        'Email records', 'retention', 'integer', 'days after sending', 7, 365, 'attorney', true)
on conflict (key) do nothing;

alter table public.rentals add column payment_due_at timestamp with time zone;
comment on column public.rentals.payment_due_at is 'C5: when an awaiting_payment rental is cancelled if still unpaid (acceptance + payment_deadline_hours, fixed when it starts waiting).';
create index rentals_payment_due_idx on public.rentals (payment_due_at) where status = 'awaiting_payment';

-- Fixed when the rental starts waiting for payment, so a later settings change doesn't move it.
create function app_private.rentals_payment_due()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'awaiting_payment' and (tg_op = 'INSERT' or old.status is distinct from 'awaiting_payment') then
    new.payment_due_at := pg_catalog.now() + pg_catalog.make_interval(hours => app_private.setting_int('payment_deadline_hours'));
  end if;
  return new;
end;
$$;
create trigger rentals_payment_due before insert or update of status on public.rentals
  for each row execute function app_private.rentals_payment_due();

-- 2. The rules the screens show -------------------------------------------------------------------
create function public.rental_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'payments_enabled', app_private.payments_enabled(),
    'rental_request_hours', app_private.setting_int('rental_request_hours'),
    'payment_deadline_hours', app_private.setting_int('payment_deadline_hours'),
    'claim_window_hours', app_private.setting_int('claim_window_hours'),
    'cancellation_refund_cutoff_hours', app_private.setting_int('cancellation_refund_cutoff_hours'),
    'late_cancellation_refund_percent', app_private.setting_num('late_cancellation_refund_percent'),
    'platform_fee_percent', app_private.setting_num('platform_fee_percent'));
$$;
comment on function public.rental_settings() is 'C5: the rental and payment rules the apps and website show (no secrets; the Terms state them).';

-- 4. Emails --------------------------------------------------------------------------------------
alter table public.notification_settings add column email_rentals boolean not null default true;
grant select (email_rentals), insert (email_rentals), update (email_rentals) on public.notification_settings to authenticated;
comment on column public.notification_settings.email_rentals is 'C5: "Email me about rentals" (requests, answers, receipts, reminders, claims). Default on.';

create table app_private.email_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  template text not null constraint email_messages_template_check check (template in (
    'rental_request', 'request_accepted', 'request_declined', 'payment_receipt', 'pickup_reminder',
    'return_reminder', 'claim_filed', 'claim_decided', 'account_deleted')),
  recipient_id uuid references public.profiles (id) on delete set null,
  -- Only for account_deleted (the account is gone when it is sent); cleared once it finishes.
  to_address text check (to_address is null or pg_catalog.char_length(to_address) <= 320),
  rental_id uuid references public.rentals (id) on delete set null,
  -- Which push kind it went with and an amount line written by the database; never message text.
  details jsonb not null default '{}'::jsonb,
  status text not null default 'queued' constraint email_messages_status_check check (status in ('queued', 'sent', 'skipped', 'failed')),
  skip_reason text check (pg_catalog.char_length(skip_reason) <= 60),
  provider_message_id text check (pg_catalog.char_length(provider_message_id) <= 200),
  error text check (pg_catalog.char_length(error) <= 300),
  created_at timestamp with time zone not null default pg_catalog.now(),
  finished_at timestamp with time zone,
  -- An address is stored only for the account-deleted email, which has no account to point to.
  constraint email_messages_address_check check (to_address is null or template = 'account_deleted'),
  constraint email_messages_deleted_check check (template <> 'account_deleted' or recipient_id is null)
);
create index email_messages_recipient_idx on app_private.email_messages (recipient_id);
create index email_messages_finished_idx on app_private.email_messages (finished_at) where status <> 'queued';
alter table app_private.email_messages enable row level security;
revoke all on app_private.email_messages from public, anon, authenticated, service_role;
comment on table app_private.email_messages is 'C5: each transactional email: which template, to whom (an account, or an address only for the account-deleted email), its outcome. Never the email text. Kept 30 days after it finishes.';

alter table app_private.async_jobs drop constraint async_jobs_kind_check;
alter table app_private.async_jobs add constraint async_jobs_kind_check
  check (kind in ('send_push', 'scan_listing', 'stripe_deposit', 'stripe_refund', 'send_email'));
alter table app_private.async_jobs drop constraint async_jobs_status_check;
alter table app_private.async_jobs add constraint async_jobs_status_check
  check (status in ('pending', 'running', 'done', 'dead', 'skipped'));

-- Vault: where send-email lives and the secret that proves the database is calling (generated here;
-- the same value is the function secret EMAIL_JOB_SECRET).
do $vault$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'email_job_secret') then
    perform vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'), 'email_job_secret',
      'Proves to the send-email Edge Function that this database is calling');
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'send_email_url') then
    perform vault.create_secret('https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/send-email',
      'send_email_url', 'Address of the send-email Edge Function');
  end if;
end
$vault$;

-- One email: a row and an outbox job. Skipped (null) when the person turned rental emails off or
-- email isn't set up (no address in Vault). Never stops the change that asked for it.
create function app_private.queue_email(p_template text, p_recipient uuid, p_rental uuid, p_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on boolean;
  v_id uuid;
begin
  if p_recipient is null
     or not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'send_email_url') then
    return null;
  end if;
  select ns.email_rentals into v_on from public.notification_settings ns where ns.user_id = p_recipient;
  if found and not v_on then
    return null;
  end if;
  insert into app_private.email_messages (template, recipient_id, rental_id, details)
  values (p_template, p_recipient, p_rental, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  perform app_private.enqueue_job('send_email', pg_catalog.jsonb_build_object('email_id', v_id));
  return v_id;
exception when others then
  raise warning 'Email skipped: %', sqlerrm;
  return null;
end;
$$;

-- The rental emails go with these pushes (C3/C4 kinds); the others send no email.
create function app_private.queue_rental_email(p_kind text, p_rental public.rentals, p_recipient uuid, p_detail text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template text := case p_kind
    when 'rental_request' then 'rental_request'
    when 'rental_accepted' then 'request_accepted'
    when 'rental_declined' then 'request_declined'
    when 'pickup_tomorrow' then 'pickup_reminder'
    when 'return_tomorrow' then 'return_reminder'
    when 'return_overdue' then 'return_reminder'
    when 'claim_filed' then 'claim_filed'
    when 'claim_decided' then 'claim_decided'
  end;
begin
  if v_template is null then
    return null;
  end if;
  return app_private.queue_email(v_template, p_recipient, p_rental.id,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind', p_kind, 'detail', app_private.push_safe_text(p_detail, 120))));
end;
$$;

-- The payment receipt, when a rental payment succeeds (the webhook sets payment_status paid).
create function app_private.rentals_receipt_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
    perform app_private.queue_email('payment_receipt', new.renter_id, new.id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
create trigger rentals_receipt_email after update of payment_status on public.rentals
  for each row execute function app_private.rentals_receipt_email();

-- delete-account (server key): the "your account was deleted" email, to the address the account
-- had. The address is kept only until the email is sent or skipped.
create function public.queue_account_deleted_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.btrim(coalesce(p_email, ''));
  v_id uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or pg_catalog.char_length(v_email) > 320
     or not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'send_email_url') then
    return null;
  end if;
  insert into app_private.email_messages (template, to_address) values ('account_deleted', v_email) returning id into v_id;
  perform app_private.enqueue_job('send_email', pg_catalog.jsonb_build_object('email_id', v_id));
  return v_id;
end;
$$;

-- send-email (server key): what to send. Marks the email skipped when it can't or shouldn't go
-- (no address, rental emails turned off since, the rental gone). Only plain fields: names, the
-- listing title, dates and amounts. Never messages, the claim's reason, measurements or places.
create function public.email_prepare(p_email_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email app_private.email_messages;
  v_rental public.rentals;
  v_to text;
  v_skip text;
  v_role text;
  v_other uuid;
  v_data jsonb;
begin
  select * into v_email from app_private.email_messages e where e.id = p_email_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'gone');
  end if;
  if v_email.status <> 'queued' then
    return pg_catalog.jsonb_build_object('state', 'finished', 'status', v_email.status);
  end if;

  if v_email.template = 'account_deleted' then
    v_to := v_email.to_address;
    v_data := '{}'::jsonb;
  else
    select u.email into v_to from auth.users u where u.id = v_email.recipient_id;
    if exists (select 1 from public.notification_settings ns where ns.user_id = v_email.recipient_id and not ns.email_rentals) then
      v_skip := 'turned_off';
    end if;
    select * into v_rental from public.rentals r where r.id = v_email.rental_id;
    if not found then
      v_skip := coalesce(v_skip, 'rental_gone');
    else
      v_role := case when v_rental.renter_id = v_email.recipient_id then 'renter' else 'lender' end;
      v_other := case when v_role = 'renter' then v_rental.lender_id else v_rental.renter_id end;
      select pg_catalog.jsonb_build_object(
          'role', v_role,
          'name', (select p.display_name from public.profiles p where p.id = v_email.recipient_id),
          'other_name', (select coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name) from public.profiles p where p.id = v_other),
          'listing_title', (select l.title from public.listings l where l.id = v_rental.listing_id),
          'status', v_rental.status,
          'start_date', v_rental.start_date,
          'end_date', v_rental.end_date,
          'days', v_rental.days,
          'price_per_day', v_rental.price_per_day,
          'total', v_rental.total,
          'currency', v_rental.currency,
          'fee_amount', v_rental.fee_amount,
          'tax_amount', v_rental.tax_amount,
          'refund_amount', v_rental.refund_amount,
          'deposit_amount', v_rental.deposit_amount,
          'deposit_status', v_rental.deposit_status,
          'deposit_captured_amount', v_rental.deposit_captured_amount,
          'payment_status', v_rental.payment_status,
          'payment_due_at', v_rental.payment_due_at,
          'expires_at', v_rental.expires_at,
          'payments_enabled', app_private.payments_enabled(),
          'timezone', app_private.setting_text('rental_timezone'),
          'chat_path', '/app/messages/' || v_rental.conversation_id,
          'kind', v_email.details ->> 'kind',
          'detail', v_email.details ->> 'detail',
          'claim', (select pg_catalog.jsonb_build_object('amount', c.amount, 'status', c.status, 'decision_amount', c.decision_amount)
                    from public.rental_claims c where c.rental_id = v_rental.id))
        into v_data;
    end if;
  end if;
  if v_to is null or v_to !~ '@' then
    v_skip := coalesce(v_skip, 'no_address');
  end if;

  if v_skip is not null then
    update app_private.email_messages
      set status = 'skipped', skip_reason = v_skip, to_address = null, finished_at = pg_catalog.now()
      where id = v_email.id;
    return pg_catalog.jsonb_build_object('state', 'skipped', 'reason', v_skip);
  end if;
  return pg_catalog.jsonb_build_object('state', 'send', 'to', v_to, 'template', v_email.template, 'data', v_data);
end;
$$;

-- send-email (server key): the outcome. p_status sent, skipped (with a reason, e.g. not_configured
-- while the provider key is blank) or failed (the provider refused it for good).
create function public.email_finish(p_email_id uuid, p_status text, p_reason text default null, p_provider_id text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'skipped', 'failed') then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = '22023';
  end if;
  update app_private.email_messages
    set status = p_status,
        skip_reason = case when p_status = 'skipped' then pg_catalog.left(p_reason, 60) end,
        error = case when p_status = 'failed' then pg_catalog.left(p_reason, 300) end,
        provider_message_id = pg_catalog.left(p_provider_id, 200),
        to_address = null,
        finished_at = pg_catalog.now()
    where id = p_email_id and status = 'queued';
  return p_status;
end;
$$;

-- 5. The outbox: the send_email kind and the skipped state ------------------------------------
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

  if v_job.kind = 'send_email' and not exists (
    select 1 from app_private.email_messages e
    where e.id = (v_job.payload->>'email_id')::uuid and e.status = 'queued'
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the email already finished',
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
  elsif v_job.kind = 'send_email' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'send_email_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'email_job_secret';
    v_header := 'x-email-secret';
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
    elsif v_job.kind = 'send_email' then
      -- C5: the email shows as failed (its address, if any, is dropped).
      update app_private.email_messages
        set status = 'failed', error = pg_catalog.left('The email job could not run: ' || coalesce(p_error, 'failed'), 300),
            to_address = null, finished_at = pg_catalog.now()
        where id = (v_job.payload->>'email_id')::uuid and status = 'queued';
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

create or replace function app_private.run_async_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_code integer;
  v_timed_out boolean;
  v_error text;
  v_done integer := 0;
  v_failed integer := 0;
  v_sent integer := 0;
  v_removed integer := 0;
begin
  for r in
    select j.id, j.kind, j.payload, j.request_id, j.dispatched_at from app_private.async_jobs j
    where j.status = 'running' order by j.id for update skip locked
  loop
    select h.status_code, h.timed_out, h.error_msg into v_code, v_timed_out, v_error
    from net._http_response h where h.id = r.request_id;
    if found then
      if v_code between 200 and 299 then
        -- C5: an email that send-email skipped (no provider key yet) marks its job skipped, not done.
        update app_private.async_jobs
          set status = case when r.kind = 'send_email' and exists (
                select 1 from app_private.email_messages e
                where e.id = (r.payload->>'email_id')::uuid and e.status = 'skipped') then 'skipped' else 'done' end,
              finished_at = pg_catalog.now(), updated_at = pg_catalog.now(), request_id = null
          where id = r.id;
        v_done := v_done + 1;
      else
        perform app_private.job_failed(r.id, case
          when coalesce(v_timed_out, false) then 'timed out'
          when v_code is null then 'no answer: ' || coalesce(v_error, 'unknown')
          else 'HTTP ' || v_code end);
        v_failed := v_failed + 1;
      end if;
    elsif r.dispatched_at < pg_catalog.now() - interval '10 minutes' then
      perform app_private.job_failed(r.id, 'no answer after 10 minutes');
      v_failed := v_failed + 1;
    end if;
  end loop;

  for r in
    select j.id from app_private.async_jobs j
    where j.status = 'pending' and j.next_attempt_at <= pg_catalog.now()
    order by j.next_attempt_at limit 100 for update skip locked
  loop
    perform app_private.dispatch_job(r.id);
    v_sent := v_sent + 1;
  end loop;

  delete from app_private.async_jobs j
  where (j.status in ('done', 'skipped') and j.finished_at < pg_catalog.now() - interval '1 day')
     or (j.status = 'dead' and j.finished_at < pg_catalog.now() - interval '30 days');
  get diagnostics v_removed = row_count;
  -- C5: finished email rows are kept email_log_retention_days (30).
  delete from app_private.email_messages e
  where e.status <> 'queued'
    and e.finished_at < pg_catalog.now() - pg_catalog.make_interval(days => app_private.setting_int('email_log_retention_days'));

  return pg_catalog.jsonb_build_object('done', v_done, 'failed', v_failed, 'dispatched', v_sent, 'removed', v_removed);
end;
$$;

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
                           and j.attempts > 0),
            'skipped_day', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'skipped'
                           and j.finished_at > pg_catalog.now() - interval '1 day'))
          order by k.ord)
        from pg_catalog.unnest(array['send_push', 'scan_listing', 'stripe_deposit', 'stripe_refund', 'send_email']) with ordinality as k(kind, ord)),
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
      'operation_id', case when j.kind in ('stripe_deposit', 'stripe_refund') then j.payload->>'operation_id' end,
      -- C5: which email (the template), never its address or text.
      'email_template', case when j.kind = 'send_email' then
        (select e.template from app_private.email_messages e where e.id = (j.payload->>'email_id')::uuid) end)
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

-- 6. Rental emails go with the rental pushes (same blocked-pair rule) -------------------------------
create or replace function app_private.queue_rental_push(p_kind text, p_rental public.rentals, p_recipient uuid,
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
  -- C5: the email for this kind (its own switch; no phone needed).
  perform app_private.queue_rental_email(p_kind, p_rental, p_recipient, p_detail);
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

-- 7. Every 10 minutes: the payment deadline too ----------------------------------------------------
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
  v_pay_hours integer := app_private.setting_int('payment_deadline_hours');
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

  -- C5: waiting for payment past the deadline (payment_due_at).
  for v_rental in
    select * from public.rentals r
    where r.status = 'awaiting_payment' and r.payment_due_at is not null and r.payment_due_at <= pg_catalog.now()
      and r.payment_status not in ('paid', 'partially_refunded', 'refunded')
    order by r.payment_due_at for update skip locked
  loop
    v_rental := app_private.rental_move(v_rental, 'cancelled', null,
      'Not paid within ' || v_pay_hours || case when v_pay_hours = 1 then ' hour' else ' hours' end || ' after it was accepted');
    perform app_private.after_cancel_payments(v_rental, false, 'Automatic cancellation: not paid in time');
    perform app_private.queue_rental_push('rental_cancelled', v_rental, v_rental.renter_id, null, 'Not paid in time');
    perform app_private.queue_rental_push('rental_cancelled', v_rental, v_rental.lender_id, null, 'Not paid in time');
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

-- 8. What the two people see: receipts and the payment deadline ------------------------------------
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
    'claim_window_ends_at', p_rental.claim_window_ends_at,
    -- C5: receipts, the payment deadline, the hold's end, each step's time, and whether the
    -- lender can take payments (for the renter's Pay button and the lender's set-up notice).
    'fee_amount', p_rental.fee_amount,
    'tax_amount', p_rental.tax_amount,
    'deposit_captured_amount', p_rental.deposit_captured_amount,
    'deposit_capture_before', p_rental.deposit_capture_before,
    'payment_due_at', p_rental.payment_due_at,
    'responded_at', p_rental.responded_at,
    'picked_up_at', p_rental.picked_up_at,
    'returned_at', p_rental.returned_at,
    'completed_at', p_rental.completed_at,
    'cancelled_at', p_rental.cancelled_at,
    'lender_can_take_payment', coalesce((select a.charges_enabled from public.payout_accounts a where a.user_id = p_rental.lender_id), false))
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

-- 9. Download my data: the email switch and the emails sent -----------------------------------------
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
        'rental_reminders', ns.rental_reminders, 'email_rentals', ns.email_rentals, 'updated_at', ns.updated_at)
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
  ) || pg_catalog.jsonb_build_object(
    -- C5: the emails Dzirent sent you (or skipped) in the last 30 days: which one and when, not their text.
    'emails', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'email', em.template, 'status', em.status, 'created_at', em.created_at, 'finished_at', em.finished_at)
        order by em.created_at)
      from app_private.email_messages em where em.recipient_id = v_uid), '[]'::jsonb)
  ) into v_result;

  insert into public.data_exports (user_id) values (v_uid);
  return v_result;
end;
$function$;

-- 10. Who may call what --------------------------------------------------------------------------
revoke execute on function app_private.rentals_payment_due() from public, anon, authenticated;
revoke execute on function app_private.queue_email(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function app_private.queue_rental_email(text, public.rentals, uuid, text) from public, anon, authenticated;
revoke execute on function app_private.rentals_receipt_email() from public, anon, authenticated;
revoke execute on function app_private.dispatch_job(bigint) from public, anon, authenticated;
revoke execute on function app_private.job_failed(bigint, text) from public, anon, authenticated;
revoke execute on function app_private.run_async_jobs() from public, anon, authenticated;
revoke execute on function app_private.queue_rental_push(text, public.rentals, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function app_private.expire_rental_requests() from public, anon, authenticated;
revoke execute on function app_private.rental_json(public.rentals, uuid, boolean) from public, anon, authenticated;

revoke execute on function public.rental_settings() from public;
grant execute on function public.rental_settings() to anon, authenticated, service_role;

revoke execute on function public.queue_account_deleted_email(text) from public, anon, authenticated;
revoke execute on function public.email_prepare(uuid) from public, anon, authenticated;
revoke execute on function public.email_finish(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.queue_account_deleted_email(text) to service_role;
grant execute on function public.email_prepare(uuid) to service_role;
grant execute on function public.email_finish(uuid, text, text, text) to service_role;
