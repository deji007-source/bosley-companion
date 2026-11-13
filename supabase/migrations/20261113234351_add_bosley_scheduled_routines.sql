-- User-owned, allowlisted routines. Scheduled actions are restricted to opening
-- known apps or trusted HTTPS destinations; no shell or arbitrary code execution.
create table if not exists public.bosley_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  action_type text not null check (action_type in ('open_app','open_url')),
  target text not null,
  recurrence text not null check (recurrence in ('once','daily','weekly')),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 80),
  scheduled_time time not null,
  weekday smallint,
  next_run_at timestamptz not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_id uuid references public.automation_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bosley_routines_weekday_check check (
    (recurrence = 'weekly' and weekday between 0 and 6)
    or (recurrence <> 'weekly' and weekday is null)
  ),
  constraint bosley_routines_target_allowlist check (
    (action_type = 'open_app' and lower(target) in ('spotify','chrome','edge','notepad','calculator','explorer'))
    or
    (action_type = 'open_url' and target ~* '^https://([a-z0-9-]+\.)*(google\.com|youtube\.com|spotify\.com|gmail\.com|drive\.google\.com|whatsapp\.com|telegram\.org|github\.com|chatgpt\.com|notion\.so|discord\.com)(/|$)')
  )
);

create index if not exists bosley_routines_due_idx
  on public.bosley_routines (next_run_at)
  where enabled = true;
create index if not exists bosley_routines_owner_idx
  on public.bosley_routines (user_id, created_at desc);

alter table public.bosley_routines enable row level security;
drop policy if exists "Users can read own Bosley routines" on public.bosley_routines;
create policy "Users can read own Bosley routines"
  on public.bosley_routines for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create own Bosley routines" on public.bosley_routines;
create policy "Users can create own Bosley routines"
  on public.bosley_routines for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own Bosley routines" on public.bosley_routines;
create policy "Users can update own Bosley routines"
  on public.bosley_routines for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own Bosley routines" on public.bosley_routines;
create policy "Users can delete own Bosley routines"
  on public.bosley_routines for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.bosley_routines to authenticated;
revoke all on public.bosley_routines from anon;

create or replace function public.dispatch_due_bosley_routines()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  routine record;
  next_at timestamptz;
  run_id uuid;
  instruction_text text;
  local_day date;
  days_forward integer;
  dispatched integer := 0;
begin
  for routine in
    select *
    from public.bosley_routines
    where enabled = true and next_run_at <= clock_timestamp()
    order by next_run_at, id
    for update skip locked
    limit 50
  loop
    if routine.action_type = 'open_app' then
      instruction_text := 'Open ' || routine.target;
    else
      instruction_text := 'Open ' || routine.target;
    end if;

    insert into public.automation_runs (user_id, instruction, status, summary)
    values (routine.user_id, instruction_text, 'pending', 'remote_listener_queue:v1')
    returning id into run_id;

    insert into public.automation_run_events (run_id, user_id, event_type, message, details)
    values (
      run_id, routine.user_id, 'created',
      'Scheduled routine "' || routine.name || '" was queued.',
      jsonb_build_object('routine_id', routine.id, 'recurrence', routine.recurrence)
    );

    if routine.recurrence = 'once' then
      update public.bosley_routines
      set enabled = false, last_run_at = clock_timestamp(), last_run_id = run_id
      where id = routine.id;
    else
      local_day := (clock_timestamp() at time zone routine.timezone)::date;
      if routine.recurrence = 'daily' then
        next_at := ((local_day + 1) + routine.scheduled_time) at time zone routine.timezone;
      else
        days_forward := (routine.weekday - extract(dow from local_day)::integer + 7) % 7;
        if days_forward = 0 then days_forward := 7; end if;
        next_at := ((local_day + days_forward) + routine.scheduled_time) at time zone routine.timezone;
      end if;
      update public.bosley_routines
      set next_run_at = next_at, last_run_at = clock_timestamp(), last_run_id = run_id
      where id = routine.id;
    end if;
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$function$;

revoke all on function public.dispatch_due_bosley_routines() from public, anon, authenticated;
comment on function public.dispatch_due_bosley_routines() is
  'Internal cron dispatcher. Enqueues only allowlisted app and trusted-site opens for explicitly enabled user routines.';

do $block$
begin
  if not exists (select 1 from cron.job where jobname = 'bosley-routine-dispatch') then
    perform cron.schedule(
      'bosley-routine-dispatch',
      '* * * * *',
      'select public.dispatch_due_bosley_routines();'
    );
  end if;
end
$block$;
