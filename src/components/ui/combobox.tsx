import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  key: string;
  label: string;
  /** Option d'action (ex. « Créer ») : non comptée dans « N résultats ». */
  action?: boolean;
}

interface ComboboxProps<T extends ComboboxOption> {
  label: string;
  hint?: string;
  /** Erreur de validation du champ. */
  error?: string;
  /** Erreur de chargement des suggestions. */
  fetchError?: string;
  options: T[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSelectOption: (option: T) => void;
  loading?: boolean;
  /** Nombre de caractères avant d'afficher des suggestions. */
  minChars?: number;
  /** Mettre à false pour ne pas ouvrir la liste (ex. valeur déjà choisie). */
  suggestionsEnabled?: boolean;
  emptyText?: string;
  /** Contenu affiché au-dessus de la liste (ex. « Tu voulais dire… »). */
  header?: React.ReactNode;
  id?: string;
  name?: string;
  placeholder?: string;
  maxLength?: number;
  onBlur?: () => void;
}

/** Combobox WAI-ARIA 1.2 (saisie + listbox) ; ne connaît ni les données ni leur source. */
export function Combobox<T extends ComboboxOption>({
  label,
  hint,
  error,
  fetchError,
  options,
  inputValue,
  onInputChange,
  onSelectOption,
  loading = false,
  minChars = 2,
  suggestionsEnabled = true,
  emptyText = "Aucun résultat",
  header,
  id,
  name,
  placeholder,
  maxLength,
  onBlur,
}: ComboboxProps<T>) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const listboxId = `${inputId}-listbox`;
  const optionId = (index: number) => `${inputId}-option-${index}`;

  const [open, setOpen] = React.useState(false);
  // L'option active est suivie par sa clé : la liste peut changer sans frappe (réponse réseau).
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const long = inputValue.trim().length >= minChars;
  const showPanel = open && long && suggestionsEnabled;
  const expanded = showPanel && options.length > 0;
  const active = expanded ? options.findIndex((option) => option.key === activeKey) : -1;
  // L'option active a disparu de la liste : on l'oublie (sinon elle réapparaîtrait avec la même clé).
  if (expanded && activeKey !== null && active < 0) setActiveKey(null);
  const resultCount = options.filter((option) => !option.action).length;

  React.useEffect(() => {
    if (active < 0) return;
    const element = listRef.current?.children[active];
    if (element instanceof HTMLElement && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  let status: string | null = null;
  if (fetchError) status = fetchError;
  else if (loading) status = "Recherche en cours…";
  else if (resultCount === 0) status = emptyText;

  let announcement = "";
  if (showPanel) {
    if (fetchError) announcement = fetchError;
    else if (loading) announcement = "";
    else if (resultCount === 0) announcement = emptyText;
    else announcement = `${resultCount} ${resultCount > 1 ? "résultats" : "résultat"}`;
  }

  function select(option: T) {
    onSelectOption(option);
    setOpen(false);
    setActiveKey(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = options.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!long) return;
        setOpen(true);
        if (count === 0) return;
        const down = event.key === "ArrowDown";
        const next = down ? (active + 1) % count : active <= 0 ? count - 1 : active - 1;
        setActiveKey(options[next]?.key ?? null);
        return;
      }
      case "Enter": {
        const option = options[active];
        if (expanded && option) {
          event.preventDefault();
          select(option);
        } else if (suggestionsEnabled && inputValue.trim()) {
          // Texte saisi sans choix : Entrée ne doit pas soumettre le formulaire.
          event.preventDefault();
        }
        return;
      }
      case "Escape":
        if (showPanel) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActiveKey(null);
        }
        return;
    }
  }

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listboxId : undefined}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          value={inputValue}
          onChange={(event) => {
            onInputChange(event.target.value);
            setOpen(true);
            setActiveKey(null);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setActiveKey(null);
            onBlur?.();
          }}
        />
        {showPanel && (
          // mouseDown bloqué : le champ garde le focus pendant le clic sur une suggestion.
          <div
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
            onMouseDown={(event) => event.preventDefault()}
          >
            {header}
            {options.length > 0 && (
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={label}
                className="max-h-64 overflow-y-auto py-1"
              >
                {options.map((option, index) => (
                  <li
                    key={option.key}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center px-3 py-2 text-base md:text-sm",
                      index === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                    )}
                    onClick={() => select(option)}
                  >
                    {option.label}
                  </li>
                ))}
              </ul>
            )}
            {status && (
              <p
                aria-hidden="true"
                className={cn(
                  "px-3 py-3 text-sm",
                  fetchError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {status}
              </p>
            )}
          </div>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
