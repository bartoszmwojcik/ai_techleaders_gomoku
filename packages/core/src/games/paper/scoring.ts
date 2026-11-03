import { cellKey, isOnBoard } from "./board";
import type { PaperStone } from "./board";
import { PAPER_FIVE } from "./constants";

/** One counted five: a stroke of the pencil from one end to the other. */
export type Five = { seat: 1 | 2; from: { x: number; y: number }; to: { x: number; y: number } };

export type PaperScore = { scores: [number, number]; fives: Five[] };

/** Horizontal, vertical, diagonal ↘ and diagonal ↗; each row starts at its smaller-x/y end. */
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/**
 * Score of the stones on the sheet (BR-48): per player, per direction, every maximal row of
 * `n` stones is worth ⌊n / 5⌋ points and a stone may belong to rows of all four directions.
 * Depends only on the set of stones, not on the order of the moves. `fives` cuts each scoring
 * row into consecutive fives from its end with the smaller coordinate.
 */
export function scoreGame(stones: readonly PaperStone[]): PaperScore {
  const own = new Map<number, 1 | 2>();
  for (const stone of stones) own.set(cellKey(stone.x, stone.y), stone.seat);
  const scores: [number, number] = [0, 0];
  const fives: Five[] = [];
  const has = (x: number, y: number, seat: 1 | 2) => isOnBoard(x, y) && own.get(cellKey(x, y)) === seat;

  for (const stone of stones) {
    const { x, y, seat } = stone;
    for (const [dx, dy] of DIRECTIONS) {
      // Count a row once, from its first stone.
      if (has(x - dx, y - dy, seat)) continue;
      let length = 1;
      while (has(x + dx * length, y + dy * length, seat)) length += 1;
      const count = Math.floor(length / PAPER_FIVE);
      scores[seat - 1]! += count;
      for (let k = 0; k < count; k += 1) {
        const start = k * PAPER_FIVE;
        fives.push({
          seat,
          from: { x: x + dx * start, y: y + dy * start },
          to: { x: x + dx * (start + PAPER_FIVE - 1), y: y + dy * (start + PAPER_FIVE - 1) },
        });
      }
    }
  }
  fives.sort((a, b) => a.seat - b.seat || a.from.y - b.from.y || a.from.x - b.from.x || a.to.x - b.to.x);
  return { scores, fives };
}
