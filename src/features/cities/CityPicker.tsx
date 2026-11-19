import { Combobox } from "@/components/ui/combobox";
import { MIN_SEARCH_LENGTH, useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { useSyncedText } from "@/hooks/useSyncedText";
import { SEARCH_FAILED } from "@/lib/messages";
import { searchCities, type CitySummary } from "@/services/cities";
import { formatCity } from "./format-city";

export type CityValue = CitySummary;

interface CityPickerProps {
  value: CityValue | null;
  onChange: (value: CityValue | null) => void;
  onBlur?: () => void;
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
  name?: string;
}

/** Sélecteur de ville contrôlé (compatible `Controller`) ; toute frappe remet la valeur à null jusqu'à un nouveau choix. */
export function CityPicker({
  value,
  onChange,
  onBlur,
  label = "Ville",
  hint,
  error,
  id,
  name,
}: CityPickerProps) {
  const { text, setText, markTyped } = useSyncedText(value);
  const { results, searching, isError } = useDebouncedSearch("cities", text, searchCities, !value);

  return (
    <Combobox
      id={id}
      name={name}
      label={label}
      hint={hint}
      error={error}
      fetchError={isError ? SEARCH_FAILED : undefined}
      placeholder="Nom de ville ou code postal"
      maxLength={100}
      minChars={MIN_SEARCH_LENGTH}
      suggestionsEnabled={!value}
      options={results.map((city) => ({ key: city.id, label: formatCity(city), city }))}
      inputValue={text}
      loading={searching}
      onInputChange={(next) => {
        setText(next);
        if (value) {
          markTyped();
          onChange(null);
        }
      }}
      onSelectOption={({ city }) => {
        setText(city.name);
        onChange({ id: city.id, name: city.name, postal_codes: city.postal_codes });
      }}
      onBlur={onBlur}
    />
  );
}
