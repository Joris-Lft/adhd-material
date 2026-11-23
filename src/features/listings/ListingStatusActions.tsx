import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { useTakeActionFocus, useUpdateListingStatus } from "@/hooks/useUpdateListingStatus";
import { GENERIC_ERROR } from "@/lib/messages";
import { formatRelativeDate } from "@/lib/relative-date";
import { ListingStatusError, type ListingKind, type ListingStatus } from "@/services/listings";

interface Action {
  label: string;
  target: ListingStatus;
  success: string;
  confirm?: { title: string; description: string; confirmLabel: string };
}

const MARK_RESERVED: Action = {
  label: "Marquer réservée",
  target: "reservee",
  success: "Annonce marquée comme réservée",
};
const MARK_AVAILABLE: Action = {
  label: "Remettre disponible",
  target: "disponible",
  success: "Annonce de nouveau disponible",
};
const MARK_GIVEN: Action = {
  label: "Marquer donnée",
  target: "donnee",
  success: "Annonce marquée comme donnée",
  confirm: {
    title: "Marquer cette annonce comme donnée ?",
    description:
      "Elle ne sera plus proposée dans la liste et s'affichera comme « Déjà donnée ». Si le don n'a finalement pas lieu, tu pourras la remettre disponible.",
    confirmLabel: "Oui, c'est donné",
  },
};
const ARCHIVE: Action = {
  label: "Archiver",
  target: "archivee",
  success: "Annonce archivée",
  confirm: {
    title: "Archiver cette annonce ?",
    description:
      "Elle ne sera plus visible par les autres. Tu pourras la republier quand tu veux depuis Mes annonces.",
    confirmLabel: "Oui, archiver",
  },
};
const REPUBLISH: Action = {
  label: "Republier",
  target: "disponible",
  success: "Annonce republiée",
};

function actionsFor(status: ListingStatus, kind: ListingKind): Action[] {
  const give = kind === "don" ? [MARK_GIVEN] : [];
  switch (status) {
    case "disponible":
      return [MARK_RESERVED, ...give, ARCHIVE];
    case "reservee":
      return [MARK_AVAILABLE, ...give, ARCHIVE];
    case "donnee":
      return [MARK_AVAILABLE, ARCHIVE];
    case "archivee":
      return [REPUBLISH];
    case "pretee":
      return [];
  }
}

interface ListingStatusActionsProps {
  listing: {
    id: string;
    kind: ListingKind;
    status: ListingStatus;
    activityName: string;
    cityName: string;
    createdAt: string;
  };
}

/** Actions de statut d'une annonce dont on est propriétaire (fiche et « Mes annonces »). */
export function ListingStatusActions({ listing }: ListingStatusActionsProps) {
  const { id, kind, status, activityName, cityName, createdAt } = listing;
  // Distingue deux annonces de même activité pour les lecteurs d'écran.
  const where = `${activityName}, ${cityName}, ${formatRelativeDate(createdAt)}`;
  const update = useUpdateListingStatus();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const container = useRef<HTMLDivElement>(null);
  // Bouton qui a ouvert la confirmation : il récupère le focus si on annule.
  const opener = useRef<HTMLElement | null>(null);
  const takeActionFocus = useTakeActionFocus();
  const actions = actionsFor(status, kind);

  // Après l'action, les boutons changent (voire la carte change de section) : le focus va au premier bouton.
  // Pas pendant la mutation : les boutons sont alors désactivés et ne peuvent pas recevoir le focus.
  const pending = update.isPending;
  useEffect(() => {
    if (!pending && takeActionFocus(id, status))
      container.current?.querySelector("button")?.focus();
  }, [id, status, pending, takeActionFocus]);

  // Échec : le bouton était désactivé pendant l'envoi (le focus est tombé sur body), on le lui rend.
  const failed = update.isError;
  useEffect(() => {
    if (failed) opener.current?.focus();
  }, [failed]);

  function run(action: Action) {
    update.mutate(
      { id, from: status, status: action.target, successMessage: action.success },
      { onSettled: () => setConfirming(null) },
    );
  }

  if (status === "pretee") {
    return (
      <p className="text-sm text-muted-foreground">
        Le prêt se gère depuis la conversation (bientôt).
      </p>
    );
  }

  return (
    <div ref={container} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.map((action) => (
          <LoadingButton
            key={action.label}
            type="button"
            variant="outline"
            aria-label={`${action.label} : ${where}`}
            loading={update.isPending && update.variables?.status === action.target && !confirming}
            disabled={update.isPending}
            onClick={(event) => {
              opener.current = event.currentTarget;
              if (!action.confirm) return run(action);
              setConfirming(action);
            }}
          >
            {action.label}
          </LoadingButton>
        ))}
      </div>
      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          {update.error instanceof ListingStatusError ? update.error.message : GENERIC_ERROR}
        </p>
      )}
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !update.isPending) setConfirming(null);
        }}
      >
        {confirming?.confirm && (
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              // Succès : le focus est géré par l'effet ci-dessus (les boutons ont changé).
              event.preventDefault();
              if (!update.isSuccess) opener.current?.focus();
            }}
          >
            <AlertDialogTitle>{confirming.confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirming.confirm.description}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={update.isPending}>Annuler</AlertDialogCancel>
              <LoadingButton
                type="button"
                loading={update.isPending}
                onClick={() => run(confirming)}
              >
                {confirming.confirm.confirmLabel}
              </LoadingButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
