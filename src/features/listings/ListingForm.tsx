import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { Controller, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ActivityPicker } from "@/features/activities/ActivityPicker";
import { CityPicker } from "@/features/cities/CityPicker";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { Textarea } from "@/components/ui/textarea";
import { useCity } from "@/hooks/useCity";
import { useCreateListing } from "@/hooks/useCreateListing";
import { useMyProfile } from "@/hooks/useMyProfile";
import { GENERIC_ERROR } from "@/lib/messages";
import { ListingError } from "@/services/listings";
import { KindField } from "./KindField";
import { LISTING_TEXT_LIMIT, listingSchema, type ListingFormValues } from "./listing-schema";
import { PhotoField } from "./PhotoField";

type FocusableField = "activity" | "kind" | "photos" | "city" | "description";
// Ordre d'affichage : le focus va sur le premier champ en erreur.
const FOCUS_ORDER: FocusableField[] = ["activity", "kind", "photos", "city", "description"];
const FOCUS_IDS: Record<FocusableField, string> = {
  activity: "listing-activity",
  kind: "listing-kind-don",
  photos: "listing-photos",
  city: "listing-city",
  description: "listing-description",
};

const focusField = (field: FocusableField) => document.getElementById(FOCUS_IDS[field])?.focus();

interface ListingFormProps {
  onPublished: (listingId: string) => void;
}

export function ListingForm({ onPublished }: ListingFormProps) {
  const { data: profile } = useMyProfile();
  const { data: profileCity } = useCity(profile?.city_id ?? null);
  const create = useCreateListing();
  const {
    control,
    register,
    handleSubmit,
    setError,
    getValues,
    setValue,
    resetField,
    formState: { errors, isDirty },
  } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      activity: null,
      kind: null,
      photos: [],
      city: null,
      description: "",
      experience: "",
    },
    // Les pickers n'exposent pas de ref : le focus est géré par onInvalid.
    shouldFocusError: false,
  });
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const submitting = useRef(false);
  // Vrai dès que l'utilisateur a touché au champ ville : le pré-remplissage ne l'écrase plus.
  const cityTouched = useRef(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);

  // Ville du profil : pré-remplie une fois chargée, sans écraser un choix déjà fait.
  useEffect(() => {
    if (profileCity && !cityTouched.current && getValues("city") === null) {
      resetField("city", { defaultValue: profileCity });
    }
  }, [profileCity, getValues, resetField]);

  useEffect(() => {
    if (globalError) alertRef.current?.focus();
  }, [globalError]);

  const publishing = create.isPending;
  const guarded = isDirty || publishing;
  // Navigation vers une autre route seulement (pas vers la même).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      guarded && currentLocation.pathname !== nextLocation.pathname,
  );
  // Rechargement ou fermeture de l'onglet avec une saisie en cours.
  useEffect(() => {
    if (!guarded) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guarded]);

  const city = useWatch({ control, name: "city" });
  const description = useWatch({ control, name: "description" });
  const experience = useWatch({ control, name: "experience" });
  const onBusyChange = useCallback((busy: boolean) => setPreparingPhotos(busy), []);

  function onInvalid(fieldErrors: FieldErrors<ListingFormValues>) {
    if (fieldErrors.description || fieldErrors.experience) setDetailsOpen(true);
    const first = FOCUS_ORDER.find((field) =>
      field === "description"
        ? fieldErrors.description || fieldErrors.experience
        : fieldErrors[field],
    );
    // Le détail s'ouvre au rendu suivant : on attend avant de focaliser un champ qu'il contient.
    if (first) setTimeout(() => focusField(first), 0);
  }

  async function publish(values: ListingFormValues) {
    if (submitting.current) return;
    if (!values.activity || !values.kind || !values.city) return;
    submitting.current = true;
    setGlobalError(null);
    try {
      const id = await create.mutateAsync({
        activity: values.activity,
        kind: values.kind,
        cityId: values.city.id,
        photos: values.photos.map((photo) => photo.file),
        description: values.description,
        experience: values.experience,
        // Un réessai réutilise l'activité créée : pas de nouvel INSERT.
        onActivityResolved: ({ id, name }) => setValue("activity", { kind: "existing", id, name }),
      });
      onPublished(id);
    } catch (error) {
      const failure = error instanceof ListingError ? error : new ListingError(GENERIC_ERROR);
      if (!failure.field) {
        setGlobalError(failure.message);
        return;
      }
      const field = failure.field === "details" ? "description" : failure.field;
      if (field === "description") setDetailsOpen(true);
      setError(field, { message: failure.message });
      setTimeout(() => focusField(field), 0);
    } finally {
      submitting.current = false;
    }
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) =>
    handleSubmit(publish, onInvalid)(event);

  let submitLabel = "Publier l'annonce";
  if (create.step === "upload") submitLabel = "Envoi des photos…";
  else if (create.step === "publish") submitLabel = "Publication…";
  else if (preparingPhotos) submitLabel = "Préparation des photos…";
  const busy = create.isPending || preparingPhotos;

  const cityHint =
    profileCity && city?.id === profileCity.id
      ? "C'est la ville de ton profil. Tu peux la changer pour cette annonce."
      : "Là où se trouve le matériel.";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <Controller
        control={control}
        name="activity"
        render={({ field }) => (
          <ActivityPicker
            id={FOCUS_IDS.activity}
            label="Activité"
            hint="Crochet, jeux de société… Tu peux en proposer une nouvelle."
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={errors.activity?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <KindField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={errors.kind?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="photos"
        render={({ field }) => (
          <PhotoField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            onBusyChange={onBusyChange}
            error={errors.photos?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field }) => (
          <div onInputCapture={() => (cityTouched.current = true)}>
            <CityPicker
              id={FOCUS_IDS.city}
              label="Ville"
              hint={cityHint}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.city?.message}
            />
          </div>
        )}
      />

      <details
        className="rounded-md border"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">
          Ajouter des détails (facultatif)
        </summary>
        <div className="space-y-6 px-4 pt-2 pb-4">
          <div className="space-y-2">
            <Label htmlFor={FOCUS_IDS.description}>Description</Label>
            <Textarea
              id={FOCUS_IDS.description}
              maxLength={LISTING_TEXT_LIMIT}
              placeholder="État, contenu du kit…"
              aria-invalid={errors.description ? true : undefined}
              aria-describedby="listing-description-count"
              {...register("description")}
            />
            <p id="listing-description-count" className="text-right text-xs text-muted-foreground">
              {description.length} / {LISTING_TEXT_LIMIT}
            </p>
            {errors.description && (
              <p role="alert" className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="listing-experience">Ton expérience</Label>
            <Textarea
              id="listing-experience"
              maxLength={LISTING_TEXT_LIMIT}
              placeholder="Pourquoi tu as arrêté, ce qui était difficile, le budget…"
              aria-invalid={errors.experience ? true : undefined}
              aria-describedby="listing-experience-count"
              {...register("experience")}
            />
            <p id="listing-experience-count" className="text-right text-xs text-muted-foreground">
              {experience.length} / {LISTING_TEXT_LIMIT}
            </p>
            {errors.experience && (
              <p role="alert" className="text-sm text-destructive">
                {errors.experience.message}
              </p>
            )}
          </div>
        </div>
      </details>

      {globalError && (
        // Annoncé par le focus programmatique (pas de role="alert" en plus : double annonce).
        <p
          ref={alertRef}
          tabIndex={-1}
          className="rounded-md border border-destructive p-3 text-sm text-destructive outline-none"
        >
          {globalError}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? submitLabel : ""}
      </p>
      <LoadingButton
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        loading={busy}
        disabled={busy}
      >
        {submitLabel}
      </LoadingButton>

      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.state === "blocked" && blocker.reset()}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {publishing ? "Publication en cours…" : "Quitter sans publier ?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {publishing
              ? "Ton annonce est en train d'être publiée. Reste sur la page le temps que ce soit terminé."
              : "Ton annonce n'est pas publiée. Si tu quittes cette page, ce que tu as saisi sera perdu."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Rester sur la page</AlertDialogCancel>
            {!publishing && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => blocker.state === "blocked" && blocker.proceed()}
              >
                Quitter la page
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
