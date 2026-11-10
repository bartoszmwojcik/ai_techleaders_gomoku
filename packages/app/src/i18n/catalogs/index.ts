import "server-only";

import { fallbackChain, type Locale } from "@gomoku/core/i18n/locales";
import { isPlural, type Dict } from "@gomoku/core/i18n/translator";

import type { Namespace, NamespaceDict } from "./types";

type Loader = () => Promise<{ default: Dict }>;

// Literal dynamic imports, so the bundler splits every catalog on its own and only the server ever loads them.
export const LOADERS: Readonly<Record<Locale, Readonly<Record<Namespace, Loader>>>> = {
  pl: { common: () => import("./pl/common"), header: () => import("./pl/header"), show: () => import("./pl/show") },
  en: { common: () => import("./en/common"), header: () => import("./en/header"), show: () => import("./en/show") },
  fr: { common: () => import("./fr/common"), header: () => import("./fr/header"), show: () => import("./fr/show") },
  de: { common: () => import("./de/common"), header: () => import("./de/header"), show: () => import("./de/show") },
};

/**
 * `top` with every text it lacks taken from `base`. Missing keys are collected as dotted paths; a key whose shape
 * differs from the base (text instead of group) keeps the base, so a component always gets the shape it expects.
 */
export function mergeFallback(top: Dict, base: Dict, missing: string[], prefix = ""): Dict {
  const merged: Record<string, Dict[string]> = {};
  for (const [key, baseValue] of Object.entries(base)) {
    const value = top[key];
    const path = `${prefix}${key}`;
    const baseIsMessage = typeof baseValue === "string" || isPlural(baseValue);
    const valueIsMessage = value !== undefined && (typeof value === "string" || isPlural(value));
    if (value === undefined || baseIsMessage !== valueIsMessage) {
      missing.push(path);
      merged[key] = baseValue;
    } else if (baseIsMessage) {
      // A message is taken whole: a plural form keeps the categories of its own language.
      merged[key] = value;
    } else {
      merged[key] = mergeFallback(value as Dict, baseValue as Dict, missing, `${path}.`);
    }
  }
  return merged;
}

const warned = new Set<string>();

/**
 * One namespace in `locale`, complete: the fallback chain (FR → EN → PL) fills every gap, so the object handed to a
 * client component never lacks a key. In development every gap is reported once per language and key.
 */
export async function loadNamespace<N extends Namespace>(locale: Locale, namespace: N): Promise<NamespaceDict<N>> {
  const chain = fallbackChain(locale);
  const dicts = await Promise.all(chain.map(async (each) => (await LOADERS[each][namespace]()).default));
  const missing: string[] = [];
  // Polish (last) is complete; merge from the back, recording only what the requested language itself lacks.
  let merged = dicts[dicts.length - 1]!;
  for (let index = dicts.length - 2; index >= 0; index -= 1) {
    const gaps: string[] = [];
    merged = mergeFallback(dicts[index]!, merged, gaps);
    if (index === 0) missing.push(...gaps);
  }
  if (process.env.NODE_ENV === "development") {
    for (const key of missing) {
      const id = `${locale}:${namespace}.${key}`;
      if (!warned.has(id)) {
        warned.add(id);
        console.warn(`[i18n] ${locale} lacks "${namespace}.${key}", showing the fallback`);
      }
    }
  }
  return merged as NamespaceDict<N>;
}
