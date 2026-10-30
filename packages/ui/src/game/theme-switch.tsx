import { Moon, Sun } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "./cn";

type ThemeSwitchProps = Omit<ComponentProps<"button">, "onClick" | "children"> & {
  /** The theme that is on right now: the text and the icon name it. */
  theme: "dark" | "light";
  /** Called on click; the caller swaps the theme (the component knows nothing about storage or the DOM). */
  onToggle: () => void;
  /** Visible text and accessible name while the light theme is on (e.g. "Jasny motyw"). */
  lightLabel: string;
  /** Visible text and accessible name while the dark theme is on (e.g. "Ciemny motyw"). */
  darkLabel: string;
};

// The text and the icon both name the theme that is on (WCAG 1.4.1: not colour alone), as in the prototype
// ("Motyw: ciemny" / "Motyw: jasny"). Quiet by design (Z1): the action colour stays free.
function ThemeSwitch({ theme, onToggle, lightLabel, darkLabel, className, type = "button", ...props }: ThemeSwitchProps) {
  const Icon = theme === "light" ? Sun : Moon;
  return (
    <button
      type={type}
      onClick={onToggle}
      className={cn(
        "motion-fast inline-flex min-h-target min-w-target items-center justify-center gap-group rounded-base border border-border-control bg-transparent px-3 text-meta font-strong text-text-primary transition-colors hover:bg-surface-raised active:bg-border-default focus-visible:focus-ring",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-(--icon-size-md) shrink-0" />
      {/* Both texts share one grid cell and the inactive one is invisible and aria-hidden, so the
          button keeps the width of the longer text and does not jump when the theme changes after hydration. */}
      <span className="grid">
        <span aria-hidden={theme !== "light" || undefined} className={cn("col-start-1 row-start-1", theme !== "light" && "invisible")}>
          {lightLabel}
        </span>
        <span aria-hidden={theme !== "dark" || undefined} className={cn("col-start-1 row-start-1", theme !== "dark" && "invisible")}>
          {darkLabel}
        </span>
      </span>
    </button>
  );
}

export { ThemeSwitch };
export type { ThemeSwitchProps };
