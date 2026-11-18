import { useContext } from "react";
import { SessionContext } from "./session-context";

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession doit être utilisé dans <SessionProvider>");
  return ctx;
}
