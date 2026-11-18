-- messages_insert : on n'écrit plus dans une conversation dont l'annonce n'a plus de propriétaire
-- (compte supprimé) ou dont le demandeur a disparu. La lecture reste possible.
-- Helper security definer : le demandeur ne voit pas l'annonce archivée via la RLS de listings, mais
-- doit pouvoir continuer d'écrire tant que les deux participants existent. La fonction vérifie elle-même
-- que l'appelant est participant (un tiers obtient false).
create or replace function private.conversation_has_both_parties(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.listings l on l.id = c.listing_id
    where c.id = p_conversation_id
      and c.requester_id is not null
      and l.owner_id is not null
      and (c.requester_id = (select auth.uid()) or l.owner_id = (select auth.uid()))
  );
$$;
revoke execute on function private.conversation_has_both_parties(uuid) from public;
grant execute on function private.conversation_has_both_parties(uuid) to authenticated;

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id)
    and private.conversation_has_both_parties(conversation_id)
  );
