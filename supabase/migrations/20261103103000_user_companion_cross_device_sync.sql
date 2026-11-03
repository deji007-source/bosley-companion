create table if not exists public.user_companion_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  skills jsonb not null default '[]'::jsonb,
  deleted_skill_ids jsonb not null default '[]'::jsonb,
  automation_history jsonb not null default '[]'::jsonb,
  automation_history_cleared_at timestamptz not null default '1970-01-01 00:00:00+00',
  updated_at timestamptz not null default now(),
  constraint user_companion_sync_skills_array check (jsonb_typeof(skills) = 'array'),
  constraint user_companion_sync_deleted_skill_ids_array check (jsonb_typeof(deleted_skill_ids) = 'array'),
  constraint user_companion_sync_history_array check (jsonb_typeof(automation_history) = 'array')
);

alter table public.user_companion_sync enable row level security;

drop policy if exists "Users can read own companion sync data" on public.user_companion_sync;
create policy "Users can read own companion sync data"
  on public.user_companion_sync for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own companion sync data" on public.user_companion_sync;
create policy "Users can insert own companion sync data"
  on public.user_companion_sync for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own companion sync data" on public.user_companion_sync;
create policy "Users can update own companion sync data"
  on public.user_companion_sync for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_companion_sync from anon;
grant select, insert, update on public.user_companion_sync to authenticated;
