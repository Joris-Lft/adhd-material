import { useEffect, useRef, useState } from "react";
import { HandHelping } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { useReturnLoan, useStartLoan } from "@/hooks/useLoanActions";
import { GENERIC_ERROR, LOAN_DUE_DATE_INVALID } from "@/lib/messages";
import { MessagingError, type Conversation } from "@/services/conversations";
import { DELETED_MEMBER, endOfLocalDayIso, formatDay, todayInputValue } from "./format";

export const LOAN_ELSEWHERE = "Ce matériel est prêté à quelqu'un d'autre pour le moment.";
export const LOAN_ELSEWHERE_OWNER = "Déjà prêté à quelqu'un d'autre.";

function loanDates(conversation: Conversation) {
  const since = conversation.loanStartedAt
    ? ` depuis le ${formatDay(conversation.loanStartedAt)}`
    : "";
  const due = conversation.loanDueAt
    ? ` (retour prévu le ${formatDay(conversation.loanDueAt)})`
    : "";
  return { since, due };
}

function errorText(error: unknown) {
  return error instanceof MessagingError ? error.message : GENERIC_ERROR;
}

/** Prêt lié à la conversation : l'auteur d'une annonce de prêt l'enregistre, le demandeur en voit l'état. */
export function LoanPanel({ conversation }: { conversation: Conversation }) {
  if (conversation.listingKind !== "pret") return null;
  return conversation.role === "owner" ? (
    <OwnerLoan conversation={conversation} />
  ) : (
    <RequesterLoan conversation={conversation} />
  );
}

function RequesterLoan({ conversation }: { conversation: Conversation }) {
  const name = conversation.otherName ?? DELETED_MEMBER;
  const { since, due } = loanDates(conversation);
  let text: string | null = null;
  if (conversation.loanId) text = `${name} te prête ce matériel${since}${due}.`;
  else if (conversation.listingStatus === "pretee") text = LOAN_ELSEWHERE;
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm">
      <HandHelping className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

function OwnerLoan({ conversation }: { conversation: Conversation }) {
  const { id, loanId, listingStatus, isClosed } = conversation;
  const name = conversation.otherName ?? DELETED_MEMBER;
  const start = useStartLoan(id);
  const giveBack = useReturnLoan(id);
  const [dialog, setDialog] = useState<"start" | "return" | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const confirmStartButton = useRef<HTMLButtonElement>(null);
  const confirmReturnButton = useRef<HTMLButtonElement>(null);
  const today = todayInputValue();
  const { since, due } = loanDates(conversation);

  const canStart =
    !loanId && !isClosed && (listingStatus === "disponible" || listingStatus === "reservee");

  // La relecture montre un prêt (créé malgré une erreur réseau) ou son retour : la confirmation est sans objet.
  // Sauf si la mutation est en cours (son callback ferme) ou si l'erreur du serveur doit rester lisible.
  const pendingNow = start.isPending || giveBack.isPending;
  const keptError =
    dialog === "return" && giveBack.error instanceof MessagingError && !!giveBack.error.hint;
  if (
    !pendingNow &&
    !keptError &&
    ((dialog === "start" && loanId) || (dialog === "return" && !loanId))
  ) {
    setDialog(null);
  }
  const startFailed = start.isError;

  // Les boutons de confirmation sont désactivés pendant l'envoi : en cas d'échec, le focus leur revient.
  const returnFailed = giveBack.isError;
  useEffect(() => {
    if (startFailed) confirmStartButton.current?.focus();
  }, [startFailed]);
  useEffect(() => {
    if (returnFailed) confirmReturnButton.current?.focus();
  }, [returnFailed]);

  // La confirmation reste montée tant qu'elle est ouverte, même si la relecture change le statut.
  if (dialog === null && !loanId && !canStart && listingStatus !== "pretee") return null;

  function openDialog(kind: "start" | "return") {
    start.reset();
    giveBack.reset();
    setDateError(null);
    setDialog(kind);
  }

  function confirmStart() {
    if (dueDate && dueDate < today) {
      setDateError(LOAN_DUE_DATE_INVALID);
      return;
    }
    setDateError(null);
    start.mutate(dueDate ? endOfLocalDayIso(dueDate) : null, {
      onSuccess: () => {
        setDialog(null);
        setDueDate("");
      },
    });
  }

  const pending = start.isPending || giveBack.isPending;
  return (
    <div ref={container} className="space-y-2 rounded-xl border bg-card p-3">
      {loanId ? (
        <>
          <p className="text-sm">
            Prêté à {name}
            {since}
            {due}.
          </p>
          <Button type="button" variant="outline" onClick={() => openDialog("return")}>
            Marquer comme rendu
          </Button>
        </>
      ) : canStart ? (
        <>
          <p className="text-sm">Tu as remis ce matériel à {name} ? Note-le pour t'en souvenir.</p>
          <Button type="button" variant="outline" onClick={() => openDialog("start")}>
            Prêter à {name}
          </Button>
        </>
      ) : (
        <p className="text-sm">{LOAN_ELSEWHERE_OWNER}</p>
      )}
      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && !pending && setDialog(null)}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Le bouton du panneau a pu changer (prêt enregistré, matériel rendu) : le focus va au bouton actuel.
            event.preventDefault();
            const target =
              container.current?.querySelector("button") ?? document.querySelector("h1");
            if (target instanceof HTMLHeadingElement) target.tabIndex = -1;
            target?.focus();
          }}
        >
          {dialog === "start" && (
            <>
              <AlertDialogTitle>Prêter ce matériel à {name} ?</AlertDialogTitle>
              <AlertDialogDescription>
                L'annonce passera en « Prêtée en ce moment ». Tu pourras la remettre disponible en
                marquant le matériel comme rendu.
              </AlertDialogDescription>
              <div className="space-y-2">
                <Label htmlFor="loan-due-date">Date de retour prévue (facultatif)</Label>
                <Input
                  id="loan-due-date"
                  type="date"
                  min={today}
                  value={dueDate}
                  onChange={(event) => {
                    setDueDate(event.target.value);
                    setDateError(null);
                  }}
                  aria-invalid={dateError ? true : undefined}
                  aria-describedby={dateError ? "loan-due-error" : undefined}
                />
                {dateError && (
                  <p id="loan-due-error" role="alert" className="text-sm text-destructive">
                    {dateError}
                  </p>
                )}
              </div>
              {start.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {errorText(start.error)}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
                <LoadingButton
                  ref={confirmStartButton}
                  type="button"
                  loading={start.isPending}
                  onClick={confirmStart}
                >
                  Oui, je le prête
                </LoadingButton>
              </AlertDialogFooter>
            </>
          )}
          {dialog === "return" && (
            <>
              <AlertDialogTitle>{name} t'a rendu le matériel ?</AlertDialogTitle>
              <AlertDialogDescription>
                L'annonce redeviendra disponible pour les autres.
              </AlertDialogDescription>
              {giveBack.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {errorText(giveBack.error)}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
                <LoadingButton
                  ref={confirmReturnButton}
                  type="button"
                  loading={giveBack.isPending}
                  onClick={() =>
                    loanId && giveBack.mutate(loanId, { onSuccess: () => setDialog(null) })
                  }
                >
                  Oui, il est rendu
                </LoadingButton>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
