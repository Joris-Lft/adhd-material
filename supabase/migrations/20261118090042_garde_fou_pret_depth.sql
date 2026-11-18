-- Garde-fou statut/prêt : le signal app.loan_sync n'est plus suffisant à lui seul. Il faut aussi que
-- le UPDATE listings soit exécuté depuis un trigger (pg_trigger_depth() > 1), ce qui interdit à un
-- rôle authenticated qui ferait set_config('app.loan_sync', 'on', true) en SQL direct de contourner
-- la règle. Les triggers qui posent le signal restaurent désormais la valeur précédente (et non
-- « off » inconditionnellement), pour rester corrects s'ils sont imbriqués.

create or replace function private.listings_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.loan_sync', true), 'off') = 'on' and pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'pretee' or old.status = 'pretee' then
      raise exception 'Le statut « prêtée » est géré par l''enregistrement du prêt et de son retour'
        using errcode = '23514';
    end if;
    if new.status in ('disponible', 'reservee')
       and exists (select 1 from public.loans where listing_id = old.id and returned_at is null) then
      raise exception 'Un prêt est en cours sur cette annonce' using errcode = '23514';
    end if;
  end if;
  if new.kind is distinct from old.kind and exists (select 1 from public.loans where listing_id = old.id) then
    raise exception 'Le type d''une annonce ayant eu un prêt ne peut plus changer' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.loans_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_prev text := coalesce(nullif(current_setting('app.loan_sync', true), ''), 'off');
begin
  if tg_op = 'INSERT' then
    select * into v_listing from public.listings
      where id = new.listing_id and owner_id = (select auth.uid()) for update;
    if not found then
      raise exception 'Annonce introuvable ou non autorisée' using errcode = '42501';
    end if;
    if v_listing.kind <> 'pret' then
      raise exception 'Seule une annonce de type prêt peut avoir un prêt' using errcode = '23514';
    end if;
    if v_listing.status not in ('disponible', 'reservee') then
      raise exception 'Cette annonce n''est pas prêtable dans son état actuel' using errcode = '23514';
    end if;
    if new.borrower_id is null or not exists (
      select 1 from public.conversations c
      where c.listing_id = new.listing_id and c.requester_id = new.borrower_id
    ) then
      raise exception 'Aucune conversation avec cet utilisateur sur cette annonce' using errcode = '23514';
    end if;
    new.returned_at := null;
    perform set_config('app.loan_sync', 'on', true);
    update public.listings set status = 'pretee' where id = new.listing_id;
    perform set_config('app.loan_sync', v_prev, true);
  else
    if new.listing_id <> old.listing_id
       or (new.borrower_id is distinct from old.borrower_id and new.borrower_id is not null) then
      raise exception 'listing_id et borrower_id sont immuables' using errcode = '23514';
    end if;
    -- returned_at est posé par le serveur (une seule fois), jamais par le client
    if old.returned_at is not null then
      new.returned_at := old.returned_at;
    elsif new.returned_at is not null then
      new.returned_at := now();
      perform set_config('app.loan_sync', 'on', true);
      update public.listings set status = 'disponible' where id = new.listing_id and status = 'pretee';
      perform set_config('app.loan_sync', v_prev, true);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.loans_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := coalesce(nullif(current_setting('app.loan_sync', true), ''), 'off');
begin
  if old.returned_at is null then
    perform set_config('app.loan_sync', 'on', true);
    update public.listings set status = 'disponible' where id = old.listing_id and status = 'pretee';
    perform set_config('app.loan_sync', v_prev, true);
  end if;
  return old;
end;
$$;

create or replace function private.profiles_purge_listings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := coalesce(nullif(current_setting('app.loan_sync', true), ''), 'off');
begin
  update public.loans set returned_at = now()
  where returned_at is null
    and listing_id in (select id from public.listings where owner_id = old.id);

  perform set_config('app.loan_sync', 'on', true);
  update public.listings set description = null, experience = null, status = 'archivee'
  where owner_id = old.id;
  perform set_config('app.loan_sync', v_prev, true);

  delete from public.listing_photos
  where listing_id in (select id from public.listings where owner_id = old.id);
  return old;
end;
$$;
