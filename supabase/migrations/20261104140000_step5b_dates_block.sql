-- Step 5B: changing a chat's requested dates is refused between blocked users
-- (either direction), the same as sending a message or starting a chat.
create or replace function public.set_conversation_dates(
  p_conversation_id uuid, p_start date, p_end date
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Invalid dates' using errcode = '22023';
  end if;
  select c.lender_id into v_lender_id
    from public.conversations c
    where c.id = p_conversation_id and c.renter_id = v_uid;
  if not found then
    raise exception 'Only the renter can set dates for this chat' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender_id)
       or (bl.blocker_id = v_lender_id and bl.blocked_id = v_uid)
  ) then
    raise exception 'You cannot message this user' using errcode = '42501';
  end if;
  update public.conversations
    set requested_start = p_start, requested_end = p_end
    where id = p_conversation_id and renter_id = v_uid;
end;
$function$;
