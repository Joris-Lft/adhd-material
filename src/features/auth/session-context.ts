import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";

export interface SessionState {
  session: Session | null;
  /** Vrai tant que Supabase n'a pas restauré (ou échangé) la session initiale. */
  loading: boolean;
}

export const SessionContext = createContext<SessionState | null>(null);
