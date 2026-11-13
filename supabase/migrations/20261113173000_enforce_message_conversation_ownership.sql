-- Messages must belong to the same authenticated owner as their parent
-- conversation. This prevents cross-account conversation attachment even if a
-- client submits a forged conversation_id with its own user_id.
drop policy if exists "own messages all" on public.messages;

create policy "Owners manage messages in own conversations"
  on public.messages
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.conversations c
      where c.id = messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create index if not exists messages_conversation_owner_created_idx
  on public.messages (conversation_id, user_id, created_at);
