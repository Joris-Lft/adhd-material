import { useSyncExternalStore } from "react";
import {
  consumeInstallPromptEvent,
  getInstallPromptEvent,
  isIos,
  isStandalone,
  subscribeInstallPrompt,
} from "@/lib/install-prompt";

export type InstallMode = "native" | "ios" | "none";

/** Comment proposer l'installation : invite native (Chrome), instructions (iOS) ou rien (déjà installée). */
export function useInstallPrompt() {
  const event = useSyncExternalStore(subscribeInstallPrompt, getInstallPromptEvent);
  const mode: InstallMode = isStandalone() ? "none" : event ? "native" : isIos() ? "ios" : "none";

  /** Ouvre l'invite du navigateur ; renvoie le choix, ou null si l'invite n'a pas pu s'ouvrir. */
  async function install(): Promise<"accepted" | "dismissed" | null> {
    if (!event) return null;
    consumeInstallPromptEvent();
    try {
      await event.prompt();
      return (await event.userChoice).outcome;
    } catch {
      return null;
    }
  }

  return { mode, install };
}
