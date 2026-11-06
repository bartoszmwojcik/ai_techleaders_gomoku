import { BOARD_CELLS } from "../games/board";
import type { MoveChoice } from "./choose-move";
import type { EngineBoard, Side } from "./patterns";

/** Weight of the opponent's patterns in a cell's value (spec: `własne + 0,9 × przeciwnika`). */
export const LEVEL1_DEFENSE_FACTOR = 0.9;
/** Candidates within this fraction of the best value are drawn at random (spec: ≤ 10%). */
export const LEVEL1_TOLERANCE = 0.1;

/**
 * Level 1 (spec, „Silnik”): no search. An immediate win first, then a block of the opponent's
 * immediate win, otherwise a cell valued by its 5-cell windows, drawn by `rng` among the cells
 * within 10% of the best value. Expects a board with at least one stone and one empty cell.
 */
export function chooseLevel1(board: EngineBoard, side: Side, rng: () => number): MoveChoice {
  const candidates = new Int16Array(BOARD_CELLS);
  const count = board.candidates(candidates);
  const values = new Float64Array(count);
  let best = -Infinity;
  for (let index = 0; index < count; index++) {
    const value = board.cellValue(candidates[index]!, side, LEVEL1_DEFENSE_FACTOR);
    values[index] = value;
    if (value > best) best = value;
  }
  const opponent = (1 - side) as Side;
  let block = -1;
  for (let index = 0; index < count; index++) {
    const cell = candidates[index]!;
    if (board.winsAt(cell, side)) return choice(cell, values[index]!, "win");
    if (block === -1 && board.winsAt(cell, opponent)) block = index;
  }
  if (block !== -1) return choice(candidates[block]!, values[block]!, "block");
  const threshold = best * (1 - LEVEL1_TOLERANCE);
  const pool: number[] = [];
  for (let index = 0; index < count; index++) {
    if (values[index]! >= threshold) pool.push(index);
  }
  const picked = pool[Math.floor(rng() * pool.length)]!;
  return choice(candidates[picked]!, values[picked]!, "heuristic");
}

function choice(cell: number, score: number, reason: MoveChoice["reason"]): MoveChoice {
  return { cell, depth: 0, nodes: 0, score, reason, stoppedBy: "completed" };
}
