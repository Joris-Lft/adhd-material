import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { CodeStep } from "@/features/auth/CodeStep";
import { GoogleButton } from "@/features/auth/GoogleButton";
import { useSession } from "@/features/auth/useSession";
import { useMyProfile } from "@/hooks/useMyProfile";
import { clearDeleteIntent, hasDeleteIntent, rememberDeleteIntent } from "@/lib/delete-intent";
import { isEmailAuthEnabled } from "@/lib/features";
import { lastAuthTimestamp, needsReauth } from "@/lib/jwt";
import { rememberNextPath } from "@/lib/next-path";
import {
  AuthMessageError,
  deleteAccount,
  ReauthRequiredError,
  sendEmailCode,
  signOut,
} from "@/services/auth";

type Step = "idle" | "reauth" | "confirm";
const RETURN_PATH = "/profil";

export function DeleteAccountSection() {
  const { session } = useSession();
  const { data: profile } = useMyProfile();
  const userId = session?.user.id;
  const email = session?.user.email;
  const accessToken = session?.access_token;
  const hasGoogle =
    !!session?.user.identities?.some((identity) => identity.provider === "google") ||
    !!session?.user.app_metadata?.providers?.includes("google");
  const emailEnabled = isEmailAuthEnabled();
  const navigate = useNavigate();

  // Intention enregistrée avant l'envoi d'un code ou le départ chez Google : seule elle, et jamais
  // un paramètre d'URL, permet de rouvrir la confirmation, et seulement pour le même utilisateur.
  const [intentUserId, setIntentUserId] = useState<string | null>(() =>
    hasDeleteIntent(userId) ? (userId ?? null) : null,
  );
  // Dernière authentification (amr) que le serveur a refusée : il fait foi face à l'horloge locale.
  // On compare l'amr et non le jeton, car un TOKEN_REFRESHED change le jeton mais pas l'amr.
  const [rejectedAuthAt, setRejectedAuthAt] = useState<number | null>(null);
  const mustReauth = (token: string | undefined) =>
    needsReauth(token) ||
    (rejectedAuthAt !== null && (lastAuthTimestamp(token) ?? 0) <= rejectedAuthAt);

  const [step, setStep] = useState<Step>(() =>
    intentUserId ? (mustReauth(accessToken) ? "reauth" : "confirm") : "idle",
  );
  const [reauthNotice, setReauthNotice] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const focusNoticeOnClose = useRef(false);

  // Session mise à jour dans un autre onglet (lien de l'email) : on passe à la confirmation.
  const confirming =
    step === "confirm" ||
    (step === "reauth" && !!userId && intentUserId === userId && !mustReauth(accessToken));
  const reauthenticating = step === "reauth" && !confirming;

  // L'intention est consommée dès l'entrée en confirmation (l'état reste en mémoire) : un retour
  // arrière puis un retour sur /profil ne rouvre pas le dialogue. Effacée aussi si elle est invalide
  // (absente, expirée ou d'un autre utilisateur).
  useEffect(() => {
    if (confirming || !intentUserId) clearDeleteIntent();
  }, [confirming, intentUserId]);

  const deletion = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      // On quitte la page protégée avant de purger la session, sinon RequireAuth redirigerait vers /connexion.
      await navigate("/", { replace: true });
      toast.success("Ton compte est supprimé. Prends soin de toi.");
      await signOut().catch(() => undefined); // le compte n'existe plus : seule la session locale reste à purger
    },
    onError: (error) => {
      if (error instanceof ReauthRequiredError) {
        setRejectedAuthAt(lastAuthTimestamp(accessToken));
        setReauthNotice("Ta connexion date un peu : confirme que c'est bien toi pour continuer.");
        setCodeSent(false);
        focusNoticeOnClose.current = true;
        setStep("reauth");
      }
    },
  });

  function startDeletion() {
    deletion.reset();
    setReauthNotice(null);
    setStep(mustReauth(accessToken) ? "reauth" : "confirm");
  }

  function cancel() {
    deletion.reset();
    clearDeleteIntent();
    setIntentUserId(null);
    setCodeSent(false);
    setSendError(null);
    setStep("idle");
  }

  function rememberIntent() {
    if (!userId) return;
    rememberDeleteIntent(userId);
    setIntentUserId(userId);
    // Si le lien de l'email est ouvert dans un autre onglet, il revient sur le profil.
    rememberNextPath(RETURN_PATH);
  }

  async function sendCode() {
    if (!email) return;
    setSending(true);
    setSendError(null);
    try {
      rememberIntent();
      await sendEmailCode(email, false);
      setCodeSent(true);
    } catch (error) {
      setSendError(error instanceof AuthMessageError ? error.message : "L'envoi a échoué.");
    } finally {
      setSending(false);
    }
  }

  const failed = deletion.isError && !(deletion.error instanceof ReauthRequiredError);

  return (
    <section
      aria-labelledby="zone-sensible"
      className="space-y-4 rounded-lg border border-destructive/40 p-4"
    >
      <h2 id="zone-sensible" className="text-lg font-semibold">
        Zone sensible
      </h2>
      <p className="text-sm text-muted-foreground">
        Tu peux supprimer ton compte à tout moment. Cette action est définitive.
      </p>

      {reauthenticating ? (
        <div className="space-y-4">
          <p ref={noticeRef} tabIndex={-1} className="font-medium outline-none">
            Pour ta sécurité, confirme que c'est bien toi.
            {reauthNotice && (
              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                {reauthNotice}
              </span>
            )}
          </p>
          {!emailEnabled ? (
            hasGoogle ? (
              <GoogleButton
                label="Passer par Google"
                queryParams={{ prompt: "select_account" }}
                beforeRedirect={rememberIntent}
              />
            ) : (
              // TODO : renseigner l'adresse du support quand elle existera.
              <p role="alert" className="text-sm">
                Ton compte n'est pas relié à Google, donc on ne peut pas vérifier que c'est bien toi
                ici. Contacte-nous : on supprimera ton compte avec toi.
              </p>
            )
          ) : (
            <>
              {codeSent && email ? (
                <CodeStep
                  email={email}
                  onResend={() => sendEmailCode(email, false)}
                  onVerified={() => {
                    setCodeSent(false);
                    setStep("confirm");
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <LoadingButton
                    type="button"
                    className="w-full sm:w-auto"
                    loading={sending}
                    onClick={sendCode}
                  >
                    Recevoir un code par email
                  </LoadingButton>
                  {sendError && (
                    <p role="alert" className="text-sm text-destructive">
                      {sendError}
                    </p>
                  )}
                  {hasGoogle && (
                    <GoogleButton
                      label="Passer par Google"
                      queryParams={{ prompt: "select_account" }}
                      beforeRedirect={rememberIntent}
                    />
                  )}
                </div>
              )}
            </>
          )}
          <Button type="button" variant="ghost" onClick={cancel}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={startDeletion}>
          Supprimer mon compte
        </Button>
      )}

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !open && !deletion.isPending && cancel()}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (!focusNoticeOnClose.current) return;
            focusNoticeOnClose.current = false;
            event.preventDefault();
            noticeRef.current?.focus();
          }}
        >
          <AlertDialogTitle>Supprimer ton compte ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Compte concerné : <strong>{profile?.display_name ?? "ton compte"}</strong>
                {email && (
                  <>
                    {" "}
                    (<span className="break-all">{email}</span>)
                  </>
                )}
              </p>
              <p>
                <strong>Supprimé :</strong> ton profil, tes photos et ton adresse email.
              </p>
              <p>
                <strong>Conservé de façon anonyme :</strong> tes messages, et tes annonces archivées
                sans leur contenu.
              </p>
              <p>Tu ne pourras pas revenir en arrière.</p>
            </div>
          </AlertDialogDescription>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              La suppression n'a pas pu aboutir. Rien n'est perdu, tu peux réessayer.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletion.isPending}>Annuler</AlertDialogCancel>
            <LoadingButton
              type="button"
              variant="destructive"
              loading={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              {failed ? "Réessayer" : "Supprimer définitivement"}
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
