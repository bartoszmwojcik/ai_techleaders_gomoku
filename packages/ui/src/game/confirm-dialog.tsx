import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "./dialog";

type ConfirmDialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens the dialog; optional when the dialog is controlled. */
  trigger?: ReactNode;
  /** The question, with the name of the object in it: "Usunąć konto Ala_7?" (required). */
  title: ReactNode;
  /** The consequence in one sentence. */
  description?: ReactNode;
  /** A verb phrase, never "OK": "Usuń konto na zawsze" (required). */
  confirmLabel: string;
  /** The way out, easy to find: "Zostaw konto" (required). */
  cancelLabel: string;
  /** Runs when the player confirms. The dialog stays open until the parent closes it. */
  onConfirm: () => void;
  /** Shows the confirm button as busy and blocks a second click while the server answers. */
  confirming?: boolean;
  tone?: "danger" | "primary";
  className?: string;
};

// Uses the alertdialog role: focus starts on the way out, and the player must answer or cancel.
function ConfirmDialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirming = false,
  tone = "danger",
  className,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={dialogOverlayClass}>
          <AlertDialogPrimitive.Content
            className={cn(dialogContentClass, className)}
            {...(description ? {} : { "aria-describedby": undefined })}
          >
            <AlertDialogPrimitive.Title className={dialogTitleClass}>{title}</AlertDialogPrimitive.Title>
            {description && (
              <AlertDialogPrimitive.Description className={dialogDescriptionClass}>
                {description}
              </AlertDialogPrimitive.Description>
            )}
            <div className="flex flex-col gap-group md:flex-row md:justify-end">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary">{cancelLabel}</Button>
              </AlertDialogPrimitive.Cancel>
              <Button variant={tone} loading={confirming} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Overlay>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

export { ConfirmDialog };
export type { ConfirmDialogProps };
