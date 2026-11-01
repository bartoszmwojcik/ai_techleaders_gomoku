import { Moon, Sun } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "./cn";

type ThemeSwitchProps = Omit<ComponentProps<"button">, "onClick" | "children" | "aria-label"> & {
  /** The theme that is on right now: the icon and the accessible name describe it. */
  theme: "dark" | "light";
  /** Called on click; the caller swaps the theme (the component knows nothing about storage or the DOM). */
  onToggle: () => void;
  /** Accessible name while the light theme is on (e.g. "Jasny motyw"). */
  lightLabel: string;
  /** Accessible name while the dark theme is on (e.g. "Ciemny motyw"). */
  darkLabel: string;
};

// Icon only (issue 181): the sun or the moon names the theme that is on and `aria-label` says it in words
// (WCAG 1.4.1: not colour alone). The button is a 44 px target. Quiet by design (Z1): the action colour stays free.
function ThemeSwitch({ theme, onToggle, lightLabel, darkLabel, className, type = "button", ...props }: ThemeSwitchProps) {
  const Icon = theme === "light" ? Sun : Moon;
  return (
    <button
      type={type}
      onClick={onToggle}
      aria-label={theme === "light" ? lightLabel : darkLabel}
      className={cn(
        "motion-fast inline-flex min-h-target min-w-target items-center justify-center rounded-base border border-border-control bg-transparent text-text-primary transition-colors hover:bg-surface-raised active:bg-border-default focus-visible:focus-ring",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-(--icon-size-md) shrink-0" />
    </button>
  );
}

export { ThemeSwitch };
export type { ThemeSwitchProps };
