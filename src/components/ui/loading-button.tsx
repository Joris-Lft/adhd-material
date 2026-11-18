import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type LoadingButtonProps = React.ComponentProps<typeof Button> & { loading?: boolean };

/** Bouton désactivé avec spinner pendant un envoi. */
export function LoadingButton({ loading, disabled, children, ...props }: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}
