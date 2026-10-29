import { hasStone, isCell, withStone, BOARD_CELLS, type Bitboard } from "./board";
import { checkWin, seatOnTurn, turnColor } from "./rules";
import type { GameResult, Seat } from "./types";

export type MoveState = {
  black: Bitboard;
  white: Bitboard;
  moveCount: number;
  blackSeat: Seat;
};

export type MoveOutcome =
  | { ok: false; reason: "out_of_board" | "occupied" }
  | {
      ok: true;
      state: MoveState;
      /** The colour that just moved and the seat that played it. */
      color: "black" | "white";
      seat: Seat;
      /** `null` while the game goes on. */
      result: GameResult | null;
      winLine: readonly number[] | null;
    };

/**
 * Places the next stone (#22): a pure step of the game. A five wins even with the last,
 * 225th, stone; a full board without a five is a draw.
 */
export function applyMove(state: MoveState, cell: number): MoveOutcome {
  if (!isCell(cell)) return { ok: false, reason: "out_of_board" };
  if (hasStone(state.black, cell) || hasStone(state.white, cell)) {
    return { ok: false, reason: "occupied" };
  }
  const color = turnColor(state.moveCount);
  const seat = seatOnTurn(state.moveCount, state.blackSeat);
  const next: MoveState = {
    ...state,
    moveCount: state.moveCount + 1,
    [color]: withStone(state[color], cell),
  };
  const own = next[color];
  const winLine = checkWin((c) => hasStone(own, c), cell);
  let result: GameResult | null = null;
  if (winLine) result = { winnerSeat: seat, reason: "five_in_row" };
  else if (next.moveCount === BOARD_CELLS) result = { winnerSeat: null, reason: "draw" };
  return { ok: true, state: next, color, seat, result, winLine };
}
