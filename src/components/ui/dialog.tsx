import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { DIALOG_CONTENT_CLASS, DIALOG_OVERLAY_CLASS } from "@/components/ui/dialog-styles";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

function DialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASS} />
      <DialogPrimitive.Content className={cn(DIALOG_CONTENT_CLASS, className)} {...props} />
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter };
