import { Moon, Sun } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "./cn";

type ThemeSwitchProps = Omit<ComponentProps<"button">, "onClick" | "children" | "aria-pressed"> & {
  /** The theme that is on right now; the switch is pressed while it is light. */
  theme: "dark" | "light";
  /** Called on click; the caller swaps the theme (the component knows nothing about storage or the DOM). */
  onToggle: () => void;
  /** Visible text and accessible name, constant in both states (e.g. "Jasny motyw"). */
  label: string;
};

// A pressed toggle with a constant name: the state travels in aria-pressed, the icon shows the theme
// that is on (WCAG 1.4.1: not colour alone). Quiet by design (Z1): the action colour stays free.
function ThemeSwitch({ theme, onToggle, label, className, type = "button", ...props }: ThemeSwitchProps) {
  const Icon = theme === "light" ? Sun : Moon;
  return (
    <button
      type={type}
      aria-pressed={theme === "light"}
      onClick={onToggle}
      className={cn(
        "motion-fast inline-flex min-h-target min-w-target items-center justify-center gap-group rounded-base border border-border-control bg-transparent px-3 text-meta font-strong text-text-primary transition-colors hover:bg-surface-raised active:bg-border-default focus-visible:focus-ring",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-(--icon-size-md) shrink-0" />
      {label}
    </button>
  );
}

export { ThemeSwitch };
export type { ThemeSwitchProps };
