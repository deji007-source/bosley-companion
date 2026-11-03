create table if not exists public.user_second_brain_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('project','repository','snippet','decision','bug','task','reference','contact','meeting','command','note')),
  title text not null check (char_length(title) between 1 and 180),
  content text not null default '' check (char_length(content) <= 30000),
  url text check (url is null or (char_length(url) <= 2048 and url ~ '^https?://')),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(tags,' '),'')), 'C')
  ) stored
);
create index if not exists user_second_brain_entries_owner_updated_idx
  on public.user_second_brain_entries (user_id, pinned desc, updated_at desc);
create index if not exists user_second_brain_entries_search_idx
  on public.user_second_brain_entries using gin (search_document);
create index if not exists user_second_brain_entries_owner_category_idx
  on public.user_second_brain_entries (user_id, category);
alter table public.user_second_brain_entries enable row level security;
drop policy if exists "Users can read own second brain entries" on public.user_second_brain_entries;
create policy "Users can read own second brain entries" on public.user_second_brain_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own second brain entries" on public.user_second_brain_entries;
create policy "Users can insert own second brain entries" on public.user_second_brain_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own second brain entries" on public.user_second_brain_entries;
create policy "Users can update own second brain entries" on public.user_second_brain_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own second brain entries" on public.user_second_brain_entries;
create policy "Users can delete own second brain entries" on public.user_second_brain_entries for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_second_brain_entries from anon;
grant select, insert, update, delete on public.user_second_brain_entries to authenticated;
alter publication supabase_realtime add table public.user_second_brain_entries;
