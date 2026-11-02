-- Read-only exporter for dependencies outside a pg_dump --schema=public dump.
-- Run with psql -X -q -t -A; append its output to reference/schema.sql.
begin read only;
set local search_path = '';
select '-- Structural dependencies outside public; no row data.' || E'\n' ||
  'CREATE SCHEMA IF NOT EXISTS extensions;' || E'\n' ||
  'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;' || E'\n' ||
  'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;' || E'\n' ||
  coalesce((
    select pg_catalog.string_agg(pg_catalog.pg_get_triggerdef(t.oid, false) || ';', E'\n' order by t.tgname)
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal and n.nspname = 'auth' and pn.nspname = 'public'
  ), '') || E'\n' ||
  coalesce((
    select pg_catalog.string_agg(
      pg_catalog.format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
        policyname, schemaname, tablename, permissive, cmd,
        (select pg_catalog.string_agg(case when r = 'public' then 'PUBLIC' else pg_catalog.quote_ident(r) end, ', ')
          from pg_catalog.unnest(roles) r),
        case when qual is null then '' else ' USING (' || qual || ')' end,
        case when with_check is null then '' else ' WITH CHECK (' || with_check || ')' end),
      E'\n' order by tablename, policyname)
    from pg_catalog.pg_policies where schemaname = 'storage'
  ), '') || E'\n' ||
  coalesce((
    select pg_catalog.string_agg(
      pg_catalog.format('CREATE EVENT TRIGGER %I ON %s%s EXECUTE FUNCTION %I.%I();',
        e.evtname, e.evtevent,
        case when e.evttags is null then '' else ' WHEN TAG IN (' ||
          (select pg_catalog.string_agg(pg_catalog.quote_literal(tag), ', ') from pg_catalog.unnest(e.evttags) tag) || ')' end,
        n.nspname, p.proname) || E'\n' ||
      pg_catalog.format('ALTER EVENT TRIGGER %I %s;', e.evtname,
        case e.evtenabled when 'D' then 'DISABLE' when 'R' then 'ENABLE REPLICA'
          when 'A' then 'ENABLE ALWAYS' else 'ENABLE' end), E'\n' order by e.evtname)
    from pg_catalog.pg_event_trigger e
    join pg_catalog.pg_proc p on p.oid = e.evtfoid
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ), '') || E'\n' ||
  coalesce((
    select pg_catalog.string_agg(
      pg_catalog.format('ALTER PUBLICATION %I ADD TABLE %I.%I;', pubname, schemaname, tablename),
      E'\n' order by pubname, tablename)
    from pg_catalog.pg_publication_tables where schemaname = 'public'
  ), '') as ddl;
commit;
