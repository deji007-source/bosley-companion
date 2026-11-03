alter table public.user_companion_sync
  add column if not exists selected_ai_provider text not null default '',
  add column if not exists selected_ai_provider_updated_at timestamptz not null default '1970-01-01 00:00:00+00';
alter table public.user_companion_sync
  drop constraint if exists user_companion_sync_selected_ai_provider_check;
alter table public.user_companion_sync
  add constraint user_companion_sync_selected_ai_provider_check
  check (selected_ai_provider in ('','openai','anthropic','gemini','groq','openrouter','mistral'));