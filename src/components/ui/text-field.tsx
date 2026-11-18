import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  error?: string;
  hint?: string;
};

/** Champ avec libellé, aide et erreur reliés par aria-describedby / aria-invalid. */
export function TextField({ id, label, error, hint, ...props }: TextFieldProps) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
