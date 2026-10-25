import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

// R02.1, R02.3: one strong action in the action colour; R01.8: visible focus ring; A02: no shadow,
// no pills. The label is always text (no icon-only buttons here).
const buttonVariants = cva(
  "motion-fast inline-flex min-h-target min-w-target items-center justify-center gap-group rounded-base px-4 py-3 text-center text-body font-strong transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:border disabled:border-border-control disabled:bg-transparent disabled:text-text-muted [&_svg]:size-(--icon-size-md) [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-action-primary-bg text-action-primary-text hover:bg-action-primary-bg-hover active:bg-action-primary-bg-pressed",
        secondary: "border border-border-control bg-transparent text-text-primary hover:bg-surface-raised active:bg-border-default",
        danger: "bg-action-danger-bg text-action-danger-text hover:bg-action-danger-bg-hover active:bg-action-danger-bg-pressed",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, blocks a second submit and sets aria-busy. Ignored with asChild. */
    loading?: boolean;
    /** Renders the child element (e.g. a link) with the button styles. */
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  loading = false,
  asChild = false,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant }), className);

  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
