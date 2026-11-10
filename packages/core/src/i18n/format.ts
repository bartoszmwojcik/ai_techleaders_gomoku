import type { Locale } from "./locales";

/**
 * Dates are always printed in one fixed zone, whatever the language, so the server and the browser produce the same
 * text (no hydration mismatch, #85). Only the language of the words changes.
 */
export const DISPLAY_TIME_ZONE = "Europe/Warsaw";

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** A table size: "16 MB" in Polish, English and German, "16 Mo" in French. */
export function formatMegabytes(locale: Locale, value: number): string {
  return formatNumber(locale, value, { style: "unit", unit: "megabyte", unitDisplay: "short" });
}

/** A date and time in the display zone; the caller picks the parts, the zone cannot be overridden. */
export function formatDateTime(
  locale: Locale,
  date: Date,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone"> = { dateStyle: "medium", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: DISPLAY_TIME_ZONE }).format(date);
}
