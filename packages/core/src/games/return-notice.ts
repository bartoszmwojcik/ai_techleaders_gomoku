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
