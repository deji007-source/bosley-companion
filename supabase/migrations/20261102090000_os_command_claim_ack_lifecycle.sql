alter table public.os_commands
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid;

create index if not exists os_commands_pending_created_idx
  on public.os_commands (user_id, created_at)
  where status = 'pending';

create index if not exists os_commands_processing_claimed_idx
  on public.os_commands (claimed_at)
  where status = 'processing';

comment on column public.os_commands.claimed_at is 'Timestamp when the native desktop agent claimed this command; not proof of execution.';
comment on column public.os_commands.claim_token is 'Per-batch token required to acknowledge execution.';
