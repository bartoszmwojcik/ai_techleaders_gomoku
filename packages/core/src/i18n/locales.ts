/** Every language the interface can be shown in. Polish is the source of all texts. */
export const LOCALES = ["pl", "en", "fr", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

/** Languages offered in the switch; German is selectable with `?lang=de` but hidden until it is reviewed. */
export const SWITCHER_LOCALES: readonly Locale[] = ["pl", "en", "fr"];

/** Each language in its own name (endonyms are never translated). */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  pl: "Polski",
  en: "English",
  fr: "Français",
  de: "Deutsch",
};

export const LANG_COOKIE = "gomoku_lang";

/** The query parameter that picks a language; the proxy turns it into the cookie and drops it from the address. */
export const LANG_QUERY_PARAM = "lang";

/** One year, like the theme cookie. */
export const LANG_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Accepts only the exact codes from `LOCALES` (no regions, no upper case); anything else, including non-strings, is `false`. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

const FALLBACKS: Readonly<Record<Locale, readonly Locale[]>> = {
  pl: ["pl"],
  en: ["en", "pl"],
  fr: ["fr", "en", "pl"],
  de: ["de", "en", "pl"],
};

/** Where a missing text is looked up next, the language itself first and Polish (complete by definition) last. */
export function fallbackChain(locale: Locale): readonly Locale[] {
  return FALLBACKS[locale];
}

/** Longer `Accept-Language` headers are cut: a browser sends a few dozen characters. */
export const ACCEPT_LANGUAGE_MAX_LENGTH = 256;
export const ACCEPT_LANGUAGE_MAX_ENTRIES = 20;

const QUALITY = /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/;

/**
 * The supported languages of an `Accept-Language` header, best first: regions are dropped (`fr-CA` is `fr`), entries
 * with a malformed or zero quality and the `*` wildcard are ignored, and equal qualities keep the header's order.
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale[] {
  if (!header) return [];
  const entries = header
    .slice(0, ACCEPT_LANGUAGE_MAX_LENGTH)
    .split(",")
    .slice(0, ACCEPT_LANGUAGE_MAX_ENTRIES)
    .flatMap((entry) => {
      const [tag = "", ...params] = entry.trim().toLowerCase().split(";").map((part) => part.trim());
      let quality = 1;
      for (const param of params) {
        const match = QUALITY.exec(param);
        if (!match) return [];
        quality = Number(match[1]);
      }
      const primary = tag.split("-")[0];
      return quality > 0 && isLocale(primary) ? [{ locale: primary, quality }] : [];
    });
  // Array.prototype.sort is stable, so equal qualities keep their order.
  entries.sort((a, b) => b.quality - a.quality);
  return [...new Set(entries.map((entry) => entry.locale))];
}

/** The language of a request: a valid cookie (an explicit choice), then the browser's languages, then Polish. */
export function resolveLocale({
  cookie,
  acceptLanguage,
}: {
  cookie: string | null | undefined;
  acceptLanguage: string | null | undefined;
}): Locale {
  if (isLocale(cookie)) return cookie;
  return parseAcceptLanguage(acceptLanguage)[0] ?? DEFAULT_LOCALE;
}

/**
 * Attributes of the language cookie. It holds only the language code, nothing about the person; nothing in the
 * browser reads it (the switch is a link), hence `httpOnly`.
 */
export function langCookieAttributes({ secure }: { secure: boolean }) {
  return {
    path: "/",
    maxAge: LANG_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure,
  } as const;
}

/**
 * The address that switches the current page to `locale`: the same path and the other query parameters (for example
 * `?projektor=1`), with `lang` set once. The proxy then stores the choice and redirects back without `lang`.
 */
export function langSwitchHref(pathname: string, search: string, locale: Locale): string {
  const params = new URLSearchParams(search);
  params.delete(LANG_QUERY_PARAM);
  params.set(LANG_QUERY_PARAM, locale);
  return `${pathname}?${params.toString()}`;
}
