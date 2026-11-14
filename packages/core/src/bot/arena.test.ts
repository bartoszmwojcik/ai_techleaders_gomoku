import { describe, expect, it } from "vitest";

import { BOARD_CELLS, createBitboard, hasStone, withStone } from "../games/board";
import { checkWin } from "../games/rules";
import { ARENA_BUDGET, R17_PER_COLOUR, R17_TOTAL, runArena, scoreArena, type ArenaGame } from "./arena";
import type { SearchBudget } from "./choose-move";

/** Small budget: the 4-game smoke run stays well under a second or two. */
const SMOKE: SearchBudget = { ...ARENA_BUDGET, maxDepth: 3, maxNodes: 400, ttBytes: 1 << 14 };

describe("runArena — 4-game smoke run", () => {
  const result = runArena(4, SMOKE);

  it("plays seeds 1…4 with level 2 alternating colours, black on odd seeds", () => {
    expect(result.games.map((game) => [game.seed, game.level2Colour])).toEqual([
      [1, "black"],
      [2, "white"],
      [3, "black"],
      [4, "white"],
    ]);
    expect(result.byColour.black.games).toBe(2);
    expect(result.byColour.white.games).toBe(2);
  });

  it("plays legal games whose winner made five or more in a row", () => {
    for (const game of result.games) {
      expect(new Set(game.moves).size).toBe(game.moves.length);
      let black = createBitboard();
      let white = createBitboard();
      game.moves.forEach((cell, index) => {
        if (index % 2 === 0) black = withStone(black, cell);
        else white = withStone(white, cell);
      });
      const last = game.moves.at(-1)!;
      const winnerBoard = game.moves.length % 2 === 1 ? black : white;
      if (game.winner === null) expect(game.moves).toHaveLength(BOARD_CELLS);
      else expect(checkWin((cell) => hasStone(winnerBoard, cell), last)).not.toBeNull();
    }
  });

  it("is deterministic for the same seeds and budget, and reports every game", () => {
    const reported: ArenaGame[] = [];
    expect(runArena(4, SMOKE, (game) => reported.push(game))).toEqual(result);
    expect(reported).toEqual(result.games);
  }, 30_000); // re-runs the whole arena; the 5s default is too tight when the full suite loads the machine

  it("scores level 2 consistently with the games", () => {
    expect(result).toMatchObject(scoreArena(result.games));
  });
});

describe("scoreArena", () => {
  const game = (level2Colour: ArenaGame["level2Colour"], winner: ArenaGame["winner"]): ArenaGame => ({
    seed: 0,
    level2Colour,
    winner,
    moves: [],
  });

  it("counts a win as 1, a draw as ½ and a loss as 0", () => {
    const score = scoreArena([game("black", "black"), game("black", null), game("white", "black"), game("white", "white")]);
    expect(score.byColour).toEqual({ black: { games: 2, score: 1.5 }, white: { games: 2, score: 1 } });
    expect(score.total).toBe(2.5 / 4);
    expect(score.passed).toBe(false);
  });

  it("passes R17 at exactly 0.90 overall and 0.80 on each colour", () => {
    expect([R17_TOTAL, R17_PER_COLOUR]).toEqual([0.9, 0.8]);
    // 10 games per colour: 10/10 on black and 8/10 on white = 0.90 overall.
    const games = [
      ...Array.from({ length: 10 }, () => game("black", "black")),
      ...Array.from({ length: 8 }, () => game("white", "white")),
      ...Array.from({ length: 2 }, () => game("white", "black")),
    ];
    expect(scoreArena(games)).toMatchObject({ total: 0.9, passed: true });
  });

  it("fails when one colour is below 0.80 even if the total reaches 0.90", () => {
    const games = [
      ...Array.from({ length: 20 }, () => game("black", "black")),
      ...Array.from({ length: 7 }, () => game("white", "white")),
      ...Array.from({ length: 3 }, () => game("white", "black")),
    ];
    expect(scoreArena(games)).toMatchObject({ total: 0.9, passed: false });
  });
});
