/**
 * Dates shown to players are printed in one fixed zone, so the server and the browser produce the
 * same text (no hydration mismatch) whatever the zone of the device (#85).
 */
const ZONE = "Europe/Warsaw";

// The zone abbreviation comes from en-GB, which prints "CET"/"CEST" (en-US would print "GMT+1"), so it
// is correct in both seasons and identical on the server and in the browser.
const zoneName = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, timeZoneName: "short" });

function withZone(format: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(iso);
  const zone = zoneName.formatToParts(date).find((part) => part.type === "timeZoneName")!.value;
  return `${format.format(date)} ${zone}`;
}

const validUntilFormat = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONE,
});

/** "wtorek 27 października, 10:00 CET": the end of an invitation. */
export function formatValidUntil(iso: string): string {
  return withZone(validUntilFormat, iso);
}

const finishedDayFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONE,
});
const finishedTimeFormat = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONE,
});

/** "27 października 2026, 10:00 CET": the end of a game in the history. */
export function formatFinishedAt(iso: string): string {
  const date = new Date(iso);
  return `${finishedDayFormat.format(date)}, ${withZone(finishedTimeFormat, iso)}`;
}
