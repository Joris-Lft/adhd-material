-- public.rls_auto_enable() n'existe que sur le cloud (option « automatic RLS » de Supabase) : c'est un
-- event trigger SECURITY DEFINER qui n'a pas à être appelable via l'API. On retire EXECUTE à public,
-- anon et authenticated ; l'event trigger continue de fonctionner (il s'exécute avec les droits de
-- son propriétaire). No-op en local, où la fonction n'existe pas.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
