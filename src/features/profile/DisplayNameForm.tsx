import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingButton } from "@/components/ui/loading-button";
import { TextField } from "@/components/ui/text-field";
import { useUpdateDisplayName } from "@/hooks/useUpdateDisplayName";
import { DISPLAY_NAME_SAVE_FAILED } from "@/lib/messages";
import { DisplayNameError } from "@/services/profile";
import { displayNameSchema, type DisplayNameValues } from "./display-name-schema";

interface DisplayNameFormProps {
  initialValue: string;
  label?: string;
  submitLabel: string;
  hint?: string;
  onSaved?: () => void;
  /** Désactive l'envoi tant que le pseudo n'a pas changé. */
  requireChange?: boolean;
}

export function DisplayNameForm({
  initialValue,
  label = "Ton pseudo",
  submitLabel,
  hint,
  onSaved,
  requireChange = false,
}: DisplayNameFormProps) {
  const update = useUpdateDisplayName();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DisplayNameValues>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: initialValue },
  });

  const current = useWatch({ control, name: "displayName" });
  const unchanged = requireChange && current.trim() === initialValue;

  const onSubmit = handleSubmit(async ({ displayName }) => {
    try {
      await update.mutateAsync(displayName);
      onSaved?.();
    } catch (error) {
      setError("displayName", {
        message: error instanceof DisplayNameError ? error.message : DISPLAY_NAME_SAVE_FAILED,
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField
        label={label}
        autoComplete="nickname"
        hint={hint}
        error={errors.displayName?.message}
        {...register("displayName")}
      />
      <LoadingButton
        type="submit"
        className="w-full sm:w-auto"
        loading={isSubmitting}
        disabled={unchanged}
      >
        {submitLabel}
      </LoadingButton>
    </form>
  );
}
