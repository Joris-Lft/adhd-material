import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { MIN_SEARCH_LENGTH, useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { useSyncedText } from "@/hooks/useSyncedText";
import {
  ACTIVITY_NAME_MAX,
  cleanActivityName,
  isCreatableActivityName,
  normalizeActivityName,
} from "@/lib/activity-name";
import { SEARCH_FAILED } from "@/lib/messages";
import { searchActivities, type ActivityValue } from "@/services/activities";

interface ActivityPickerProps {
  value: ActivityValue;
  onChange: (value: ActivityValue) => void;
  onBlur?: () => void;
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
  name?: string;
}

type ActivityOption = ComboboxOption & { value: NonNullable<ActivityValue> };

/** Choix d'une activité existante ou proposition d'une nouvelle (créée seulement à la publication). */
export function ActivityPicker({
  value,
  onChange,
  onBlur,
  label = "Activité",
  hint,
  error,
  id,
  name,
}: ActivityPickerProps) {
  const { text, setText, markTyped } = useSyncedText(value);
  const cleaned = cleanActivityName(text);
  const { results, searching, isError } = useDebouncedSearch(
    "activities",
    cleaned,
    searchActivities,
    !value,
  );

  const options: ActivityOption[] = results.map((activity) => ({
    key: activity.id,
    label: activity.name,
    value: { kind: "existing", id: activity.id, name: activity.name },
  }));
  // « Créer » et « Tu voulais dire » ne valent que si les résultats correspondent à la saisie (ni en cours, ni en erreur).
  const canSuggest = !searching && !isError && !!cleaned;
  const normalized = normalizeActivityName(cleaned);
  const hasExactMatch = results.some(
    (activity) => normalizeActivityName(activity.name) === normalized,
  );
  const creatable = canSuggest && isCreatableActivityName(cleaned) && !hasExactMatch;
  const firstSuggestion = options[0];
  const didYouMean = creatable && firstSuggestion ? firstSuggestion : null;
  if (creatable) {
    options.push({
      key: "create",
      label: `Créer « ${cleaned} »`,
      action: true,
      value: { kind: "new", name: cleaned },
    });
  }

  function choose(option: ActivityOption) {
    setText(option.value.name);
    onChange(option.value);
  }

  return (
    <Combobox
      id={id}
      name={name}
      label={label}
      hint={hint}
      error={error}
      fetchError={isError ? SEARCH_FAILED : undefined}
      placeholder="Crochet, jeux de société…"
      maxLength={ACTIVITY_NAME_MAX}
      minChars={MIN_SEARCH_LENGTH}
      suggestionsEnabled={!value}
      options={options}
      inputValue={text}
      loading={searching}
      header={
        didYouMean && (
          <button
            type="button"
            tabIndex={-1}
            className="flex min-h-11 w-full items-center border-b px-3 py-2 text-left text-sm hover:bg-accent/50"
            onClick={() => choose(didYouMean)}
          >
            <span>
              Tu voulais dire <strong>{didYouMean.label}</strong> ?
            </span>
          </button>
        )
      }
      onInputChange={(next) => {
        setText(next);
        if (value) {
          markTyped();
          onChange(null);
        }
      }}
      onSelectOption={choose}
      onBlur={onBlur}
    />
  );
}
