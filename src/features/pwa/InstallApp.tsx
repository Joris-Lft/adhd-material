import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

type Outcome = "accepted" | "dismissed" | "failed";

const OUTCOME_MESSAGES: Record<Outcome, string> = {
  accepted: "C'est installé : tu la retrouveras parmi tes applications.",
  dismissed: "Pas de souci. Tu pourras l'installer plus tard depuis le menu de ton navigateur.",
  failed: "L'installation n'a pas pu démarrer. Essaie depuis le menu de ton navigateur.",
};

/** « Installer l'appli » : invite native (Chrome) ou instructions à la demande (iOS). Rien si déjà installée. */
export function InstallApp() {
  const { mode, install } = useInstallPrompt();
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const note = useRef<HTMLParagraphElement>(null);

  // Le bouton disparaît une fois l'invite ouverte : le focus va au message qui suit.
  useEffect(() => {
    if (outcome) note.current?.focus();
  }, [outcome]);

  if (outcome) {
    return (
      <p ref={note} role="status" tabIndex={-1} className="text-sm outline-none">
        {OUTCOME_MESSAGES[outcome]}
      </p>
    );
  }
  if (mode === "none") return null;

  if (mode === "native") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={async () => setOutcome((await install()) ?? "failed")}
      >
        <Download aria-hidden="true" />
        Installer l'appli
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        aria-expanded={showIosHelp}
        aria-controls="install-ios-help"
        onClick={() => setShowIosHelp((shown) => !shown)}
      >
        <Download aria-hidden="true" />
        Installer l'appli
      </Button>
      {showIosHelp && (
        <ol id="install-ios-help" className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            Touche le bouton Partager de ton navigateur (le carré avec une flèche vers le haut). Si
            tu ne le vois pas, ouvre la page dans Safari.
          </li>
          <li>Choisis « Sur l'écran d'accueil ».</li>
          <li>Touche « Ajouter » : l'appli apparaît sur ton écran d'accueil.</li>
        </ol>
      )}
    </div>
  );
}
