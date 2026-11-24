import { Check } from "lucide-react";
import { ActivityPicker } from "@/features/activities/ActivityPicker";
import { CityPicker, type CityValue } from "@/features/cities/CityPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RADIUS_OPTIONS, radiusLabel } from "@/lib/listing-filters";
import { cn } from "@/lib/utils";
import type { ActivityValue } from "@/services/activities";
import type { ListingKind } from "@/services/listings";

const KIND_OPTIONS: { value: ListingKind | null; label: string }[] = [
  { value: null, label: "Tout" },
  { value: "don", label: "Don" },
  { value: "pret", label: "Prêt" },
];

interface ListingFiltersProps {
  city: CityValue | null;
  /** La distance n'a de sens que si une ville est active. */
  showRadius: boolean;
  onCityChange: (city: CityValue | null) => void;
  /** « Toute la France » : annonces récentes, même avec une ville de profil. */
  onAllFrance: () => void;
  radius: number;
  onRadiusChange: (radius: number) => void;
  activity: ActivityValue;
  onActivityChange: (activity: ActivityValue) => void;
  onActivityClear: () => void;
  kind: ListingKind | null;
  onKindChange: (kind: ListingKind | null) => void;
}

/** Filtres de la liste : ville (et distance), activité, don ou prêt. L'état vit dans l'URL (cf. HomePage). */
export function ListingFilters({
  city,
  showRadius,
  onCityChange,
  onAllFrance,
  radius,
  onRadiusChange,
  activity,
  onActivityChange,
  onActivityClear,
  kind,
  onKindChange,
}: ListingFiltersProps) {
  return (
    <form
      role="search"
      aria-label="Filtrer les annonces"
      className="space-y-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CityPicker id="filter-city" label="Ville" value={city} onChange={onCityChange} />
          {showRadius && (
            <Button type="button" variant="link" size="sm" className="-ml-3" onClick={onAllFrance}>
              Voir toute la France
            </Button>
          )}
        </div>
        {showRadius && (
          <div className="space-y-2">
            <Label htmlFor="filter-radius">Distance</Label>
            <select
              id="filter-radius"
              value={radius}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs focus-ring md:text-sm"
            >
              {RADIUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {radiusLabel(option)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <ActivityPicker
        id="filter-activity"
        label="Activité"
        allowCreate={false}
        value={activity}
        onChange={onActivityChange}
        onClear={onActivityClear}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm leading-none font-medium">Type</legend>
        <div className="grid grid-cols-3 gap-2">
          {KIND_OPTIONS.map((option) => (
            <label
              key={option.label}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent/50",
                "has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary",
                "focus-ring-within",
              )}
            >
              <input
                type="radio"
                name="filter-kind"
                value={option.value ?? "tout"}
                checked={kind === option.value}
                onChange={() => onKindChange(option.value)}
                className="sr-only"
              />
              {kind === option.value && <Check className="size-4" aria-hidden="true" />}
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
