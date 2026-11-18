import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router";

/** Déplace le focus sur le h1 de `container` à chaque changement de route (lecteurs d'écran, clavier). */
export function useFocusHeadingOnNavigation(container: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const root = container.current;
    if (!root) return;

    const focusHeading = () => {
      const heading = root.querySelector("h1");
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      return true;
    };
    if (focusHeading()) return;

    // Le h1 peut apparaître après un état de chargement.
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    const timeout = setTimeout(() => observer.disconnect(), 3000);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [pathname, container]);
}
