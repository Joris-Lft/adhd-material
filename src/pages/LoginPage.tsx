import { useState } from "react";
import { CodeStep } from "@/features/auth/CodeStep";
import { EmailForm } from "@/features/auth/EmailForm";
import { GoogleButton } from "@/features/auth/GoogleButton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { isEmailAuthEnabled } from "@/lib/features";
import { sendEmailCode } from "@/services/auth";

// Une fois le code validé, la session met à jour le contexte et GuestOnly redirige vers la page demandée.
export function LoginPage() {
  useDocumentTitle("Connexion");
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const emailEnabled = isEmailAuthEnabled();

  if (!emailEnabled) {
    return (
      <section className="mx-auto max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Connexion</h1>
          <p className="text-muted-foreground">
            On utilise ton compte Google uniquement pour te connecter : ton nom n'est jamais
            affiché.
          </p>
        </div>
        <GoogleButton />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Connexion</h1>
        <p className="text-muted-foreground">
          Pas de mot de passe : on t'envoie un code par email.
        </p>
      </div>
      {codeSent ? (
        <CodeStep
          email={email}
          onResend={() => sendEmailCode(email)}
          onChangeEmail={() => setCodeSent(false)}
        />
      ) : (
        <>
          <EmailForm
            defaultEmail={email}
            onSent={(sentTo) => {
              setEmail(sentTo);
              setCodeSent(true);
            }}
          />
          <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton />
        </>
      )}
    </section>
  );
}
