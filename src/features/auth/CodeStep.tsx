import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { TextField } from "@/components/ui/text-field";
import { AuthMessageError, verifyEmailCode } from "@/services/auth";

export const RESEND_DELAY_SECONDS = 60;

// Accepte le collage « 1234 5678 » : on retire tout ce qui n'est pas un chiffre avant de valider.
const codeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8}$/, "Le code a 8 chiffres")),
});
type CodeInput = z.input<typeof codeSchema>;
type CodeOutput = z.output<typeof codeSchema>;

interface CodeStepProps {
  email: string;
  /** Renvoie un code (le délai serveur est d'1 email par minute). */
  onResend: () => Promise<void>;
  /** Permet de corriger l'adresse sans perdre la saisie. */
  onChangeEmail?: () => void;
  onVerified?: () => void;
}

export function CodeStep({ email, onResend, onChangeEmail, onVerified }: CodeStepProps) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_DELAY_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CodeInput, unknown, CodeOutput>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const onSubmit = handleSubmit(async ({ code }) => {
    try {
      await verifyEmailCode(email, code);
      onVerified?.();
    } catch (error) {
      setError("code", {
        message:
          error instanceof AuthMessageError ? error.message : "Impossible de vérifier le code.",
      });
    }
  });

  async function resend() {
    setResending(true);
    setResendError(null);
    try {
      await onResend();
      setSecondsLeft(RESEND_DELAY_SECONDS);
      toast.success("Nouveau code envoyé");
    } catch (error) {
      setResendError(error instanceof AuthMessageError ? error.message : "L'envoi a échoué.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Code envoyé à <strong className="text-foreground break-all">{email}</strong>.
      </p>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          label="Code à 8 chiffres"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="text-lg tracking-widest"
          error={errors.code?.message}
          {...register("code")}
        />
        <LoadingButton type="submit" className="w-full" loading={isSubmitting}>
          Valider
        </LoadingButton>
      </form>
      {resendError && (
        <p role="alert" className="text-sm text-destructive">
          {resendError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          type="button"
          variant="outline"
          loading={resending}
          disabled={secondsLeft > 0}
          onClick={resend}
        >
          {secondsLeft > 0 ? `Renvoyer le code (${secondsLeft} s)` : "Renvoyer le code"}
        </LoadingButton>
        {onChangeEmail && (
          <Button type="button" variant="ghost" onClick={onChangeEmail}>
            Changer d'adresse
          </Button>
        )}
      </div>
    </div>
  );
}
