-- F1 (2026-11-15): nobody blocks or reports themselves.
-- block_user() and report_user() already skip a self-block or self-report without writing
-- anything (kept as it is). The apps write blocks and reports to the tables directly, where the
-- policies check only that the blocker / reporter is the caller, so a row about yourself could be
-- written there. These checks refuse it, with a code: DZ-E3021 (block), DZ-E5017 (report).

-- Blocks: a trigger, so the refusal carries its code (a check constraint's message has none).
create or replace function app_private.refuse_self_block()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.blocker_id = new.blocked_id then
    raise exception 'DZ-E3021: You can''t block yourself.' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create trigger blocks_not_self before insert or update on public.blocks
  for each row execute function app_private.refuse_self_block();

revoke execute on function app_private.refuse_self_block() from public, anon, authenticated;

-- Reports: report_prepare (P2B) already works out whom a report is about (target_user_id:
-- the person, the listing's lender, the message's sender, the rental's other person). Its body is
-- unchanged; the check is added after it. Reports without a reporter (admin-made) are unaffected.
create or replace function app_private.report_prepare()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.status := 'open';
    new.outcome := null;
    new.outcome_note := null;
    new.closed_at := null;
    new.closed_by := null;
  end if;
  new.target_user_id := app_private.report_target_user(new.reporter_id, new.target_type, new.target_id);
  -- F1: never about yourself.
  if new.reporter_id is not null and new.target_user_id = new.reporter_id then
    raise exception 'DZ-E5017: You can''t report yourself, your own listings or your own messages.' using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke execute on function app_private.report_prepare() from public, anon, authenticated;
