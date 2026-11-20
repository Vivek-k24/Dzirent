-- V2 pgTAP: policy_item_types has the six "text or poster" rows, defined like every other
-- not-clothing item, and the earlier rows are still there. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is((select count(*)::int from public.policy_item_types), 121, '121 policy rows, as in policy.json');
select is((select pg_catalog.array_agg(key order by position) from public.policy_item_types
           where key in ('text_page', 'poster', 'book_cover', 'shop_sign', 'infographic', 'screenshot')),
          array['text_page', 'poster', 'book_cover', 'shop_sign', 'infographic', 'screenshot'],
          'the six text or poster rows, in order');
select is((select count(*)::int from public.policy_item_types
           where key in ('text_page', 'poster', 'book_cover', 'shop_sign', 'infographic', 'screenshot')
             and kind = 'other' and not allowed and policy_group = 'not clothing'
             and category is null and item_type is null and garment_type is null and style is null
             and reason = 'This doesn''t look like clothing or an accessory we list.'
             and pg_catalog.cardinality(prompts) >= 3),
          6, 'each is a not-clothing row like the others: other, not allowed, the one reason, prompts');
select is((select position from public.policy_item_types where key = 'text_page'),
          (select position + 1 from public.policy_item_types where key = 'document'),
          'they follow the document row');
select is((select count(*)::int from public.policy_item_types where key in ('costume', 'document', 'toy', 'blazer')),
          4, 'the earlier rows are still there');

select * from finish();
rollback;
