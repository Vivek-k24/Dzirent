-- P2C: the "Preview only" label in the website header. On by default; admins switch it on the
-- admin Flags page (set_flag, logged).
insert into public.app_settings (key, enabled, description)
values ('preview_label', true, 'Shows "Preview only" in red in the website header, on every page.')
on conflict (key) do nothing;
