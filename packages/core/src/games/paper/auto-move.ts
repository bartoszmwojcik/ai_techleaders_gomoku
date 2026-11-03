import { indexStones, isOnBoard, refusalIn } from "./board";
import type { PaperStone } from "./board";
import { PAPER_BOARD_SIZE } from "./constants";

/**
 * The cell the automat plays for a player who ran out of time (BR-50): the nearest free legal
 * cells around `around` (the opponent's last stone) — Chebyshev rings 1, 2, … — one of the
 * first non-empty ring picked with `random`. Cells are listed in a fixed order (row, column),
 * so the choice depends only on `random`. `null` when the sheet is full.
 */
export function pickAutoMove(
  stones: readonly PaperStone[],
  around: { x: number; y: number },
  random: () => number,
): { x: number; y: number } | null {
  const index = indexStones(stones);
  for (let ring = 1; ring < PAPER_BOARD_SIZE; ring += 1) {
    const cells: { x: number; y: number }[] = [];
    for (let y = around.y - ring; y <= around.y + ring; y += 1) {
      for (let x = around.x - ring; x <= around.x + ring; x += 1) {
        if (Math.max(Math.abs(x - around.x), Math.abs(y - around.y)) !== ring) continue;
        if (isOnBoard(x, y) && refusalIn(index, x, y) === null) cells.push({ x, y });
      }
    }
    if (cells.length > 0) return cells[Math.min(Math.floor(random() * cells.length), cells.length - 1)]!;
  }
  return null;
}
