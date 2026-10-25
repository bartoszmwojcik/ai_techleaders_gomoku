import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

// Z1: orange only on interactive elements, so links use text-accent. WCAG 1.4.1: a link is always
// underlined, colour alone never marks it.
const textLinkVariants = cva(
  "motion-fast wrap-anywhere text-text-accent underline underline-offset-4 transition-colors hover:text-text-primary focus-visible:focus-ring",
  {
    variants: {
      placement: {
        inline: "",
        standalone: "inline-flex min-h-target items-center",
      },
    },
    defaultVariants: { placement: "inline" },
  },
);

type TextLinkProps = ComponentProps<"a"> &
  VariantProps<typeof textLinkVariants> & {
    /** Renders the child element (e.g. next/link) with the link styles. */
    asChild?: boolean;
  };

function TextLink({ className, placement, asChild = false, ...props }: TextLinkProps) {
  const Component = asChild ? Slot.Root : "a";
  return <Component className={cn(textLinkVariants({ placement }), className)} {...props} />;
}

export { TextLink, textLinkVariants };
export type { TextLinkProps };
