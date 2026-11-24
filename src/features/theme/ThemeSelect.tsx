import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemeChoice } from "./theme";
import { useTheme } from "./theme-context";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "auto", label: "Automatique" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

/** Choix de l'apparence : Automatique (suit l'appareil), Clair ou Sombre. */
export function ThemeSelect() {
  const { choice, setChoice } = useTheme();
  return (
    <fieldset className="space-y-2" aria-describedby="appearance-help">
      <legend className="text-sm leading-none font-medium">Apparence</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent/50",
              "has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary",
              "focus-ring-within",
            )}
          >
            <input
              type="radio"
              name="appearance"
              value={option.value}
              checked={choice === option.value}
              onChange={() => setChoice(option.value)}
              className="sr-only"
            />
            {choice === option.value && <Check className="size-4" aria-hidden="true" />}
            {option.label}
          </label>
        ))}
      </div>
      <p id="appearance-help" className="text-sm text-muted-foreground">
        Automatique suit le réglage de ton appareil.
      </p>
    </fieldset>
  );
}
