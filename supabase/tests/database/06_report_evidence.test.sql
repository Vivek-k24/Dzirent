-- C2 pgTAP: a report saves an evidence snapshot when it is made, and the snapshot never changes (P2B).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
create temp table chat on commit drop as select public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490') as id;
insert into public.messages (conversation_id, sender_id, body)
  select id, '33333333-3333-4333-8333-333333333333', 'pgtap evidence context' from chat;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
insert into public.messages (conversation_id, sender_id, body)
  select id, '11111111-1111-4111-8111-111111111111', 'pgtap reported message' from chat;
reset role;
create temp table target on commit drop as
  select m.id from public.messages m where m.body = 'pgtap reported message' order by m.created_at desc limit 1;
grant select on target to authenticated;

-- Test user 3 reports test user 1's message.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$insert into public.reports (reporter_id, target_type, target_id, reason, details, status)
  select '33333333-3333-4333-8333-333333333333', 'message', id, 'Harassment', 'pgtap', 'open' from target$$, 'the reporter files a report');
reset role;

create temp table rep on commit drop as
  select r.id, r.target_user_id from public.reports r where r.target_id = (select id from target);
select is((select target_user_id from rep), '11111111-1111-4111-8111-111111111111'::uuid, 'the server sets who the report is about');
select is((select count(*)::int from app_private.report_evidence e where e.report_id = (select id from rep)), 1, 'one evidence snapshot is saved');
select ok((select snapshot::text from app_private.report_evidence e where e.report_id = (select id from rep)) like '%pgtap reported message%',
  'the snapshot holds the reported message');
select ok((select snapshot::text from app_private.report_evidence e where e.report_id = (select id from rep)) like '%pgtap evidence context%',
  'and the messages around it');
select throws_like($$update app_private.report_evidence set snapshot = '{}'::jsonb where report_id = (select id from rep)$$,
  'DZ-E5005:%', 'the snapshot can''t be changed, even by the database owner');
-- The reported message goes (an admin removes it); the snapshot stays as it was.
delete from public.messages where id = (select id from target);
select ok((select snapshot::text from app_private.report_evidence e where e.report_id = (select id from rep)) like '%pgtap reported message%',
  'the snapshot keeps the message after it is deleted');

select * from finish();
rollback;
