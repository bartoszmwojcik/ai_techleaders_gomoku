import { DEFAULT_LOCALE, type Locale } from "@gomoku/core/i18n/locales";

/**
 * Dates shown to players are printed in one fixed zone, so the server and the browser produce the
 * same text (no hydration mismatch) whatever the zone of the device (#85). The language is the reader's (I15),
 * Polish by default for callers not yet migrated.
 */
const ZONE = "Europe/Warsaw";

// The zone abbreviation comes from en-GB, which prints "CET"/"CEST" (en-US would print "GMT+1"), so it
// is correct in both seasons and identical on the server and in the browser.
const zoneName = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, timeZoneName: "short" });

/** The `Intl` tag of each language: English dates in the British order, like the zone name. */
const TAGS: Readonly<Record<Locale, string>> = { pl: "pl-PL", en: "en-GB", fr: "fr-FR", de: "de-DE" };

const formats = new Map<string, Intl.DateTimeFormat>();

function formatOf(locale: Locale, kind: "validUntil" | "finishedDay" | "finishedTime"): Intl.DateTimeFormat {
  const id = `${locale}:${kind}`;
  let format = formats.get(id);
  if (!format) {
    const options: Intl.DateTimeFormatOptions =
      kind === "validUntil"
        ? { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
        : kind === "finishedDay"
          ? { day: "numeric", month: "long", year: "numeric" }
          : { hour: "2-digit", minute: "2-digit" };
    format = new Intl.DateTimeFormat(TAGS[locale], { ...options, timeZone: ZONE });
    formats.set(id, format);
  }
  return format;
}

function withZone(format: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(iso);
  const zone = zoneName.formatToParts(date).find((part) => part.type === "timeZoneName")!.value;
  return `${format.format(date)} ${zone}`;
}

/** "wtorek 27 października, 10:00 CET": the end of an invitation. */
export function formatValidUntil(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  return withZone(formatOf(locale, "validUntil"), iso);
}

/** "27 października 2026, 10:00 CET": the end of a game in the history. */
export function formatFinishedAt(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  const date = new Date(iso);
  return `${formatOf(locale, "finishedDay").format(date)}, ${withZone(formatOf(locale, "finishedTime"), iso)}`;
}
