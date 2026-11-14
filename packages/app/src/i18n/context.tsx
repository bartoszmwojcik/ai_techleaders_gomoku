"use client";

import { DEFAULT_LOCALE, type Locale } from "@gomoku/core/i18n/locales";
import { createTranslator } from "@gomoku/core/i18n/translator";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Namespace, NamespaceDict } from "./catalogs/types";
import type { TranslatorOf } from "./client";

/** The namespaces a server page handed down, each complete in the request's language. */
export type ProvidedDicts = { readonly [N in Namespace]?: NamespaceDict<N> };

type Texts = { locale: Locale; dicts: ProvidedDicts };

const NONE: Texts = { locale: DEFAULT_LOCALE, dicts: {} };
const I18nContext = createContext<Texts>(NONE);

type ProviderProps = {
  /** Absent in Polish (`providerI18n` passes nothing), so the RSC payload of a Polish page carries no catalog. */
  locale?: Locale;
  dicts?: ProvidedDicts;
  children: ReactNode;
};

/**
 * Texts for a deep client tree (the game room, spec Q10): only the namespaces the server page passed. A nested
 * provider joins its parent's namespaces (`{ ...parent, ...own }`, the inner one wins on the same namespace), so the
 * page's `game`/`chat` under the segment layout's `common` gives the room all three. Imports no catalog itself.
 */
export function I18nProvider({ locale, dicts, children }: ProviderProps) {
  const parent = useContext(I18nContext);
  const value = useMemo<Texts>(
    () => ({ locale: locale ?? parent.locale, dicts: { ...parent.dicts, ...dicts } }),
    [locale, dicts, parent],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The translator of one namespace from the nearest providers; Polish from the caller's statically imported catalog
 * when no provider passed the namespace (Polish pages, tests, a component rendered outside the room).
 */
export function useT<N extends Namespace>(namespace: N, plFallback: NamespaceDict<N>): TranslatorOf<N> {
  const { locale, dicts } = useContext(I18nContext);
  const dict = dicts[namespace] as NamespaceDict<N> | undefined;
  return useMemo(
    () => (dict ? createTranslator(locale, dict) : createTranslator(DEFAULT_LOCALE, plFallback)),
    [locale, dict, plFallback],
  );
}
