import { Check } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useId, type ReactNode } from "react";

import { cn } from "./cn";

type ChoiceOption = { value: string; label: ReactNode };

type ChoiceGroupProps = {
  /** Visible name of the group, e.g. "Wariant". */
  label: ReactNode;
  options: readonly ChoiceOption[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Test id of the group; each choice gets `<testId>-<value>`. */
  "data-testid"?: string;
  className?: string;
};

// A choice is not an action (issue 273): radio group drawn as neutral joined segments, smaller than a
// button and never in the action colour. The checked segment is marked by a stronger border, a tick and
// weight, not by colour alone. The 1 px gaps show the divider colour of the container, so wrapped rows
// stay joined too; the container clips the square corners and the focus ring is drawn inside.
function ChoiceGroup({ label, options, value, onValueChange, disabled, className, "data-testid": testId }: ChoiceGroupProps) {
  const labelId = useId();
  // Up to two options always share one row; more fill two columns on a phone and one row from `sm`.
  const layout = options.length <= 2 ? "grid-flow-col auto-cols-fr" : "grid-cols-2 sm:grid-flow-col sm:auto-cols-fr";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span id={labelId} className="text-meta text-text-secondary">
        {label}
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        data-testid={testId}
        className={cn("grid gap-px overflow-hidden rounded-base border border-border-control bg-border-control", layout)}
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            className="motion-fast inline-flex min-h-target min-w-0 items-center justify-center gap-1 border-2 border-transparent bg-surface-page px-1 text-center text-meta text-text-primary transition-colors hover:bg-surface-raised focus-visible:focus-ring-inset disabled:cursor-not-allowed disabled:text-text-muted max-sm:odd:last:col-span-2 data-[state=checked]:border-segment-checked-border data-[state=checked]:bg-segment-checked-bg data-[state=checked]:font-strong"
          >
            <RadioGroup.Indicator asChild>
              <Check aria-hidden="true" className="size-(--icon-size-sm) shrink-0" />
            </RadioGroup.Indicator>
            <span className="break-words">{option.label}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

export { ChoiceGroup };
export type { ChoiceGroupProps, ChoiceOption };
