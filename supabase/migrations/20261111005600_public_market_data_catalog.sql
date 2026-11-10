create table if not exists public.market_data_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  homepage_url text not null check (homepage_url ~ '^https?://'),
  documentation_url text check (documentation_url is null or documentation_url ~ '^https?://'),
  license_name text not null default 'Needs review',
  license_url text check (license_url is null or license_url ~ '^https?://'),
  attribution_text text not null default '',
  free_access boolean not null default false,
  supported_markets text[] not null default '{}',
  supported_timeframes text[] not null default '{}',
  status text not null default 'needs_review' check (status in ('active','needs_review','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_data_catalog (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.market_data_providers(id) on delete restrict,
  dataset_key text not null unique check (char_length(dataset_key) between 3 and 180),
  title text not null check (char_length(title) between 1 and 180),
  symbol text not null check (char_length(symbol) between 1 and 32),
  market text not null check (char_length(market) between 1 and 40),
  timeframe text not null check (timeframe in ('1d','1w','1mo')),
  currency text,
  started_on date,
  ended_on date,
  source_url text not null check (source_url ~ '^https?://'),
  license_status text not null default 'needs_review' check (license_status in ('approved','needs_review','restricted')),
  availability_status text not null default 'planned' check (availability_status in ('available','planned','paused')),
  refresh_policy text not null default 'on_demand' check (refresh_policy in ('on_demand','daily','weekly','static')),
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (started_on is null or ended_on is null or started_on <= ended_on)
);

create index if not exists market_data_catalog_symbol_idx on public.market_data_catalog (market, symbol, timeframe);
create index if not exists market_data_catalog_status_idx on public.market_data_catalog (availability_status, license_status);

alter table public.market_data_providers enable row level security;
alter table public.market_data_catalog enable row level security;

drop policy if exists "Public can read active market data providers" on public.market_data_providers;
create policy "Public can read active market data providers"
on public.market_data_providers for select to anon, authenticated
using (status in ('active','needs_review'));

drop policy if exists "Public can read market data catalog" on public.market_data_catalog;
create policy "Public can read market data catalog"
on public.market_data_catalog for select to anon, authenticated
using (true);

revoke insert, update, delete on public.market_data_providers from anon, authenticated;
revoke insert, update, delete on public.market_data_catalog from anon, authenticated;
grant select on public.market_data_providers to anon, authenticated;
grant select on public.market_data_catalog to anon, authenticated;

insert into public.market_data_providers
(slug, display_name, homepage_url, documentation_url, license_name, attribution_text, free_access, supported_markets, supported_timeframes, status)
values
('stooq','Stooq','https://stooq.com/','https://stooq.com/q/d/','Needs review','Source: Stooq. Check current terms and attribution requirements before use.',true,array['equities','indices','forex'],array['1d'], 'needs_review')
on conflict (slug) do update set
 display_name=excluded.display_name,
 homepage_url=excluded.homepage_url,
 documentation_url=excluded.documentation_url,
 license_name=excluded.license_name,
 attribution_text=excluded.attribution_text,
 free_access=excluded.free_access,
 supported_markets=excluded.supported_markets,
 supported_timeframes=excluded.supported_timeframes,
 status=excluded.status,
 updated_at=now();
