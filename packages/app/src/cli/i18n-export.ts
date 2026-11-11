// `npm run i18n:export -w @gomoku/app` (spec 2026-11-10-i18n, I17, I18; E15-S02): the texts of the catalogs as a CSV
// for a reviewer who is not a developer — one row per text with its key, the Polish source, the English, French and
// German texts, the review status of each language and the parameters a translation must keep. Export only: the
// reviewer's corrections are brought into the `.ts` catalogs by hand (no import, I18), and only then is the status
// in `catalogs/status.ts` switched to `reviewed` with the reviewer and the day.
import type { Locale } from "@gomoku/core/i18n/locales";
import { isPlural, type Dict, type Message } from "@gomoku/core/i18n/translator";

import type { ReviewStatus } from "../i18n/catalogs/status";
import type { Namespace } from "../i18n/catalogs/types";

type Translated = Exclude<Locale, "pl">;
const LANGUAGES = ["en", "fr", "de"] as const satisfies readonly Translated[];

/** Every catalog of a namespace, Polish complete (the source), the others possibly partial (German). */
export type ExportCatalogs = Readonly<Record<Namespace, Readonly<Record<Locale, Dict>>>>;

export type ExportRow = { key: string; pl: string; en: string; fr: string; de: string; status: string; params: string };

export const EXPORT_COLUMNS = ["key", "PL", "EN", "FR", "DE", "status", "params"] as const;

/**
 * The texts of `dict` by dotted key; a plural form gives one text per category (`key[one]`, `key[other]`, …), in the
 * order the catalog lists them.
 */
export function flatten(dict: Dict, prefix = ""): Map<string, string> {
  const texts = new Map<string, string>();
  for (const [key, value] of Object.entries(dict) as [string, Message | Dict][]) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") texts.set(path, value);
    else if (isPlural(value)) for (const [category, text] of Object.entries(value)) texts.set(`${path}[${category}]`, text as string);
    else for (const [inner, text] of flatten(value, `${path}.`)) texts.set(inner, text);
  }
  return texts;
}

/** The `{name}` parameters of a text, in order, each once. */
export function paramsOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))];
}

/** `fr: draft` or `fr: reviewed (Marie, 2026-11-12)`. */
export function statusText(locale: Translated, status: ReviewStatus): string {
  return status.state === "draft" ? `${locale}: draft` : `${locale}: reviewed (${status.reviewer}, ${status.date})`;
}

/**
 * One row per Polish text of `namespaces`, keyed `namespace.path`. A text a language lacks (German) stays empty, so
 * the reviewer sees the gap instead of the fallback; the Polish source decides the rows and the parameters.
 */
export function exportRows(
  catalogs: ExportCatalogs,
  status: Readonly<Record<Translated, Readonly<Record<Namespace, ReviewStatus>>>>,
  namespaces: readonly Namespace[],
): ExportRow[] {
  return namespaces.flatMap((namespace) => {
    const [pl, en, fr, de] = (["pl", ...LANGUAGES] as const).map((locale) => flatten(catalogs[namespace][locale]));
    const review = LANGUAGES.map((locale) => statusText(locale, status[locale][namespace])).join("; ");
    return [...pl!].map(([key, text]) => ({
      key: `${namespace}.${key}`,
      pl: text,
      en: en!.get(key) ?? "",
      fr: fr!.get(key) ?? "",
      de: de!.get(key) ?? "",
      status: review,
      params: paramsOf(text).join(", "),
    }));
  });
}

/** One CSV field (RFC 4180): quoted when it holds a comma, a quote or a line break; a quote is doubled. */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * The CSV of `rows` with its header, CRLF line ends and a UTF-8 byte order mark, so a spreadsheet opens the Polish
 * and French letters (and the non-breaking spaces of French typography) correctly.
 */
export function toCsv(rows: readonly ExportRow[]): string {
  const lines = [EXPORT_COLUMNS.join(","), ...rows.map((row) => [row.key, row.pl, row.en, row.fr, row.de, row.status, row.params].map(field).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** `--ns show,header`: the namespaces to export, every one by default; an unknown one is an error. */
export function namespacesOf(raw: string | undefined, all: readonly Namespace[]): Namespace[] {
  if (raw === undefined || raw === "") return [...all];
  const asked = raw.split(",").map((name) => name.trim());
  const unknown = asked.filter((name) => !(all as readonly string[]).includes(name));
  if (unknown.length > 0) throw new Error(`Unknown namespace: ${unknown.join(", ")} (known: ${all.join(", ")})`);
  return asked as Namespace[];
}
