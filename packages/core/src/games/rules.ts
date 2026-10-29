// Freestyle gomoku rules (no renju restrictions) — see .ai/specs/product-brief.md.
import type { GameColor, Seat } from "./types";

export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;

/** The four line directions as `[dx, dy]`: horizontal, vertical, both diagonals. */
const AXES = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** Black moves first: move numbers are 1-based, so `moveCount` stones mean white is next after an odd count. */
export function turnColor(moveCount: number): GameColor {
  return moveCount % 2 === 0 ? "black" : "white";
}

/** Seat that makes move number `moveCount + 1`, given the seat playing black (#22 Q1). */
export function seatOnTurn(moveCount: number, blackSeat: Seat): Seat {
  const blackToMove = turnColor(moveCount) === "black";
  if (blackToMove) return blackSeat;
  return blackSeat === 1 ? 2 : 1;
}

/**
 * Win detection around the stone just placed on `cell` (#22): for each axis the run is
 * `1 + forward + backward`, each side looking at most `WIN_LENGTH - 1` cells. At most
 * 4 axes x 8 reads, whatever the board size or the number of moves. Walks coordinates, so
 * a line never wraps from the end of one row to the start of the next. Six or more in a
 * row win too (freestyle, #22 Q2).
 *
 * @param isOwn whether a cell holds a stone of the player who just moved
 * @returns the cells of the winning line (ascending, 5 to 9 of them) or `null`
 */
export function checkWin(
  isOwn: (cell: number) => boolean,
  cell: number,
): readonly number[] | null {
  const x = cell % BOARD_SIZE;
  const y = Math.floor(cell / BOARD_SIZE);
  for (const [dx, dy] of AXES) {
    const before = reach(isOwn, x, y, -dx, -dy);
    const after = reach(isOwn, x, y, dx, dy);
    if (before.length + 1 + after.length >= WIN_LENGTH) {
      return [...before, cell, ...after].sort((a, b) => a - b);
    }
  }
  return null;
}

/** Consecutive own cells from (x, y) in one direction, excluding the start, at most `WIN_LENGTH - 1`. */
function reach(
  isOwn: (cell: number) => boolean,
  x: number,
  y: number,
  dx: number,
  dy: number,
): number[] {
  const cells: number[] = [];
  for (let step = 1; step < WIN_LENGTH; step++) {
    const cx = x + dx * step;
    const cy = y + dy * step;
    if (cx < 0 || cy < 0 || cx >= BOARD_SIZE || cy >= BOARD_SIZE) break;
    const next = cy * BOARD_SIZE + cx;
    if (!isOwn(next)) break;
    cells.push(next);
  }
  return cells;
}
