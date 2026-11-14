import { DEFAULT_LOCALE, type Locale } from "@gomoku/core/i18n/locales";
import { createTranslator, type Translator } from "@gomoku/core/i18n/translator";

import type { Namespace, NamespaceDict } from "./catalogs/types";

/**
 * What a client component of one namespace takes from the server page: nothing in Polish (`clientI18n` passes `{}`,
 * the default is in the bundle), the language and the namespace otherwise (spec I3).
 */
export type TextsProps<N extends Namespace> = { locale?: Locale; dict?: NamespaceDict<N> };

export type TranslatorOf<N extends Namespace> = Translator<NamespaceDict<N>>;

/**
 * The translator of a client component or a helper: the language and the namespace the server handed down, or Polish
 * from the catalog the caller imports statically (so only the namespaces a component uses end up in its bundle).
 */
export function textsOf<N extends Namespace>(
  plFallback: NamespaceDict<N>,
  { locale = DEFAULT_LOCALE, dict = plFallback }: TextsProps<N> = {},
): TranslatorOf<N> {
  return createTranslator(locale, dict);
}
