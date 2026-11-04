alter table public.agent_provider_connections
  drop constraint if exists agent_provider_connections_provider_check;

alter table public.agent_provider_connections
  add constraint agent_provider_connections_provider_check
  check (provider = any (array[
    'openai'::text,
    'anthropic'::text,
    'gemini'::text,
    'groq'::text,
    'openrouter'::text,
    'mistral'::text,
    'grok'::text
  ]));
