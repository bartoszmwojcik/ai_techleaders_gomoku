import type { GameResult, GameStatus, Seat } from "./types";

export type ResignOutcome =
  | { ok: true; result: GameResult }
  /** `finished` and `cancelled` games have nothing to resign; `waiting` has no opponent. */
  | { ok: false; reason: "finished" | "not_active" };

/**
 * Outcome of a resignation (resignation spec): only a running game can be resigned, the
 * opponent of `seat` wins with reason `resignation`. A pure step; locking and writing are the
 * service's job.
 */
export function resolveResignation(status: GameStatus, seat: Seat): ResignOutcome {
  if (status === "finished") return { ok: false, reason: "finished" };
  if (status !== "active") return { ok: false, reason: "not_active" };
  return { ok: true, result: { winnerSeat: seat === 1 ? 2 : 1, reason: "resignation" } };
}
