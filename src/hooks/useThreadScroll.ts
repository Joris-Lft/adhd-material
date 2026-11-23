import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Message } from "@/services/conversations";

/** Marge sous laquelle on considère être « en bas » (zone de saisie collante comprise). */
const BOTTOM_THRESHOLD_PX = 160;

function isAtBottom() {
  return (
    window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - BOTTOM_THRESHOLD_PX
  );
}

function scrollToBottom() {
  window.scrollTo({ top: document.documentElement.scrollHeight });
}

/**
 * Défilement du fil (la page défile, pas un conteneur) :
 * - au premier affichage, et à l'envoi d'un message, on descend ;
 * - à l'arrivée d'un message de l'autre : on reste en bas si on y était, sinon `hasNewBelow` ;
 * - le chargement de messages plus anciens garde la position de lecture ;
 * - `announcement` contient le texte des messages reçus, pour une zone aria-live.
 */
export function useThreadScroll(messages: Message[] | null, myId: string, otherName: string) {
  const loaded = messages !== null;
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const atBottom = useRef(true);
  const newestId = useRef<string | null | undefined>(undefined);
  // Messages déjà annoncés : une relecture ne doit jamais les annoncer deux fois.
  const announced = useRef(new Set<string>());
  const heightBeforeOlder = useRef<number | null>(null);
  const oldestId = messages?.[0]?.id ?? null;
  const lastId = messages?.[messages.length - 1]?.id ?? null;

  useEffect(() => {
    const onScroll = () => {
      atBottom.current = isAtBottom();
      if (atBottom.current) setHasNewBelow(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Nouveaux messages en bas du fil.
  useLayoutEffect(() => {
    if (!messages) return;
    const previous = newestId.current;
    newestId.current = lastId;
    if (previous === undefined) {
      scrollToBottom();
      atBottom.current = true;
      return;
    }
    if (previous === lastId || lastId === null) return;
    // Fil vide jusque-là (previous null) : tout est nouveau. Sinon on repart du dernier message connu.
    const previousIndex =
      previous === null ? -1 : messages.findIndex((message) => message.id === previous);
    if (previous !== null && previousIndex === -1) return;
    const added = messages.slice(previousIndex + 1);
    const incoming = added.filter(
      (message) => message.senderId !== myId && !announced.current.has(message.id),
    );
    incoming.forEach((message) => announced.current.add(message.id));
    if (incoming.length > 0) {
      setAnnouncement(incoming.map((message) => `${otherName} : ${message.body}`).join(". "));
    }
    if (added.some((message) => message.senderId === myId) || atBottom.current) {
      scrollToBottom();
      atBottom.current = true;
    } else if (incoming.length > 0) {
      setHasNewBelow(true);
    }
    // Seul le dernier message déclenche : `messages` change aussi au chargement des anciens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, lastId]);

  // Messages plus anciens ajoutés en haut : la page ne doit pas « sauter ».
  useLayoutEffect(() => {
    if (heightBeforeOlder.current === null) return;
    const delta = document.documentElement.scrollHeight - heightBeforeOlder.current;
    heightBeforeOlder.current = null;
    if (delta > 0) window.scrollBy(0, delta);
  }, [oldestId]);

  const prepareOlder = useCallback(() => {
    heightBeforeOlder.current = document.documentElement.scrollHeight;
  }, []);
  const jumpToBottom = useCallback(() => {
    scrollToBottom();
    atBottom.current = true;
    setHasNewBelow(false);
  }, []);

  return { hasNewBelow, announcement, prepareOlder, jumpToBottom };
}
