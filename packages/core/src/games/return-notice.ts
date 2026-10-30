// "Wróciłeś do partii" (#24 Q2): when the notice is due after a player comes back to the tab.

/** Away for longer than this and the player is told they are back; shorter absences pass silently. */
export const RETURN_NOTICE_THRESHOLD_MS = 30 * 1000;

/**
 * Whether the notice is due: the tab was hidden at `hiddenAtMs` and is visible again at `returnedAtMs`
 * (both on the same clock). Strictly longer than the threshold; a clock set back (negative absence)
 * never shows it.
 */
export function shouldShowReturnNotice({
  hiddenAtMs,
  returnedAtMs,
  thresholdMs = RETURN_NOTICE_THRESHOLD_MS,
}: {
  hiddenAtMs: number | null;
  returnedAtMs: number;
  thresholdMs?: number;
}): boolean {
  if (hiddenAtMs === null) return false;
  return returnedAtMs - hiddenAtMs > thresholdMs;
}

/** The notice is only worth showing while it is news: a read finishing later than this after the return is too late. */
export const RETURN_NOTICE_WINDOW_MS = 10 * 1000;

/**
 * Whether a successful read finished soon enough after the return (`returnedAtMs`) for the notice to
 * still be accurate: at most `windowMs` later, boundary included. A clock set back counts as fresh.
 */
export function isReturnNoticeFresh({
  returnedAtMs,
  readAtMs,
  windowMs = RETURN_NOTICE_WINDOW_MS,
}: {
  returnedAtMs: number;
  readAtMs: number;
  windowMs?: number;
}): boolean {
  return readAtMs - returnedAtMs <= windowMs;
}
