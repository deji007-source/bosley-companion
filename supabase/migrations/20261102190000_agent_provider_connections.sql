-- User-scoped AI provider credentials. Secrets are encrypted by the agent-gateway
-- with AES-GCM before they reach Postgres; the encryption key exists only as an Edge Function secret.
create table if not exists public.agent_provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini','groq','openrouter','mistral')),
  api_key_ciphertext text not null,
  api_key_iv text not null,
  model text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.agent_provider_connections enable row level security;
-- No client policies: only the authenticated Edge Function's service-role client can access ciphertext.
revoke all on public.agent_provider_connections from anon, authenticated;
grant all on public.agent_provider_connections to service_role;
create index if not exists agent_provider_connections_user_idx on public.agent_provider_connections(user_id);
