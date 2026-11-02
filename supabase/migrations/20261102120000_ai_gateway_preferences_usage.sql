-- Per-user routing preferences and privacy-preserving AI gateway request history.
create table if not exists public.ai_gateway_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'hybrid' check (mode in ('hybrid','local_only','cloud_only')),
  preferred_provider text null check (preferred_provider is null or preferred_provider in ('openai','anthropic','gemini','deepseek','ollama')),
  allow_cloud_fallback boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_gateway_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_route text not null,
  requested_provider text null,
  model_id text null,
  status text not null default 'started' check (status in ('started','completed','failed')),
  http_status integer null,
  latency_ms integer null,
  provider_request_id text null,
  created_at timestamptz not null default now()
);

create index if not exists ai_gateway_usage_user_created_idx
  on public.ai_gateway_usage(user_id, created_at desc);

alter table public.ai_gateway_preferences enable row level security;
alter table public.ai_gateway_usage enable row level security;

drop policy if exists "Users manage own AI gateway preferences" on public.ai_gateway_preferences;
create policy "Users manage own AI gateway preferences"
  on public.ai_gateway_preferences for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users read own AI gateway usage" on public.ai_gateway_usage;
create policy "Users read own AI gateway usage"
  on public.ai_gateway_usage for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ai_gateway_preferences to authenticated;
grant select on public.ai_gateway_usage to authenticated;
revoke all on public.ai_gateway_usage from anon, authenticated;
grant select on public.ai_gateway_usage to authenticated;
