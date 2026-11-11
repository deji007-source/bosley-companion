create table if not exists public.market_data_candles (
  provider_slug text not null references public.market_data_providers(slug) on delete restrict,
  symbol text not null check (char_length(symbol) between 1 and 32),
  timeframe text not null check (timeframe = '1d'),
  candle_date date not null,
  open numeric not null check (open > 0),
  high numeric not null check (high > 0),
  low numeric not null check (low > 0),
  close numeric not null check (close > 0),
  volume numeric check (volume is null or volume >= 0),
  fetched_at timestamptz not null default now(),
  primary key (provider_slug,symbol,timeframe,candle_date),
  check (high >= greatest(open,close,low)),
  check (low <= least(open,close,high))
);
create index if not exists market_data_candles_lookup_idx on public.market_data_candles(symbol,timeframe,candle_date);
alter table public.market_data_candles enable row level security;
drop policy if exists "Authenticated users can read shared market candles" on public.market_data_candles;
create policy "Authenticated users can read shared market candles" on public.market_data_candles for select to authenticated using (true);
revoke insert,update,delete on public.market_data_candles from anon,authenticated;
grant select on public.market_data_candles to authenticated;

create table if not exists public.market_data_ingestion_runs (
 id uuid primary key default gen_random_uuid(),
 provider_slug text not null references public.market_data_providers(slug) on delete restrict,
 symbol text not null,
 timeframe text not null,
 requested_from date not null,
 requested_to date not null,
 fetched_rows integer not null default 0 check (fetched_rows >= 0),
 accepted_rows integer not null default 0 check (accepted_rows >= 0),
 rejected_rows integer not null default 0 check (rejected_rows >= 0),
 cache_rows integer not null default 0 check (cache_rows >= 0),
 status text not null check (status in ('success','partial','failed')),
 error_message text,
 quality jsonb not null default '{}'::jsonb check (jsonb_typeof(quality)='object'),
 started_at timestamptz not null default now(),
 finished_at timestamptz
);
create index if not exists market_data_ingestion_runs_recent_idx on public.market_data_ingestion_runs(provider_slug,symbol,started_at desc);
alter table public.market_data_ingestion_runs enable row level security;
drop policy if exists "Authenticated users can read market ingestion history" on public.market_data_ingestion_runs;
create policy "Authenticated users can read market ingestion history" on public.market_data_ingestion_runs for select to authenticated using (true);
revoke insert,update,delete on public.market_data_ingestion_runs from anon,authenticated;
grant select on public.market_data_ingestion_runs to authenticated;