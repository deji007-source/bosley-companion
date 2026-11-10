-- Strategy library, immutable revisions, simulation runs and import audit trail.
create table if not exists public.trading_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  market_category text not null default 'general'
    check (market_category in ('forex','stocks','crypto','indices','commodities','general')),
  symbol text check (symbol is null or char_length(symbol) <= 32),
  timeframe text not null default '1d'
    check (timeframe in ('1m','5m','15m','30m','1h','4h','1d','1w','1mo')),
  current_revision integer not null default 1 check (current_revision >= 1),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table if not exists public.trading_strategy_revisions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null check (revision_number >= 1),
  format_version integer not null default 1 check (format_version = 1),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  rules_sha256 text check (rules_sha256 is null or rules_sha256 ~ '^[a-f0-9]{64}$'),
  change_note text not null default '' check (char_length(change_note) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (strategy_id, user_id) references public.trading_strategies(id, user_id) on delete cascade,
  unique (strategy_id, revision_number),
  unique (id, strategy_id, user_id)
);

create table if not exists public.trading_backtest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null,
  strategy_revision_id uuid not null,
  dataset_id uuid references public.market_research_datasets(id) on delete set null,
  dataset_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(dataset_snapshot) = 'object'),
  execution_mode text not null default 'backtest' check (execution_mode in ('backtest','paper')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  metrics jsonb check (metrics is null or jsonb_typeof(metrics) = 'object'),
  initial_capital numeric(20,8) check (initial_capital is null or initial_capital > 0),
  start_date date,
  end_date date,
  engine_version text not null default '1',
  error_summary text check (error_summary is null or char_length(error_summary) <= 2000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (strategy_id, user_id) references public.trading_strategies(id, user_id) on delete restrict,
  foreign key (strategy_revision_id, strategy_id, user_id)
    references public.trading_strategy_revisions(id, strategy_id, user_id) on delete restrict,
  unique (id, user_id),
  check (start_date is null or end_date is null or start_date <= end_date)
);

create table if not exists public.trading_backtest_logs (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence_number integer not null check (sequence_number >= 0),
  level text not null default 'info' check (level in ('debug','info','warning','error')),
  event text not null check (char_length(event) between 1 and 120),
  message text not null default '' check (char_length(message) <= 4000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (run_id, user_id) references public.trading_backtest_runs(id, user_id) on delete cascade,
  unique (run_id, sequence_number)
);

create table if not exists public.trading_strategy_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  dataset_id uuid references public.market_research_datasets(id) on delete set null,
  dataset_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(dataset_snapshot) = 'object'),
  date_start date,
  date_end date,
  assumptions jsonb not null default '{}'::jsonb check (jsonb_typeof(assumptions) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (date_start is null or date_end is null or date_start <= date_end)
);

create table if not exists public.trading_strategy_comparison_items (
  id uuid primary key default gen_random_uuid(),
  comparison_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null,
  strategy_revision_id uuid not null,
  backtest_run_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (comparison_id, user_id)
    references public.trading_strategy_comparisons(id, user_id) on delete cascade,
  foreign key (strategy_id, user_id)
    references public.trading_strategies(id, user_id) on delete restrict,
  foreign key (strategy_revision_id, strategy_id, user_id)
    references public.trading_strategy_revisions(id, strategy_id, user_id) on delete restrict,
  foreign key (backtest_run_id, user_id)
    references public.trading_backtest_runs(id, user_id) on delete set null,
  unique (comparison_id, strategy_revision_id)
);

create table if not exists public.trading_strategy_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 180),
  format text not null check (format in ('bosley-strategy-v1','json')),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  licence_name text not null default 'Unspecified' check (char_length(licence_name) <= 160),
  licence_url text check (licence_url is null or (char_length(licence_url) <= 2048 and licence_url ~ '^https?://')),
  licence_status text not null default 'needs_review' check (licence_status in ('needs_review','approved','rejected')),
  security_status text not null default 'pending' check (security_status in ('pending','clean','rejected')),
  scan_report jsonb not null default '{}'::jsonb check (jsonb_typeof(scan_report) = 'object'),
  strategy_payload jsonb not null check (jsonb_typeof(strategy_payload) = 'object'),
  imported_strategy_id uuid,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (imported_strategy_id, user_id)
    references public.trading_strategies(id, user_id) on delete set null
);

create index if not exists trading_strategies_user_updated_idx on public.trading_strategies(user_id, updated_at desc);
create index if not exists trading_strategy_revisions_strategy_idx on public.trading_strategy_revisions(strategy_id, revision_number desc);
create index if not exists trading_backtest_runs_user_created_idx on public.trading_backtest_runs(user_id, created_at desc);
create index if not exists trading_backtest_runs_strategy_idx on public.trading_backtest_runs(strategy_id, created_at desc);
create index if not exists trading_backtest_logs_run_sequence_idx on public.trading_backtest_logs(run_id, sequence_number);
create index if not exists trading_strategy_comparisons_user_created_idx on public.trading_strategy_comparisons(user_id, created_at desc);

alter table public.trading_strategies enable row level security;
alter table public.trading_strategy_revisions enable row level security;
alter table public.trading_backtest_runs enable row level security;
alter table public.trading_backtest_logs enable row level security;
alter table public.trading_strategy_comparisons enable row level security;
alter table public.trading_strategy_comparison_items enable row level security;
alter table public.trading_strategy_imports enable row level security;

create policy "Owners manage trading strategies" on public.trading_strategies
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners read strategy revisions" on public.trading_strategy_revisions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners append strategy revisions" on public.trading_strategy_revisions
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.trading_strategies s
      where s.id = strategy_id and s.user_id = (select auth.uid())
    )
  );

create policy "Owners read backtest runs" on public.trading_backtest_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create backtest runs" on public.trading_backtest_runs
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trading_strategies s where s.id = strategy_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.trading_strategy_revisions r where r.id = strategy_revision_id
      and r.strategy_id = trading_backtest_runs.strategy_id and r.user_id = (select auth.uid()))
  );
create policy "Owners update backtest runs" on public.trading_backtest_runs
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners read backtest logs" on public.trading_backtest_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners append backtest logs" on public.trading_backtest_logs
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.trading_backtest_runs r
      where r.id = run_id and r.user_id = (select auth.uid())
    )
  );

create policy "Owners manage strategy comparisons" on public.trading_strategy_comparisons
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners manage strategy comparison items" on public.trading_strategy_comparison_items
  for all to authenticated using (
    (select auth.uid()) = user_id and exists (
      select 1 from public.trading_strategy_comparisons c
      where c.id = comparison_id and c.user_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trading_strategy_comparisons c
      where c.id = comparison_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.trading_strategy_revisions r
      where r.id = strategy_revision_id and r.strategy_id = trading_strategy_comparison_items.strategy_id
        and r.user_id = (select auth.uid()))
  );

create policy "Owners manage strategy imports" on public.trading_strategy_imports
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.trading_strategies, public.trading_strategy_revisions, public.trading_backtest_runs,
  public.trading_backtest_logs, public.trading_strategy_comparisons, public.trading_strategy_comparison_items,
  public.trading_strategy_imports from anon, public;
grant select, insert, update, delete on public.trading_strategies to authenticated;
grant select, insert on public.trading_strategy_revisions to authenticated;
grant select, insert, update on public.trading_backtest_runs to authenticated;
grant select, insert on public.trading_backtest_logs to authenticated;
grant select, insert, update, delete on public.trading_strategy_comparisons to authenticated;
grant select, insert, update, delete on public.trading_strategy_comparison_items to authenticated;
grant select, insert on public.trading_strategy_imports to authenticated;
grant usage, select on sequence public.trading_backtest_logs_id_seq to authenticated;
