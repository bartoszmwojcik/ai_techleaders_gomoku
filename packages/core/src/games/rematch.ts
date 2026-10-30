// Rematch rules (rematch spec): pure functions, the time comes in as a parameter.
import type { RematchState, Seat } from "./types";

/** What a client is told about an offer: `expired` is a pending offer whose time is up. */
export type RematchStatus = RematchState | "expired";

/** The offer as stored in the finished game's row. */
export type StoredRematch = { state: RematchState | null; expiresAt: Date | null };

/**
 * Colours are swapped (rematch spec Q2): whoever played black plays white, no draw.
 * @param previousBlackSeat the seat that played black in the finished game
 */
export function rematchBlackSeat(previousBlackSeat: Seat): Seat {
  return previousBlackSeat === 1 ? 2 : 1;
}

/** Whether the offer can still be accepted or declined: pending and not yet expired. */
export function isRematchOpen(rematch: StoredRematch, now: Date): boolean {
  return (
    rematch.state === "pending" &&
    rematch.expiresAt !== null &&
    rematch.expiresAt.getTime() > now.getTime()
  );
}

/**
 * The offer as the UI sees it, or `null` when nobody offered. Expiry is lazy: a pending offer
 * past its time reads as `expired` (nothing runs in the background).
 */
export function rematchStatus(rematch: StoredRematch, now: Date): RematchStatus | null {
  if (rematch.state === null) return null;
  if (rematch.state === "pending" && !isRematchOpen(rematch, now)) return "expired";
  return rematch.state;
}
