import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListingKind } from "@/services/listings";

const OPTIONS: { value: ListingKind; title: string; description: string }[] = [
  { value: "don", title: "Don", description: "Tu donnes, c'est définitif" },
  { value: "pret", title: "Prêt", description: "On te le rend" },
];

interface KindFieldProps {
  value: ListingKind | null;
  onChange: (value: ListingKind) => void;
  onBlur?: () => void;
  error?: string;
}

/** Deux gros boutons radio natifs (navigation aux flèches, lecteurs d'écran). */
export function KindField({ value, onChange, onBlur, error }: KindFieldProps) {
  const errorId = "listing-kind-error";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm leading-none font-medium">Don ou prêt ?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-16 cursor-pointer flex-col justify-center gap-1 rounded-md border border-input p-4 transition-colors hover:bg-accent/50",
              "has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary",
              "focus-ring-within",
              error && "border-destructive",
            )}
          >
            <input
              type="radio"
              id={`listing-kind-${option.value}`}
              name="listing-kind"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              onBlur={onBlur}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="sr-only"
            />
            <span className="flex items-center gap-2 text-base font-semibold">
              {value === option.value && <Check className="size-4" aria-hidden="true" />}
              {option.title}
            </span>
            <span className="text-sm text-muted-foreground">{option.description}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
