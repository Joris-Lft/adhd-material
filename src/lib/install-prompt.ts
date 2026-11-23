// Invitation à installer l'appli. `beforeinstallprompt` (Chrome/Android) peut arriver avant le montage
// de React : on l'écoute dès le chargement du module principal (`startInstallPromptCapture`).

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function onBeforeInstallPrompt(event: Event) {
  // Pas de mini-barre du navigateur : l'invitation est proposée à la demande, dans le profil.
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  notify();
}

function onAppInstalled() {
  deferred = null;
  notify();
}

export function startInstallPromptCapture() {
  if (started) return;
  started = true;
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
}

/** Remet le module à zéro (tests uniquement : l'événement mémorisé est un état de module). */
export function resetInstallPrompt() {
  window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.removeEventListener("appinstalled", onAppInstalled);
  started = false;
  deferred = null;
  listeners.clear();
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getInstallPromptEvent = () => deferred;

/** L'événement ne sert qu'une fois : après `prompt()`, il faut attendre un nouveau. */
export function consumeInstallPromptEvent() {
  deferred = null;
  notify();
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone, iPad (y compris iPadOS qui se présente comme un Mac tactile) : pas de beforeinstallprompt. */
export function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
