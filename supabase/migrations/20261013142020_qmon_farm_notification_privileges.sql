-- Supabase production default privileges can grant writes to API roles.
-- Preferences are changed only by the authenticated server wrapper/service RPC.
revoke all on public.farm_notification_settings from public, anon, authenticated;
grant select on public.farm_notification_settings to authenticated;
grant all on public.farm_notification_settings to service_role;
