import { formatMegabytes, formatNumber } from "./format";
import type { Locale } from "./locales";

export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** A text that depends on `params.count`; the category comes from `Intl.PluralRules`, a missing one falls back to `other`. */
export type Plural = { readonly [C in Exclude<PluralCategory, "other">]?: string } & { readonly other: string };

export type Message = string | Plural;

/** One namespace of texts: messages and nested groups. A group whose keys are all plural categories is a `Plural`. */
export type Dict = { readonly [key: string]: Message | Dict };

export type Params = Readonly<Record<string, string | number>>;

/** True for an object that is a plural form (`other` and only plural categories), false for a nested group. */
export function isPlural(value: Message | Dict): value is Plural {
  if (typeof value === "string") return false;
  const keys = Object.keys(value);
  return typeof value.other === "string" && keys.every((key) => (PLURAL_CATEGORIES as readonly string[]).includes(key));
}

type IsPlural<T> = T extends { other: string }
  ? Exclude<keyof T, PluralCategory> extends never
    ? true
    : false
  : false;

/** Dotted keys of every message in `D`, e.g. `"session.logout"`. */
export type MessageKey<D> = {
  [K in keyof D & string]: D[K] extends string
    ? K
    : IsPlural<D[K]> extends true
      ? K
      : `${K}.${MessageKey<D[K]>}`;
}[keyof D & string];

/** The shape a translation of `D` must have: the same keys, any text, plural forms with the target language's categories. */
export type Catalog<D> = {
  readonly [K in keyof D]: D[K] extends string ? string : IsPlural<D[K]> extends true ? Plural : Catalog<D[K]>;
};

/** A translation that may still lack texts (German): the fallback chain fills the gaps. */
export type PartialCatalog<D> = {
  readonly [K in keyof D]?: D[K] extends string ? string : IsPlural<D[K]> extends true ? Plural : PartialCatalog<D[K]>;
};

export type Translator<D extends Dict = Dict> = {
  (key: MessageKey<D>, params?: Params): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  /** "16 MB" in Polish, English and German, "16 Mo" in French. */
  megabytes(value: number): string;
  readonly locale: Locale;
};

const warned = new Set<string>();

/**
 * A text problem a reader must never see: tests fail on it, development warns once, production stays quiet and shows
 * the fallback (the key or the literal `{name}`).
 */
export function reportTextProblem(message: string): void {
  const env = process.env.NODE_ENV;
  if (env === "test") throw new Error(message);
  if (env !== "production" && !warned.has(message)) {
    warned.add(message);
    console.warn(`[i18n] ${message}`);
  }
}

function lookup(dict: Dict, key: string): Message | undefined {
  let node: Message | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string" || isPlural(node)) return undefined;
    node = node[part];
  }
  return node === undefined || typeof node === "string" || isPlural(node) ? node : undefined;
}

const PARAM = /\{(\w+)\}/g;

/** Texts of one namespace in one language: `t("session.menuLabel", { name })`, with `{name}` and plural forms filled in. */
export function createTranslator<D extends Dict>(locale: Locale, dict: D): Translator<D> {
  const rules = new Intl.PluralRules(locale);

  function t(key: MessageKey<D>, params: Params = {}): string {
    const message = lookup(dict, key);
    if (message === undefined) {
      reportTextProblem(`missing text "${key}" (${locale})`);
      return key;
    }
    let text: string;
    if (typeof message === "string") {
      text = message;
    } else {
      const count = params.count;
      if (typeof count !== "number") reportTextProblem(`"${key}" needs a numeric {count} (${locale})`);
      text = typeof count === "number" ? (message[rules.select(count)] ?? message.other) : message.other;
    }
    return text.replace(PARAM, (literal, name: string) => {
      const value = params[name];
      if (value === undefined) {
        reportTextProblem(`"${key}" has no value for {${name}} (${locale})`);
        return literal;
      }
      return String(value);
    });
  }

  return Object.assign(t, {
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(locale, value, options),
    megabytes: (value: number) => formatMegabytes(locale, value),
    locale,
  });
}
