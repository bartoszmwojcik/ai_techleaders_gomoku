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

/** What the API tells a client about the offer (rematch spec, API Contracts). */
export type RematchView = {
  state: RematchStatus;
  /** Seat of the player who offered. */
  offeredBySeat: Seat;
  expiresAt: Date;
  /** The rematch game once accepted (`null` before, and after the cleanup deleted it). */
  gameId: string | null;
};

/** The offer columns of a `games` row. */
export type StoredRematchRow = {
  state: RematchState | null;
  offeredBySeat: Seat | null;
  expiresAt: Date | null;
  gameId: string | null;
};

/** The offer for the API, or `null` when there is none (the CHECKs keep the columns together). */
export function rematchView(row: StoredRematchRow, now: Date): RematchView | null {
  const state = rematchStatus(row, now);
  if (state === null) return null;
  return {
    state,
    offeredBySeat: row.offeredBySeat!,
    expiresAt: row.expiresAt!,
    gameId: row.gameId,
  };
}
