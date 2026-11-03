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

// Radio group shown as a row of touch-sized chips: the checked chip is filled and ticked by weight, not by colour alone.
function ChoiceGroup({ label, options, value, onValueChange, disabled, className, "data-testid": testId }: ChoiceGroupProps) {
  const labelId = useId();
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
        className="flex flex-wrap gap-1"
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
            className="motion-fast inline-flex min-h-target min-w-target items-center justify-center rounded-base border border-border-control bg-surface-page px-3 text-body text-text-primary transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:text-text-muted data-[state=checked]:border-action-primary-bg data-[state=checked]:bg-action-primary-bg data-[state=checked]:font-strong data-[state=checked]:text-action-primary-text"
          >
            {option.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

export { ChoiceGroup };
export type { ChoiceGroupProps, ChoiceOption };
