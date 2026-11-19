import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export const MIN_SEARCH_LENGTH = 2;

/** Recherche TanStack Query anti-rebond, inactive sous 2 caractères ; garde les résultats précédents pendant la frappe. */
export function useDebouncedSearch<T>(
  scope: string,
  input: string,
  search: (q: string) => Promise<T[]>,
  enabled = true,
) {
  const trimmed = input.trim();
  const debounced = useDebouncedValue(trimmed);
  const long = trimmed.length >= MIN_SEARCH_LENGTH;
  const query = useQuery({
    queryKey: [scope, "search", debounced],
    queryFn: () => search(debounced),
    enabled: enabled && debounced.length >= MIN_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  // Les résultats ne correspondent à la saisie que frappe stabilisée, requête terminée, hors données de transition.
  const settled = debounced === trimmed && !query.isFetching && !query.isPlaceholderData;
  return {
    results: long ? (query.data ?? []) : [],
    searching: enabled && long && !settled,
    isError: long && query.isError,
  };
}
