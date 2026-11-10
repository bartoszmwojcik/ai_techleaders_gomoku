"use client";

import { parseTheme, themeCookie, type Theme } from "@gomoku/core/theme/theme";
import { ThemeSwitch } from "@gomoku/ui/game/theme-switch";
import { useSyncExternalStore } from "react";

import plHeader from "@/i18n/catalogs/pl/header";
import type { NamespaceDict } from "@/i18n/catalogs/types";

type ThemeToggleProps = {
  /** Theme read from the cookie on the server; `null` when there is no valid cookie (dark by default). */
  initialTheme: Theme | null;
  className?: string;
  /** The `header` namespace from the server; Polish by default. */
  dict?: NamespaceDict<"header">;
};

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

// The attribute on <html> is the single source of truth: the server layout or the head script set it.
function getSnapshot(): Theme {
  return parseTheme(document.documentElement.dataset.theme) ?? "dark";
}

export function ThemeToggle({ initialTheme, className, dict = plHeader }: ThemeToggleProps) {
  // The server snapshot is also used for the first client render, so hydration always matches.
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => initialTheme ?? "dark");

  function toggle() {
    const next: Theme = getSnapshot() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      document.cookie = themeCookie(next, { secure: location.protocol === "https:" });
    } catch {
      // Cookies blocked: the choice still holds until the end of the visit.
    }
  }

  return <ThemeSwitch
      theme={theme}
      onToggle={toggle}
      lightLabel={dict.theme.light}
      darkLabel={dict.theme.dark}
      data-testid="theme-switch"
      className={className}
    />;
}
