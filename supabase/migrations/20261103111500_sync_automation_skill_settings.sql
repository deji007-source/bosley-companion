alter table public.user_companion_sync
  add column if not exists automation_skill_settings jsonb not null default '{"enabled":true,"ids":null}'::jsonb,
  add column if not exists automation_skill_settings_updated_at timestamptz not null default '1970-01-01 00:00:00+00';
alter table public.user_companion_sync
  drop constraint if exists user_companion_sync_automation_skill_settings_object;
alter table public.user_companion_sync
  add constraint user_companion_sync_automation_skill_settings_object
  check (jsonb_typeof(automation_skill_settings) = 'object');
