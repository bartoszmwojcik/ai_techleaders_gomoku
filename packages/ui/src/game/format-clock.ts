/** Formats milliseconds as m:ss for a game clock; negative values show 0:00. */
export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** ISO 8601 duration for the datetime attribute of a time element, e.g. PT9M41S. */
export function clockDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `PT${Math.floor(totalSeconds / 60)}M${totalSeconds % 60}S`;
}
