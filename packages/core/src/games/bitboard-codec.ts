import { BOARD_CELLS, hasStone, isCell, createBitboard, type Bitboard } from "./board";

/**
 * Border with the database (#22 Q3): PostgreSQL `bit(225)` travels as a 225-character
 * string of `0`/`1`, character `c` being cell `c` (as `get_bit` reads it); the move log is a
 * `bytea` with one byte per move. The rest of `core` never sees strings.
 */
export function encodeBitboard(board: Bitboard): string {
  let bits = "";
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    bits += hasStone(board, cell) ? "1" : "0";
  }
  return bits;
}

/** @throws Error when the string is not exactly 225 characters of `0` and `1` */
export function decodeBitboard(bits: string): Bitboard {
  if (bits.length !== BOARD_CELLS || !/^[01]+$/.test(bits)) {
    throw new Error("A bitboard is 225 characters of 0 and 1");
  }
  const board = createBitboard();
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    if (bits[cell] === "1") board[cell >> 3]! |= 1 << (cell & 7);
  }
  return board;
}

export function encodeMoves(cells: readonly number[]): Uint8Array {
  if (cells.length > BOARD_CELLS || !cells.every(isCell)) {
    throw new Error("A move log holds at most 225 cells of the board");
  }
  return Uint8Array.from(cells);
}

/** @throws Error when the log is longer than the board or a byte is not a cell */
export function decodeMoves(bytes: Uint8Array): number[] {
  const cells = Array.from(bytes);
  if (cells.length > BOARD_CELLS || !cells.every(isCell)) {
    throw new Error("A move log holds at most 225 cells of the board");
  }
  return cells;
}

