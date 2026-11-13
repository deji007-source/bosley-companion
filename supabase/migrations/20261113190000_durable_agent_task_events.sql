-- Durable, account-scoped agent task event stream.
create table if not exists public.automation_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('created','claimed','progress','completed','failed','cancelled','retried')),
  message text not null check (char_length(message) between 1 and 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_run_events_owner_run_created_idx
  on public.automation_run_events(user_id, run_id, created_at desc);
alter table public.automation_run_events enable row level security;
drop policy if exists "own automation run events all" on public.automation_run_events;
create policy "own automation run events all" on public.automation_run_events
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
