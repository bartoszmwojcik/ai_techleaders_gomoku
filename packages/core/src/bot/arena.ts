import { BOARD_CELLS, createBitboard, hasStone, withStone, type Bitboard } from "../games/board";
import { checkWin } from "../games/rules";
import type { GameColor } from "../games/types";
import { chooseMove, type BotLevel, type MoveChoice, type SearchBudget } from "./choose-move";
import { rngFor } from "./seed";

/**
 * Budget of the R17 acceptance test (spec 2026-11-05-hosted-bot): a node limit instead of time,
 * so the result is the same on every machine. The time fields are never reached (`now` is fixed).
 */
export const ARENA_BUDGET: SearchBudget = {
  softMs: Number.MAX_SAFE_INTEGER,
  ceilingMs: Number.MAX_SAFE_INTEGER,
  maxDepth: 8,
  ttBytes: 1 << 20,
  maxNodes: 20_000,
};

/** R17 thresholds: level 2 scores at least 0.90 overall and 0.80 on each colour (draw = ½). */
export const R17_TOTAL = 0.9;
export const R17_PER_COLOUR = 0.8;

export type ArenaGame = {
  seed: number;
  /** Colour of level 2 in this game. */
  level2Colour: GameColor;
  winner: GameColor | null;
  moves: number[];
};

export type ColourScore = { games: number; score: number };

export type ArenaResult = {
  games: ArenaGame[];
  /** Level 2's points (win 1, draw ½) divided by the number of games. */
  total: number;
  byColour: Record<GameColor, ColourScore>;
  passed: boolean;
};

/**
 * One bot–bot game from an empty board. Move `n` draws from `rngFor("arena-<seed>", n)` (R16), so a
 * game is fully determined by its seed and the budget. The engine's moves are checked against the
 * game's own rules (`checkWin`) and an occupied cell is a defect.
 * @throws Error when an engine returns an occupied cell
 */
export function playArenaGame(seed: number, black: BotLevel, white: BotLevel, budget: SearchBudget): Omit<ArenaGame, "level2Colour"> {
  let boards: Record<GameColor, Bitboard> = { black: createBitboard(), white: createBitboard() };
  const moves: number[] = [];
  while (moves.length < BOARD_CELLS) {
    const colour: GameColor = moves.length % 2 === 0 ? "black" : "white";
    const choice: MoveChoice = chooseMove({
      position: { black: boards.black, white: boards.white, moveCount: moves.length },
      level: colour === "black" ? black : white,
      budget,
      rng: rngFor(`arena-${seed}`, moves.length + 1),
      now: () => 0,
    });
    if (hasStone(boards.black, choice.cell) || hasStone(boards.white, choice.cell)) {
      throw new Error(`Engine returned the occupied cell ${choice.cell}`);
    }
    boards = { ...boards, [colour]: withStone(boards[colour], choice.cell) };
    moves.push(choice.cell);
    const own = boards[colour];
    if (checkWin((cell) => hasStone(own, cell), choice.cell)) return { seed, winner: colour, moves };
  }
  return { seed, winner: null, moves };
}

/**
 * The R17 duel: games with seeds `1…count`; level 2 plays black on odd seeds and white on even
 * ones (50 + 50 for the full run of 100).
 */
export function runArena(count: number, budget: SearchBudget = ARENA_BUDGET, onGame?: (game: ArenaGame) => void): ArenaResult {
  const games: ArenaGame[] = [];
  for (let seed = 1; seed <= count; seed++) {
    const level2Colour: GameColor = seed % 2 === 1 ? "black" : "white";
    const played = playArenaGame(seed, level2Colour === "black" ? 2 : 1, level2Colour === "white" ? 2 : 1, budget);
    const game: ArenaGame = { ...played, level2Colour };
    games.push(game);
    onGame?.(game);
  }
  return { games, ...scoreArena(games) };
}

/** Level 2's score (win 1, draw ½, loss 0) overall and per colour, and the R17 verdict. */
export function scoreArena(games: readonly ArenaGame[]): Omit<ArenaResult, "games"> {
  const byColour: Record<GameColor, ColourScore> = { black: { games: 0, score: 0 }, white: { games: 0, score: 0 } };
  for (const game of games) {
    byColour[game.level2Colour].games++;
    byColour[game.level2Colour].score += game.winner === null ? 0.5 : game.winner === game.level2Colour ? 1 : 0;
  }
  const total = (byColour.black.score + byColour.white.score) / games.length;
  const passed =
    total >= R17_TOTAL &&
    (["black", "white"] as const).every((colour) => byColour[colour].score >= R17_PER_COLOUR * byColour[colour].games);
  return { total, byColour, passed };
}
