import { DocsContainer, type DocsContainerProps } from "@storybook/addon-docs/blocks";
import type { Preview } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { GLOBALS_UPDATED } from "storybook/internal/core-events";
import { themes } from "storybook/theming";

import "./preview.css";
import { applyTheme, isTheme, type Theme } from "./theme";

/** The toolbar theme may arrive in the URL (`?globals=theme:light`) before any event is emitted. */
function themeFromUrl(): Theme | undefined {
  const theme = new URLSearchParams(window.location.search).get("globals")?.match(/(?:^|;)theme:(\w+)/)?.[1];
  return isTheme(theme) ? theme : undefined;
}

/**
 * A story shown in an iframe inside a docs page (dialogs) starts in the theme of that page. Without this it
 * would announce its own default and switch the docs page back to dark.
 */
function themeFromParent(): Theme | undefined {
  try {
    const theme = window.parent !== window ? window.parent.document.documentElement.dataset.theme : undefined;
    return isTheme(theme) ? theme : undefined;
  } catch {
    return undefined;
  }
}

const initialTheme: Theme =
  themeFromUrl() ?? themeFromParent() ?? (import.meta.env.VITE_STORY_THEME === "light" ? "light" : "dark");

applyTheme(initialTheme);

type PreviewWindow = { __STORYBOOK_PREVIEW__?: { storyStoreValue?: { userGlobals?: { get?: () => { theme?: unknown } } } } };

/**
 * The theme this preview itself holds. A story shown in an iframe on a docs page reports its own globals
 * on the same channel, so the event payload alone must not switch the docs page.
 */
function ownTheme(fallback: unknown): unknown {
  return (window as unknown as PreviewWindow).__STORYBOOK_PREVIEW__?.storyStoreValue?.userGlobals?.get?.().theme ?? fallback;
}

/** Docs pages are not stories, so no decorator runs for them: follow the toolbar here instead. */
function ThemedDocsContainer({ children, context }: DocsContainerProps) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const onGlobalsUpdated = ({ globals }: { globals: Record<string, unknown> }) => {
      const next = ownTheme(globals.theme);
      if (isTheme(next)) {
        applyTheme(next);
        setTheme(next);
      }
    };
    context.channel.on(GLOBALS_UPDATED, onGlobalsUpdated);
    return () => context.channel.off(GLOBALS_UPDATED, onGlobalsUpdated);
  }, [context]);

  return (
    <DocsContainer context={context} theme={theme === "dark" ? themes.dark : themes.light}>
      {children}
    </DocsContainer>
  );
}

const preview: Preview = {
  initialGlobals: { theme: initialTheme },
  globalTypes: {
    theme: {
      description: "Motyw",
      toolbar: {
        title: "Motyw",
        icon: "mirror",
        dynamicTitle: true,
        items: [
          { value: "dark", title: "Ciemny" },
          { value: "light", title: "Jasny" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      applyTheme(isTheme(context.globals.theme) ? context.globals.theme : initialTheme);
      return <Story />;
    },
  ],
  parameters: {
    // Accessibility violations fail the story (and the stories run as tests).
    a11y: { test: "error" },
    backgrounds: { disabled: true },
    docs: { container: ThemedDocsContainer },
    options: {
      storySort: {
        order: [
          "Design system",
          [
            "Start",
            "Komponenty",
            "Jak wybrać komponent",
            "Użycie i dostępność",
            "Treść i komunikaty",
            "Czego unikać",
            "Czego brakuje",
            "Jak zmieniać system",
            "Konta",
            "Partia z zaproszenia",
            "Otwarte lobby",
            "Historia partii",
          ],
          "Fundamenty",
          "Prymitywy",
          "Produkt",
          "Wzorce",
          "Ekrany",
        ],
      },
    },
    viewport: {
      options: {
        phone: { name: "Telefon 320 px", styles: { width: "320px", height: "640px" } },
        tablet: { name: "Tablet 768 px", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Komputer 1440 px", styles: { width: "1440px", height: "900px" } },
      },
    },
  },
};

export default preview;
