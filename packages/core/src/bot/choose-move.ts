import { BOARD_CELLS, type Bitboard } from "../games/board";
import { BOARD_SIZE } from "../games/rules";
import { chooseLevel1 } from "./level1";
import { searchLevel2 } from "./level2";
import { CENTER, EngineBoard, type Side } from "./patterns";

/** Strength of the bot (BR-55): 1 = pattern heuristic, 2 = negamax search. */
export type BotLevel = 1 | 2;

/** A classic position; the colour to move follows from the parity of `moveCount` (black first). */
export type BotPosition = { black: Bitboard; white: Bitboard; moveCount: number };

export type SearchBudget = {
  /** Soft target: after it the current iteration ends, but only when a result already exists. */
  softMs: number;
  /** Ceiling: never exceeded (the worker is also killed from outside; the engine checks itself). */
  ceilingMs: number;
  /** Depth limit (from the RAM threshold). */
  maxDepth: number;
  /** Size of the transposition table in bytes (from the RAM threshold). */
  ttBytes: number;
  /** Deterministic node limit instead of time (tests, arena). */
  maxNodes?: number;
};

export type MoveChoice = {
  cell: number;
  depth: number;
  nodes: number;
  score: number;
  reason: "opening" | "win" | "block" | "heuristic" | "search";
  stoppedBy: "completed" | "soft" | "ceiling" | "nodes" | "stop";
};

export type ChooseMoveInput = {
  position: BotPosition;
  level: BotLevel;
  budget: SearchBudget;
  rng: () => number;
  now: () => number;
  /** Stop flag (a `SharedArrayBuffer` in the worker). */
  shouldStop?: () => boolean;
  /** Every completed iteration of level 2; the last one is the fallback move. */
  onIteration?: (partial: MoveChoice) => void;
};

/** The eight neighbours of the centre: white's reply to a black stone there. */
const CENTER_NEIGHBOURS = [-BOARD_SIZE - 1, -BOARD_SIZE, -BOARD_SIZE + 1, -1, 1, BOARD_SIZE - 1, BOARD_SIZE, BOARD_SIZE + 1].map(
  (offset) => CENTER + offset,
);

/**
 * The bot's move (spec 2026-11-05-hosted-bot, „Silnik”): a pure function — time and randomness are
 * injected. Never returns an occupied cell; freestyle rules (five or more win). The service never
 * calls it on a full board (`applyMove` ends the game with a draw first).
 * @throws Error when the board has no empty cell
 */
export function chooseMove(input: ChooseMoveInput): MoveChoice {
  const { position, level, rng } = input;
  const board = EngineBoard.fromBitboards(position.black, position.white);
  if (board.stones >= BOARD_CELLS) throw new Error("The board is full");
  const side = (position.moveCount % 2) as Side;
  if (board.stones === 0) return opening(CENTER);
  if (board.stones === 1 && board.cells[CENTER] !== 0) {
    return opening(CENTER_NEIGHBOURS[Math.floor(rng() * CENTER_NEIGHBOURS.length)]!);
  }
  return level === 1 ? chooseLevel1(board, side, rng) : searchLevel2(board, side, input);
}

function opening(cell: number): MoveChoice {
  return { cell, depth: 0, nodes: 0, score: 0, reason: "opening", stoppedBy: "completed" };
}
