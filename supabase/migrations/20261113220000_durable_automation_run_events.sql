-- Durable, account-scoped event history for Bosley agent tasks.
create table if not exists public.automation_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created','progress','checkpoint','completed','failed','cancelled','retried')),
  message text not null check (char_length(message) between 1 and 1200),
  progress integer check (progress is null or progress between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_run_events_owner_run_created_idx
  on public.automation_run_events(user_id, run_id, created_at desc);
create index if not exists automation_runs_owner_created_idx
  on public.automation_runs(user_id, created_at desc);
alter table public.automation_run_events enable row level security;
drop policy if exists "Users can read their own automation run events" on public.automation_run_events;
create policy "Users can read their own automation run events"
  on public.automation_run_events for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.automation_run_events from anon;
grant select on public.automation_run_events to authenticated;
grant all on public.automation_run_events to service_role;
