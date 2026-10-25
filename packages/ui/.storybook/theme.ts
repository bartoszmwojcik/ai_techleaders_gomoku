export type Theme = "dark" | "light";

export const THEMES: readonly Theme[] = ["dark", "light"];

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/** Sets the theme on the document root so portals (dialogs, menus, popovers) inherit it as well. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
