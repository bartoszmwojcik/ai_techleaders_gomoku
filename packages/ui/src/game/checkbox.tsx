import { cn } from "./cn";
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";

type CheckboxProps = Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "children"> & {
  /** Visible text of the choice. The whole row is the click and touch target. */
  label: ReactNode;
  /** Extra explanation under the label. */
  hint?: ReactNode;
};

// A checked box shows a tick as well as the fill, so the state never rests on colour alone (WCAG 1.4.1).
function Checkbox({ label, hint, id, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;

  return (
    <label className="flex min-h-target cursor-pointer items-start gap-group has-[:disabled]:cursor-not-allowed">
      <span className="flex h-target items-center">
        <CheckboxPrimitive.Root
          id={controlId}
          aria-describedby={hintId}
          className={cn(
            "motion-fast flex size-(--icon-size-lg) shrink-0 items-center justify-center rounded-base border border-border-control bg-surface-page transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:text-text-muted data-[state=checked]:border-action-primary-bg data-[state=checked]:bg-action-primary-bg",
            className,
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator>
            <Check aria-hidden="true" className="size-(--icon-size-md) text-action-primary-text" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
      </span>
      <span className="flex min-h-target min-w-0 flex-col justify-center wrap-anywhere">
        <span className="text-body text-text-primary">{label}</span>
        {hint && (
          <span id={hintId} className="text-meta text-text-muted">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export { Checkbox };
export type { CheckboxProps };
