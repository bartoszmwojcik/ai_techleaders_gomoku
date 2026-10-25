import { cn } from "./cn";
import type { ComponentProps } from "react";

// R01.8: control border at 3:1 (border-control); placeholder is an example, never the field name.
function TextInput({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "motion-fast min-h-target w-full rounded-base border border-border-control bg-surface-page px-3 text-body text-text-primary transition-colors placeholder:text-text-muted focus-visible:focus-ring aria-invalid:border-status-danger disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-muted",
        className,
      )}
      {...props}
    />
  );
}

export { TextInput };
