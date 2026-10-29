import { BOARD_SIZE } from "./rules";

/** Cells of the 15x15 board; cell `c = y * 15 + x` (#22), the format of the public API. */
export const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
/** `ceil(225 / 8)` bytes per colour. */
export const BITBOARD_BYTES = Math.ceil(BOARD_CELLS / 8);

/** One colour's stones: bit `c` lives in byte `c >> 3` at position `c & 7`. */
export type Bitboard = Uint8Array;

export function createBitboard(): Bitboard {
  return new Uint8Array(BITBOARD_BYTES);
}

export function isCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < BOARD_CELLS;
}

export function cellOf(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

export function coordsOf(cell: number): { x: number; y: number } {
  return { x: cell % BOARD_SIZE, y: Math.floor(cell / BOARD_SIZE) };
}

export function hasStone(board: Bitboard, cell: number): boolean {
  return (board[cell >> 3]! & (1 << (cell & 7))) !== 0;
}

/** A copy with the stone set; the input is never mutated. */
export function withStone(board: Bitboard, cell: number): Bitboard {
  const copy = board.slice();
  copy[cell >> 3]! |= 1 << (cell & 7);
  return copy;
}

export function countStones(board: Bitboard): number {
  let count = 0;
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    if (hasStone(board, cell)) count++;
  }
  return count;
}

export type BoardState = {
  black: Bitboard;
  white: Bitboard;
  /** Cells of the moves in order; move `n` is `moves[n - 1]`, black plays the odd ones. */
  moves: readonly number[];
};

/**
 * The invariants of a board (#22): disjoint bitboards, black has as many stones as white or
 * one more, and `moves` is exactly the set of stones with the colour taken from the parity
 * of the move number. A violation is a defect, never a client error.
 * @throws Error describing the first violated invariant
 */
export function assertBoardConsistent({ black, white, moves }: BoardState): void {
  const blackCount = countStones(black);
  const whiteCount = countStones(white);
  if (blackCount + whiteCount !== moves.length) {
    throw new Error("Stone count differs from the number of moves");
  }
  if (blackCount - whiteCount !== (moves.length % 2)) {
    throw new Error("Black and white stones do not alternate");
  }
  const seen = new Set<number>();
  moves.forEach((cell, index) => {
    if (!isCell(cell) || seen.has(cell)) {
      throw new Error("Move log repeats a cell or leaves the board");
    }
    seen.add(cell);
    const [own, other] = index % 2 === 0 ? [black, white] : [white, black];
    if (!hasStone(own, cell) || hasStone(other, cell)) {
      throw new Error("Move log disagrees with the bitboards");
    }
  });
}
