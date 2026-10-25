import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "./cn";

// Shared with ConfirmDialog. A flat scrim without blur (A02) and a bordered panel without shadow.
export const dialogOverlayClass =
  "fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-surface-overlay p-panel data-[state=open]:animate-fade-in";
export const dialogContentClass =
  "relative flex w-full max-w-(--layout-width-dialog) min-w-0 flex-col wrap-anywhere gap-stack rounded-base border border-border-default bg-surface-raised p-panel text-text-primary";
export const dialogTitleClass = "m-0 pr-12 text-subsection font-strong text-text-primary";
export const dialogDescriptionClass = "m-0 text-body text-text-secondary";

type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens the dialog (a Button); optional when the dialog is controlled. */
  trigger?: ReactNode;
  /** Names the dialog for screen readers and sighted users (required). */
  title: ReactNode;
  /** One sentence of context; without it the dialog has no description. */
  description?: ReactNode;
  /** Accessible name of the close button, e.g. "Zamknij" (required, passed in). */
  closeLabel: string;
  children?: ReactNode;
  className?: string;
};

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  closeLabel,
  children,
  className,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={dialogOverlayClass}>
          <DialogPrimitive.Content
            className={cn(dialogContentClass, className)}
            {...(description ? {} : { "aria-describedby": undefined })}
          >
            <DialogPrimitive.Title className={dialogTitleClass}>{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className={dialogDescriptionClass}>{description}</DialogPrimitive.Description>
            )}
            {children}
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="motion-fast absolute top-3 right-3 inline-flex min-h-target min-w-target items-center justify-center rounded-base text-text-secondary transition-colors hover:bg-surface-page hover:text-text-primary focus-visible:focus-ring"
            >
              <X aria-hidden="true" className="size-(--icon-size-md)" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { Dialog };
export type { DialogProps };
