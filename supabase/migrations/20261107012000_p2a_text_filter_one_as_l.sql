-- P2A follow-up: "1" stands for "l" as often as for "i" ("bu11sh!t"), so the language check
-- reads the text both ways. Everything else in text_refusal is unchanged.
create or replace function app_private.text_refusal(p_text text, p_where text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_variants text[];
  v_text text;
  v_allowed record;
begin
  if pg_catalog.btrim(coalesce(p_text, '')) = '' then
    return null;
  end if;
  v_variants := array[app_private.filter_normalize(p_text)];
  if pg_catalog.strpos(p_text, '1') > 0 then
    v_variants := v_variants || app_private.filter_normalize(pg_catalog.translate(p_text, '1', 'l'));
  end if;
  foreach v_text in array v_variants loop
    v_text := ' ' || v_text || ' ';
    for v_allowed in select a.pattern from app_private.text_filter_allowed a loop
      v_text := pg_catalog.regexp_replace(v_text, v_allowed.pattern, ' |', 'g');
    end loop;
    if exists (select 1 from app_private.text_filter_terms t where v_text ~ t.pattern) then
      return 'This text includes language that isn''t allowed on Dzirent.';
    end if;
  end loop;
  if p_where = 'listing' and app_private.text_has_contact(p_text) then
    return 'Please remove contact details from your listing; people can message you in Dzirent.';
  end if;
  if p_where = 'profile' and app_private.text_has_contact(p_text) then
    return 'Please remove contact details from your profile; people can message you in Dzirent.';
  end if;
  return null;
end;
$function$;

revoke execute on function app_private.text_refusal(text, text) from public, anon, authenticated;
