import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { clearNextPath } from "@/lib/next-path";
import { clearDeleteIntent } from "@/lib/delete-intent";
import { supabase } from "@/lib/supabase";
import { SessionContext, type SessionState } from "./session-context";

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ session: null, loading: true });
  const lastUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    // INITIAL_SESSION est émis une fois la session restaurée ou le ?code= échangé (PKCE).
    // Le callback reste synchrone : pas d'appel Supabase ici (risque de blocage).
    const { data } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
      const userId = session?.user.id;
      if (event === "SIGNED_OUT") clearDeleteIntent();
      // Déconnexion, ou bascule de compte depuis un autre onglet : le cache appartenait à l'autre.
      const switched = !!lastUserId.current && !!userId && lastUserId.current !== userId;
      if (event === "SIGNED_OUT" || switched) {
        queryClient.clear();
        clearNextPath(); // la page demandée par une personne ne sert pas de destination à un autre compte
      }
      lastUserId.current = userId;
      setState({ session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext value={state}>{children}</SessionContext>;
}
