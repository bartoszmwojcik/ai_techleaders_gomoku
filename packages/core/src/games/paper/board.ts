import { PAPER_BOARD_SIZE, PAPER_CENTER, PAPER_MAX_GAP } from "./constants";

/** A stone of the paper game; `auto` marks a stone put by the automat (BR-50). */
export type PaperStone = { x: number; y: number; seat: 1 | 2; auto: boolean };

export type PaperMoveRefusal = "OFF_BOARD" | "CELL_OCCUPIED" | "FIRST_MOVE_CENTER" | "MOVE_TOO_FAR";

export const cellKey = (x: number, y: number): number => y * PAPER_BOARD_SIZE + x;

export function isOnBoard(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < PAPER_BOARD_SIZE && y < PAPER_BOARD_SIZE;
}

/** Occupancy index of a stone list: cell → seat. */
export type PaperIndex = { size: number; seatAt: Map<number, 1 | 2> };

export function indexStones(stones: readonly PaperStone[]): PaperIndex {
  const seatAt = new Map<number, 1 | 2>();
  for (const stone of stones) seatAt.set(cellKey(stone.x, stone.y), stone.seat);
  return { size: stones.length, seatAt };
}

/** Why `(x, y)` is not a legal cell for the next stone, or `null` when it is (BR-47). */
export function refusalIn(index: PaperIndex, x: number, y: number): PaperMoveRefusal | null {
  if (!isOnBoard(x, y)) return "OFF_BOARD";
  if (index.seatAt.has(cellKey(x, y))) return "CELL_OCCUPIED";
  if (index.size === 0) return x === PAPER_CENTER && y === PAPER_CENTER ? null : "FIRST_MOVE_CENTER";
  for (let dy = -PAPER_MAX_GAP; dy <= PAPER_MAX_GAP; dy += 1) {
    for (let dx = -PAPER_MAX_GAP; dx <= PAPER_MAX_GAP; dx += 1) {
      if (isOnBoard(x + dx, y + dy) && index.seatAt.has(cellKey(x + dx, y + dy))) return null;
    }
  }
  return "MOVE_TOO_FAR";
}

export function refusal(stones: readonly PaperStone[], x: number, y: number): PaperMoveRefusal | null {
  return refusalIn(indexStones(stones), x, y);
}

/** Whether a stone may be placed at `(x, y)`. */
export function isAllowed(stones: readonly PaperStone[], x: number, y: number): boolean {
  return refusal(stones, x, y) === null;
}
