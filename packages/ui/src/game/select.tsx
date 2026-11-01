import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

type SelectOption = { value: string; label: ReactNode };

type SelectProps = Omit<ComponentProps<"select">, "children"> & {
  /** The choices; labels are passed in (the component has no texts of its own). */
  options: SelectOption[];
};

// Native <select>: keyboard, screen reader and the system picker on phones come for free.
// Put it inside a Field, which labels and describes it like a TextInput.
function Select({ className, options, ...props }: SelectProps) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          "motion-fast min-h-target w-full min-w-0 appearance-none rounded-base border border-border-control bg-surface-page py-2 pr-12 pl-3 text-body text-text-primary transition-colors focus-visible:focus-ring aria-invalid:border-status-danger disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-muted",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface-page text-text-primary">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-(--icon-size-md) -translate-y-1/2 text-text-secondary"
      />
    </div>
  );
}

export { Select };
export type { SelectOption, SelectProps };
