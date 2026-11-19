import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { CityPicker, type CityValue } from "@/features/cities/CityPicker";
import { useCity } from "@/hooks/useCity";
import { useUpdateCity } from "@/hooks/useUpdateCity";
import { CITY_SAVE_FAILED, GENERIC_ERROR } from "@/lib/messages";
import { CityError } from "@/services/profile";

interface CityFormProps {
  cityId: string | null;
}

/** Charge la ville enregistrée puis affiche le formulaire (même si le chargement échoue, pour pouvoir la retirer). */
export function CityForm({ cityId }: CityFormProps) {
  const { data: city, isPending, isError, refetch, isFetching } = useCity(cityId);

  if (cityId && isPending && !isError) {
    return <p className="text-sm text-muted-foreground">Chargement de ta ville…</p>;
  }
  const unavailable = !!cityId && !city;
  return (
    <CityFields
      saved={city ?? null}
      hasCity={!!cityId}
      notice={
        unavailable ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {isError ? GENERIC_ERROR : "Ta ville n'a pas été retrouvée."}
            </p>
            {isError && (
              <Button
                type="button"
                variant="outline"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                Réessayer
              </Button>
            )}
          </div>
        ) : null
      }
    />
  );
}

interface CityFieldsProps {
  saved: CityValue | null;
  hasCity: boolean;
  notice: React.ReactNode;
}

function CityFields({ saved, hasCity, notice }: CityFieldsProps) {
  const update = useUpdateCity();
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<CityValue | null>(saved);
  // La ville enregistrée change (sauvegarde, retrait, rechargement réussi) : le champ la suit, sans remontage.
  const [previousSavedId, setPreviousSavedId] = useState(saved?.id);
  if (saved?.id !== previousSavedId) {
    setPreviousSavedId(saved?.id);
    setValue(saved);
  }
  const [error, setError] = useState<string>();

  async function save(city: CityValue | null, successMessage: string) {
    setError(undefined);
    try {
      await update.mutateAsync(city);
      toast.success(successMessage);
    } catch (e) {
      setError(e instanceof CityError ? e.message : CITY_SAVE_FAILED);
    } finally {
      // Le bouton cliqué était désactivé pendant l'envoi : on rend le focus au champ.
      formRef.current?.querySelector("input")?.focus();
    }
  }

  const changed = !!value && value.id !== saved?.id;

  return (
    <form
      ref={formRef}
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (value && changed && !update.isPending) void save(value, "Ville enregistrée");
      }}
    >
      {notice}
      <CityPicker
        label="Ville"
        hint="Visible par toi seulement. Elle pré-remplit la ville de tes annonces."
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(undefined);
        }}
        error={error}
      />
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="submit"
          className="w-full sm:w-auto"
          loading={update.isPending && update.variables !== null}
          disabled={!changed || update.isPending}
        >
          Enregistrer
        </LoadingButton>
        {hasCity && (
          <LoadingButton
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            loading={update.isPending && update.variables === null}
            disabled={update.isPending}
            onClick={() => void save(null, "Ville retirée")}
          >
            Retirer ma ville
          </LoadingButton>
        )}
      </div>
    </form>
  );
}
