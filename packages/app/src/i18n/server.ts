import "server-only";

import { DEFAULT_LOCALE, LANG_COOKIE, resolveLocale, type Locale } from "@gomoku/core/i18n/locales";
import { createTranslator, type Translator } from "@gomoku/core/i18n/translator";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { loadNamespace } from "./catalogs";
import type { Namespace, NamespaceDict } from "./catalogs/types";

/**
 * The language of this request, read once (React `cache`), so the layout, the page and every server component render
 * the same language and the HTML always matches hydration: the cookie, then `Accept-Language`, then Polish. `?lang=`
 * never reaches a render: the proxy has turned it into the cookie.
 */
export const getLocale = cache(async (): Promise<Locale> =>
  resolveLocale({
    cookie: (await cookies()).get(LANG_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
  }),
);

export type I18n<N extends Namespace> = {
  locale: Locale;
  /** The complete namespace, to pass to a client component as its `dict` prop. */
  dict: NamespaceDict<N>;
  t: Translator<NamespaceDict<N>>;
};

/**
 * Props for a client component that defaults to the Polish catalog: nothing in Polish (the default is already in the
 * bundle, so the page's HTML and RSC payload stay as they were), the language and the namespace otherwise.
 */
export function clientI18n<N extends Namespace>({ locale, dict }: I18n<N>): { locale?: Locale; dict?: NamespaceDict<N> } {
  return locale === DEFAULT_LOCALE ? {} : { locale, dict };
}

/** Texts of one namespace in the request's language, for a server component. */
export async function getI18n<N extends Namespace>(namespace: N): Promise<I18n<N>> {
  const locale = await getLocale();
  const dict = await loadNamespace(locale, namespace);
  return { locale, dict, t: createTranslator(locale, dict) };
}
