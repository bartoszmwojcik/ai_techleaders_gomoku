/** A closed banner stays away for 7 days (BR-26, banner decision of 2026-10-26). */
export const BANNER_REOPEN_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = "gomoku:verify-email-banner-closed:";
const CHANGE_EVENT = "gomoku:verify-email-banner-change";

/** Per account (a technical id, no e-mail or name), so a second account in the browser still sees it. */
const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

/**
 * Same rule as the prototype (`bannerVisible`): visible when never closed, when the stored time is in
 * the future (a clock set back) or when 7 days have passed.
 */
export function isBannerVisible(closedAt: number | null, now: number): boolean {
  return closedAt === null || closedAt > now || now - closedAt >= BANNER_REOPEN_MS;
}

/** When the banner was closed; `null` when never, unreadable or storage is unavailable (= visible). */
export function readClosedAt(userId: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(keyFor(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Remembers the closing in this browser; returns `false` when storage refuses, so the caller can still hide it. */
export function rememberClosed(userId: string, now: number): boolean {
  try {
    window.localStorage.setItem(keyFor(userId), String(now));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

/** Calls `onChange` when the banner is closed here or in another tab. */
export function subscribeToBannerMemory(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
