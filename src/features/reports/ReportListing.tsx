import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_LINK_CLASS } from "@/features/reports/report-link";
import { useReportListing } from "@/hooks/useReportListing";
import {
  GENERIC_ERROR,
  REPORT_ALREADY_DONE,
  REPORT_CATEGORY_REQUIRED,
  REPORT_DETAILS_REQUIRED,
  REPORT_DETAILS_TOO_SHORT,
  REPORT_THANKS,
} from "@/lib/messages";
import {
  REPORT_CATEGORIES,
  REPORT_DETAILS_MAX,
  REPORT_DETAILS_MIN,
  ReportError,
  type ReportCategory,
} from "@/services/reports";

const COUNTER_FROM = REPORT_DETAILS_MAX - 100;

/** « Signaler cette annonce » : dialogue de signalement. L'état « signalée » dure autant que le composant (une fiche montée). */
export function ReportListing({ listingId }: { listingId: string }) {
  const report = useReportListing();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<"thanks" | "already" | null>(null);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [fieldError, setFieldError] = useState<{
    target: "category" | "details";
    message: string;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const doneNote = useRef<HTMLParagraphElement>(null);
  const firstRadio = useRef<HTMLInputElement>(null);
  const detailsField = useRef<HTMLTextAreaElement>(null);
  const submit = useRef<HTMLButtonElement>(null);

  // Le serveur refuse les précisions (details_*) : l'erreur va sur le champ, pas en message général.
  const serverDetailsError =
    report.error instanceof ReportError && report.error.hint?.startsWith("details_")
      ? report.error.message
      : null;

  // Échec : le bouton Envoyer était désactivé (le focus est tombé) : on le rend à Envoyer, ou au champ fautif.
  const failed = report.isError;
  useEffect(() => {
    if (!failed) return;
    (serverDetailsError ? detailsField : submit).current?.focus();
  }, [failed, serverDetailsError]);

  // Succès : le lien n'existe plus, le focus va à la confirmation.
  useEffect(() => {
    if (done) doneNote.current?.focus();
  }, [done]);

  function close() {
    if (report.isPending) return;
    setOpen(false);
  }

  function openDialog() {
    report.reset();
    setFieldError(null);
    setOpen(true);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (report.isPending) return;
    if (!category) {
      setFieldError({ target: "category", message: REPORT_CATEGORY_REQUIRED });
      firstRadio.current?.focus();
      return;
    }
    const text = details.trim();
    const problem =
      text.length === 0 && category === "autre"
        ? REPORT_DETAILS_REQUIRED
        : text.length > 0 && text.length < REPORT_DETAILS_MIN
          ? REPORT_DETAILS_TOO_SHORT
          : null;
    if (problem) {
      setFieldError({ target: "details", message: problem });
      detailsField.current?.focus();
      return;
    }
    setFieldError(null);
    report.mutate(
      { listingId, category, details: text || undefined },
      {
        onSuccess: ({ alreadyReported }) => {
          setDone(alreadyReported ? "already" : "thanks");
          setOpen(false);
        },
      },
    );
  }

  if (done) {
    return (
      <p
        ref={doneNote}
        role="status"
        tabIndex={-1}
        className="flex items-center gap-2 text-sm text-muted-foreground outline-none"
      >
        <Check className="size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-medium">Annonce signalée.</strong>{" "}
          {done === "thanks" ? REPORT_THANKS : REPORT_ALREADY_DONE}
        </span>
      </p>
    );
  }

  const categoryError = fieldError?.target === "category" ? fieldError.message : null;
  const detailsError =
    (fieldError?.target === "details" ? fieldError.message : null) ?? serverDetailsError;
  const detailsRequired = category === "autre";
  const showCounter = details.length >= COUNTER_FROM;

  return (
    <>
      <button type="button" ref={trigger} className={REPORT_LINK_CLASS} onClick={openDialog}>
        Signaler cette annonce
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogTitle>Signaler cette annonce</DialogTitle>
          <DialogDescription>
            Dis-nous ce qui ne va pas : on regardera l'annonce. Ton signalement reste privé.
          </DialogDescription>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <fieldset
              className="grid gap-2"
              aria-describedby={categoryError ? "report-category-error" : undefined}
            >
              <legend className="mb-1 text-sm font-medium">Raison du signalement</legend>
              {REPORT_CATEGORIES.map((item, index) => (
                <label
                  key={item.value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                >
                  <input
                    ref={index === 0 ? firstRadio : undefined}
                    type="radio"
                    name="report-category"
                    value={item.value}
                    checked={category === item.value}
                    disabled={report.isPending}
                    onChange={() => {
                      setCategory(item.value);
                      if (fieldError?.target === "category") setFieldError(null);
                    }}
                    className="size-4 accent-primary"
                  />
                  {item.label}
                </label>
              ))}
              {categoryError && (
                <p id="report-category-error" role="alert" className="text-sm text-destructive">
                  {categoryError}
                </p>
              )}
            </fieldset>
            <div className="grid gap-2">
              <label htmlFor="report-details" className="text-sm font-medium">
                {detailsRequired ? "Précisions" : "Précisions (facultatif)"}
              </label>
              <Textarea
                id="report-details"
                ref={detailsField}
                value={details}
                maxLength={REPORT_DETAILS_MAX}
                disabled={report.isPending}
                required={detailsRequired}
                aria-invalid={detailsError ? true : undefined}
                aria-describedby={
                  [detailsError && "report-details-error", showCounter && "report-details-count"]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                onChange={(event) => {
                  setDetails(event.target.value);
                  if (fieldError?.target === "details") setFieldError(null);
                  if (serverDetailsError) report.reset();
                }}
              />
              {showCounter && (
                <p id="report-details-count" className="text-right text-xs text-muted-foreground">
                  {details.length.toLocaleString("fr-FR")} /{" "}
                  {REPORT_DETAILS_MAX.toLocaleString("fr-FR")} caractères
                </p>
              )}
              {detailsError && (
                <p id="report-details-error" role="alert" className="text-sm text-destructive">
                  {detailsError}
                </p>
              )}
            </div>
            {report.isError && !serverDetailsError && (
              <p role="alert" className="text-sm text-destructive">
                {report.error instanceof ReportError ? report.error.message : GENERIC_ERROR}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={report.isPending} onClick={close}>
                Annuler
              </Button>
              <LoadingButton ref={submit} type="submit" loading={report.isPending}>
                Envoyer
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
