import { BOARD_CELLS } from "../games/board";
import type { ChooseMoveInput, MoveChoice } from "./choose-move";
import { chooseLevel1 } from "./level1";
import type { EngineBoard, Side } from "./patterns";
import {
  BOUND_EXACT,
  BOUND_LOWER,
  BOUND_UPPER,
  TT_MAX_DEPTH,
  TranspositionTable,
  type Bound,
} from "./transposition-table";

/** Score of a won position; a win in `n` plies scores `WIN_SCORE - n`. */
export const WIN_SCORE = 10_000_000;
/** Scores beyond this are forced wins or losses. */
export const MATE_BOUND = WIN_SCORE - 1000;
/** Moves searched per node (spec: 12 per node, 20 at the root). */
export const NODE_WIDTH = 12;
export const ROOT_WIDTH = 20;
/** Time and stop flag are read every this many nodes (spec: co 1024 węzły). */
export const CHECK_INTERVAL = 1024;

type StopReason = Exclude<MoveChoice["stoppedBy"], "completed">;

/**
 * Level 2 (spec, „Silnik”): negamax with alpha-beta and iterative deepening from 1 to `maxDepth`.
 * Candidates within radius 2, ordered by the TT move and the pattern value, at most 12 per node
 * (20 at the root). An immediate win ends a node; an opponent's four leaves only the block and
 * does not use up depth (an extension instead of a cut, also below the horizon). Bounded
 * transposition table with Zobrist keys. Safety rule: when no iteration completes, the move of
 * level 1. Expects a board with at least one stone and one empty cell.
 */
export function searchLevel2(board: EngineBoard, side: Side, input: ChooseMoveInput): MoveChoice {
  return new Search(board, side, input).run();
}

class Search {
  readonly #board: EngineBoard;
  readonly #side: Side;
  readonly #input: ChooseMoveInput;
  readonly #table: TranspositionTable;
  readonly #start: number;
  // Per-ply buffers, allocated on first use: the search never allocates per node. Forced blocks
  // extend the search past `maxDepth`, but every ply adds a stone, so a full board ends it.
  readonly #moves: Int16Array[] = [];
  readonly #values: Float64Array[] = [];
  #nodes = 0;
  #stopped: StopReason | null = null;
  #hasResult = false;
  #age = 0;

  constructor(board: EngineBoard, side: Side, input: ChooseMoveInput) {
    this.#board = board;
    this.#side = side;
    this.#input = input;
    this.#table = new TranspositionTable(input.budget.ttBytes);
    this.#start = input.now();
  }

  run(): MoveChoice {
    const board = this.#board;
    const side = this.#side;
    const buffer = this.#buffer(0);
    if (board.winningCells(side, buffer, 1) === 1) {
      return { cell: buffer[0]!, depth: 0, nodes: 0, score: WIN_SCORE - 1, reason: "win", stoppedBy: "completed" };
    }
    const threats = board.winningCells((1 - side) as Side, buffer, BOARD_CELLS);
    if (threats > 0) {
      const cell = this.#best(buffer, threats);
      const score = threats > 1 ? -(WIN_SCORE - 2) : 0;
      return { cell, depth: 0, nodes: 0, score, reason: "block", stoppedBy: "completed" };
    }

    const rootMoves = this.#rootMoves();
    const maxDepth = Math.min(this.#input.budget.maxDepth, TT_MAX_DEPTH);
    let result: MoveChoice | null = null;
    let stoppedBy: MoveChoice["stoppedBy"] = "completed";
    for (let depth = 1; depth <= maxDepth; depth++) {
      this.#age = depth;
      const found = this.#searchRoot(rootMoves, depth);
      if (found === null) break;
      result = { cell: found.cell, depth, nodes: this.#nodes, score: found.score, reason: "search", stoppedBy: "completed" };
      this.#hasResult = true;
      this.#input.onIteration?.(result);
      if (Math.abs(found.score) >= MATE_BOUND) break;
      if (depth < maxDepth && this.#input.now() - this.#start >= this.#input.budget.softMs) {
        stoppedBy = "soft";
        break;
      }
    }
    stoppedBy = this.#stopped ?? stoppedBy;
    if (result === null) {
      const fallback = chooseLevel1(board, side, this.#input.rng);
      return { ...fallback, nodes: this.#nodes, stoppedBy };
    }
    return { ...result, nodes: this.#nodes, stoppedBy };
  }

  /** Root candidates ordered by value; equal values are ordered by `rng` (ties at the root). */
  #rootMoves(): number[] {
    const board = this.#board;
    const buffer = this.#buffer(0);
    const count = board.candidates(buffer);
    const scored: { cell: number; value: number; tie: number }[] = [];
    for (let index = 0; index < count; index++) {
      const cell = buffer[index]!;
      scored.push({ cell, value: board.cellValue(cell, this.#side, 1), tie: this.#input.rng() });
    }
    scored.sort((a, b) => b.value - a.value || a.tie - b.tie);
    return scored.slice(0, ROOT_WIDTH).map((entry) => entry.cell);
  }

  /** One iteration over the root moves; the best move goes first in the next one. Null when stopped. */
  #searchRoot(rootMoves: number[], depth: number): { cell: number; score: number } | null {
    const board = this.#board;
    let alpha = -Infinity;
    let bestIndex = 0;
    for (let index = 0; index < rootMoves.length; index++) {
      const cell = rootMoves[index]!;
      board.place(cell, this.#side);
      const score = -this.#negamax(depth - 1, -Infinity, -alpha, 1);
      board.remove(cell);
      if (this.#stopped !== null) return null;
      if (score > alpha) {
        alpha = score;
        bestIndex = index;
      }
    }
    const [cell] = rootMoves.splice(bestIndex, 1);
    rootMoves.unshift(cell!);
    return { cell: cell!, score: alpha };
  }

  #negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if (this.#shouldAbort()) return 0;
    this.#nodes++;
    const board = this.#board;
    const side = ((this.#side + ply) & 1) as Side;
    const opponent = (1 - side) as Side;
    // No need to look for an own immediate win here: the parent either won itself or, facing our
    // four, played its only block (two blocks needed → it scored the loss without moving), and the
    // root checks both before searching.
    if (board.stones === BOARD_CELLS) return 0;

    const table = this.#table;
    const slot = table.probe(board.hashHi, board.hashLo);
    let ttMove = -1;
    if (slot !== -1) {
      ttMove = table.moveAt(slot);
      if (depth > 0 && table.depthAt(slot) >= depth) {
        const stored = fromTableScore(table.scoreAt(slot), ply);
        const bound = table.boundAt(slot);
        if (bound === BOUND_EXACT) return stored;
        if (bound === BOUND_LOWER) alpha = Math.max(alpha, stored);
        else beta = Math.min(beta, stored);
        if (alpha >= beta) return stored;
      }
    }

    const moves = this.#buffer(ply);
    const forced = board.fours[opponent] > 0;
    let count: number;
    let childDepth: number;
    if (forced) {
      if (board.winningCells(opponent, moves, 2) > 1) return -(WIN_SCORE - (ply + 2));
      count = 1;
      childDepth = depth;
    } else {
      if (depth <= 0) return board.score[side] - board.score[opponent];
      count = this.#orderedMoves(ply, side, ttMove);
      childDepth = depth - 1;
    }

    const alphaStart = alpha;
    let best = -Infinity;
    let bestMove = moves[0]!;
    for (let index = 0; index < count; index++) {
      const cell = moves[index]!;
      board.place(cell, side);
      const score = -this.#negamax(childDepth, -beta, -alpha, ply + 1);
      board.remove(cell);
      if (this.#stopped !== null) return 0;
      if (score > best) {
        best = score;
        bestMove = cell;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
    }
    if (depth > 0) {
      const bound: Bound = best <= alphaStart ? BOUND_UPPER : best >= beta ? BOUND_LOWER : BOUND_EXACT;
      table.store(board.hashHi, board.hashLo, depth, bound, toTableScore(best, ply), bestMove, this.#age);
    }
    return best;
  }

  /** The `NODE_WIDTH` best candidates of the node into its move buffer, the TT move first. */
  #orderedMoves(ply: number, side: Side, ttMove: number): number {
    const board = this.#board;
    const moves = this.#moves[ply]!;
    const values = (this.#values[ply] ??= new Float64Array(BOARD_CELLS));
    const count = board.candidates(moves);
    for (let index = 0; index < count; index++) {
      const cell = moves[index]!;
      values[index] = cell === ttMove ? Infinity : board.cellValue(cell, side, 1);
    }
    const width = Math.min(NODE_WIDTH, count);
    for (let target = 0; target < width; target++) {
      let top = target;
      for (let index = target + 1; index < count; index++) {
        if (values[index]! > values[top]!) top = index;
      }
      const cell = moves[top]!;
      moves[top] = moves[target]!;
      moves[target] = cell;
      const value = values[top]!;
      values[top] = values[target]!;
      values[target] = value;
    }
    return width;
  }

  #buffer(ply: number): Int16Array {
    return (this.#moves[ply] ??= new Int16Array(BOARD_CELLS));
  }

  /** Node limit at every node; time and the stop flag every `CHECK_INTERVAL` nodes. */
  #shouldAbort(): boolean {
    const { budget, now, shouldStop } = this.#input;
    if (budget.maxNodes !== undefined && this.#nodes >= budget.maxNodes) {
      this.#stopped = "nodes";
    } else if (this.#nodes % CHECK_INTERVAL === 0) {
      const elapsed = now() - this.#start;
      if (shouldStop?.()) this.#stopped = "stop";
      else if (elapsed >= budget.ceilingMs) this.#stopped = "ceiling";
      else if (this.#hasResult && elapsed >= budget.softMs) this.#stopped = "soft";
    }
    return this.#stopped !== null;
  }

  /** Of the cells in `buffer`, the one with the highest pattern value. */
  #best(buffer: Int16Array, count: number): number {
    let best = buffer[0]!;
    let bestValue = -Infinity;
    for (let index = 0; index < count; index++) {
      const value = this.#board.cellValue(buffer[index]!, this.#side, 1);
      if (value > bestValue) {
        bestValue = value;
        best = buffer[index]!;
      }
    }
    return best;
  }
}

/** Mate scores are stored relative to the node, so a transposition at another ply stays correct. */
export function toTableScore(score: number, ply: number): number {
  if (score >= MATE_BOUND) return score + ply;
  if (score <= -MATE_BOUND) return score - ply;
  return score;
}

export function fromTableScore(score: number, ply: number): number {
  if (score >= MATE_BOUND) return score - ply;
  if (score <= -MATE_BOUND) return score + ply;
  return score;
}
