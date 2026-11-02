import { Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

// A discreet (i) button that unfolds a short note, in two parts so the button can sit next to a
// heading while the note takes the full row below it. The caller owns the open state (it is not
// remembered anywhere) and the `id` that ties the two together. No text is built in.
type InfoToggleButtonProps = Omit<ComponentProps<"button">, "aria-expanded" | "aria-controls" | "children"> & {
  /** The accessible name: what the note is about ("Informacja o wiadomościach czatu"). */
  label: string;
  expanded: boolean;
  /** The `id` of the matching `InfoToggleNote`. */
  controls: string;
};

function InfoToggleButton({ label, expanded, controls, className, type = "button", ...props }: InfoToggleButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      className={cn(
        "motion-fast inline-flex min-h-target min-w-target items-center justify-center rounded-base text-text-muted transition-colors hover:bg-surface-page hover:text-text-primary focus-visible:focus-ring",
        className,
      )}
      {...props}
    >
      <Info aria-hidden="true" className="size-(--icon-size-md) shrink-0" />
    </button>
  );
}

type InfoToggleNoteProps = {
  id: string;
  open: boolean;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

function InfoToggleNote({ id, open, children, className, "data-testid": testId }: InfoToggleNoteProps) {
  return (
    <div id={id} hidden={!open} data-testid={testId} className={cn("rounded-base border border-border-default bg-surface-page p-4 text-meta text-text-secondary", className)}>
      {children}
    </div>
  );
}

export { InfoToggleButton, InfoToggleNote };
export type { InfoToggleButtonProps, InfoToggleNoteProps };
