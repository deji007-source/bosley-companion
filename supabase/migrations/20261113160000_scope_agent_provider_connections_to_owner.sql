-- Provider credentials are private to the account that created them.
-- RLS was enabled on this table but no policies existed, so authenticated
-- users could not manage their own connections through the client.
alter table public.agent_provider_connections enable row level security;

drop policy if exists "Users manage own agent provider connections"
  on public.agent_provider_connections;

create policy "Users manage own agent provider connections"
  on public.agent_provider_connections
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
