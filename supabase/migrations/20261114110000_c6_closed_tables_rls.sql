-- C6 follow-up (2026-11-14): row-level security on the three closed tables that had only their
-- privileges revoked: app_private.didit_sessions and app_private.didit_events (C6) and
-- app_private.rental_reminders (C3). The Security Advisor after the C6 deploy doesn't list a table
-- without RLS in app_private (that schema isn't exposed), so a catalog query found them. With this,
-- every table in public and app_private has RLS again, as the P5A audit recorded and as every other
-- closed table (payment_events, email_messages, settings, ...) already has.
--
-- No policy, on purpose: the API roles still have no privilege on these tables. The functions and
-- the cron jobs that use them run as the table owner, whom RLS doesn't restrict (no FORCE), so
-- nothing that works today changes. pgTAP (01_roles_rls) now checks that no table in public or
-- app_private is without RLS.
alter table app_private.didit_sessions enable row level security;
alter table app_private.didit_events enable row level security;
alter table app_private.rental_reminders enable row level security;
