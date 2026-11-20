-- Bosley Learning Studio: account-owned source documents and searchable text chunks.
create table if not exists public.learning_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null,
  storage_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','failed')),
  source_kind text not null default 'upload' check (source_kind in ('upload','note','web')),
  extracted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);
create index if not exists learning_documents_user_updated_idx
  on public.learning_documents(user_id, updated_at desc);

create table if not exists public.learning_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.learning_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 12000),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
create index if not exists learning_document_chunks_user_idx
  on public.learning_document_chunks(user_id, document_id);
create index if not exists learning_document_chunks_search_idx
  on public.learning_document_chunks using gin(search_vector);

alter table public.learning_documents enable row level security;
alter table public.learning_document_chunks enable row level security;

drop policy if exists "Users manage their own learning documents" on public.learning_documents;
create policy "Users manage their own learning documents"
  on public.learning_documents for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their own learning chunks" on public.learning_document_chunks;
create policy "Users manage their own learning chunks"
  on public.learning_document_chunks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bosley-learning',
  'bosley-learning',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/rtf'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 26214400,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload learning files to own folder" on storage.objects;
create policy "Users upload learning files to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bosley-learning'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users read learning files in own folder" on storage.objects;
create policy "Users read learning files in own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bosley-learning'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update learning files in own folder" on storage.objects;
create policy "Users update learning files in own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bosley-learning'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'bosley-learning'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete learning files in own folder" on storage.objects;
create policy "Users delete learning files in own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bosley-learning'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
