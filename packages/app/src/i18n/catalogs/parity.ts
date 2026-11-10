import type { Locale } from "@gomoku/core/i18n/locales";
import { isPlural, type Dict, type Message } from "@gomoku/core/i18n/translator";

/** Every message of a namespace by dotted key. */
export function flatten(dict: Dict, prefix = ""): Map<string, Message> {
  const messages = new Map<string, Message>();
  for (const [key, value] of Object.entries(dict)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string" || isPlural(value)) messages.set(path, value);
    else for (const [nested, message] of flatten(value, `${path}.`)) messages.set(nested, message);
  }
  return messages;
}

const PARAM = /\{(\w+)\}/g;

function paramsOf(message: Message): string {
  const texts = typeof message === "string" ? [message] : Object.values(message).filter((text) => typeof text === "string");
  const names = new Set(texts.flatMap((text) => [...text.matchAll(PARAM)].map((match) => match[1])));
  return [...names].sort().join(",");
}

/** Plural categories a language must provide beyond `other` (Polish all four, the rest at least `one`). */
const REQUIRED_PLURALS: Readonly<Record<Locale, readonly string[]>> = {
  pl: ["one", "few", "many", "other"],
  en: ["one", "other"],
  fr: ["one", "other"],
  de: ["one", "other"],
};

/**
 * Differences between a translation and the Polish source (spec I10): missing keys (only when `complete`), keys
 * Polish does not have, a different set of `{params}`, a text where a plural is expected (or back), plural categories
 * that are missing or unknown to `Intl.PluralRules` of the language.
 */
export function parityProblems(locale: Locale, source: Dict, translation: Dict, { complete }: { complete: boolean }): string[] {
  const expected = flatten(source);
  const actual = flatten(translation);
  const problems: string[] = [];
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories as readonly string[];
  for (const [key, message] of actual) {
    const base = expected.get(key);
    if (base === undefined) {
      problems.push(`${key}: not in the Polish source`);
      continue;
    }
    if (typeof base !== typeof message) problems.push(`${key}: ${typeof base === "string" ? "text" : "plural"} expected`);
    if (paramsOf(base) !== paramsOf(message)) problems.push(`${key}: parameters {${paramsOf(message)}} instead of {${paramsOf(base)}}`);
    if (typeof message !== "string") {
      const forms = Object.keys(message);
      const lacking = REQUIRED_PLURALS[locale].filter((form) => !forms.includes(form));
      const unknown = forms.filter((form) => !categories.includes(form));
      if (lacking.length > 0) problems.push(`${key}: lacks plural forms ${lacking.join(", ")}`);
      if (unknown.length > 0) problems.push(`${key}: ${locale} has no plural forms ${unknown.join(", ")}`);
    }
  }
  if (complete) for (const key of expected.keys()) if (!actual.has(key)) problems.push(`${key}: missing`);
  return problems;
}

/** Share of the Polish keys a translation has, in whole percent (reported for German). */
export function coverage(source: Dict, translation: Dict): number {
  const expected = flatten(source);
  const actual = flatten(translation);
  const present = [...expected.keys()].filter((key) => actual.has(key)).length;
  return expected.size === 0 ? 100 : Math.round((present / expected.size) * 100);
}
