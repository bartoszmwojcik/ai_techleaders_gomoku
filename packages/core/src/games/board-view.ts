import { decodeBitboard, decodeMoves } from "./bitboard-codec";
import { hasStone } from "./board";
import { checkWin, seatOnTurn, turnColor } from "./rules";
import type { EndReason, GameStatus, Seat } from "./types";

/** The columns of a `games` row that make up the board, as the database returns them. */
export type BoardRow = {
  status: GameStatus;
  blackSeat: number | null;
  moveCount: number;
  /** `bit(225)` as a 225-character string. */
  stonesBlack: string;
  stonesWhite: string;
  /** `bytea`, one byte per move. */
  moves: Uint8Array;
  winnerSeat: number | null;
  endReason: EndReason | null;
};

/** What the API tells a client about the board (#22 API Contracts). */
export type BoardView = {
  moveCount: number;
  blackSeat: Seat | null;
  /** Seat to move; `null` unless the game is `active`. */
  turnSeat: Seat | null;
  /** Cells of the moves after the first `after` ones. */
  moves: number[];
  result: {
    winnerSeat: Seat | null;
    reason: EndReason;
    /** Cells of the winning line (ascending), only for `five_in_row`. */
    winLine: number[] | null;
  } | null;
};

/**
 * The board part of the game state for a client that already knows the first `after` moves.
 * The winning line is not stored: it is recomputed from the winner's bitboard and the last
 * move, which is cheap and needs no extra query (#22 Data Model).
 * @throws Error on a corrupt row (bitboard of the wrong shape, log with a non-cell)
 */
export function boardView(row: BoardRow, after: number): BoardView {
  const blackSeat = row.blackSeat as Seat | null;
  const moves = decodeMoves(row.moves);
  const turnSeat =
    row.status === "active" && blackSeat !== null ? seatOnTurn(row.moveCount, blackSeat) : null;
  let result: BoardView["result"] = null;
  if (row.status === "finished" && row.endReason) {
    result = {
      winnerSeat: row.winnerSeat as Seat | null,
      reason: row.endReason,
      winLine: row.endReason === "five_in_row" ? winLineOf(row, moves) : null,
    };
  }
  return {
    moveCount: row.moveCount,
    blackSeat,
    turnSeat,
    moves: moves.slice(after),
    result,
  };
}

function winLineOf(row: BoardRow, moves: number[]): number[] | null {
  const lastCell = moves[row.moveCount - 1]!;
  const own = decodeBitboard(
    turnColor(row.moveCount - 1) === "black" ? row.stonesBlack : row.stonesWhite,
  );
  const line = checkWin((cell) => hasStone(own, cell), lastCell);
  return line ? [...line] : null;
}
