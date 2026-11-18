import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { TextField } from "@/components/ui/text-field";
import { AuthMessageError, sendEmailCode } from "@/services/auth";

const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Écris ton adresse email")
    .email("Cette adresse n'a pas l'air valide"),
});
type EmailValues = z.infer<typeof emailSchema>;

interface EmailFormProps {
  defaultEmail?: string;
  onSent: (email: string) => void;
}

export function EmailForm({ defaultEmail = "", onSent }: EmailFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: defaultEmail },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await sendEmailCode(email);
      onSent(email);
    } catch (error) {
      setError("email", {
        message: error instanceof AuthMessageError ? error.message : "L'envoi a échoué. Réessaie.",
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField
        label="Ton email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <LoadingButton type="submit" className="w-full" loading={isSubmitting}>
        Recevoir un code
      </LoadingButton>
    </form>
  );
}
