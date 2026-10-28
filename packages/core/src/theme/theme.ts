export type Theme = "dark" | "light";

export const THEME_COOKIE = "gomoku_theme";

/** One year. */
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Accepts only the exact theme names; anything else (including non-strings) is `null`. */
export function parseTheme(value: unknown): Theme | null {
  return value === "dark" || value === "light" ? value : null;
}

/** Value for `document.cookie` that stores the chosen theme. */
export function themeCookie(
  theme: Theme,
  { secure }: { secure: boolean },
): string {
  const parts = [
    `${THEME_COOKIE}=${theme}`,
    "Path=/",
    `Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Source of a tiny inline script for `<head>`, run before the first paint when the server could
 * not read a valid theme cookie: a valid cookie wins, otherwise the system preference decides
 * (light only when the system asks for it; dark is the default and needs no attribute).
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(dark|light)(?:;|$)/);var t=m?m[1]:window.matchMedia("(prefers-color-scheme: light)").matches?"light":null;if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;
