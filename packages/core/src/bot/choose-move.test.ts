import { describe, expect, it } from "vitest";

import { BOARD_CELLS, cellOf, createBitboard, hasStone, withStone, type Bitboard } from "../games/board";
import { chooseMove, type BotLevel, type BotPosition, type SearchBudget } from "./choose-move";
import { CENTER } from "./patterns";
import { createRng } from "./seed";

const BUDGET: SearchBudget = { softMs: 1e9, ceilingMs: 1e9, maxDepth: 3, ttBytes: 1 << 16, maxNodes: 2000 };

function position(black: [number, number][], white: [number, number][], moveCount = black.length + white.length): BotPosition {
  const board = (stones: [number, number][]) =>
    stones.reduce<Bitboard>((bits, [x, y]) => withStone(bits, cellOf(x, y)), createBitboard());
  return { black: board(black), white: board(white), moveCount };
}

function choose(pos: BotPosition, level: BotLevel, rng = createRng(1)) {
  return chooseMove({ position: pos, level, budget: BUDGET, rng, now: () => 0 });
}

describe("chooseMove openings", () => {
  it.each([1, 2] as const)("level %i opens in the centre", (level) => {
    expect(choose(position([], []), level)).toEqual({
      cell: CENTER,
      depth: 0,
      nodes: 0,
      score: 0,
      reason: "opening",
      stoppedBy: "completed",
    });
  });

  it("answers a black centre with a neighbour of the centre drawn by rng", () => {
    const pos = position([[7, 7]], []);
    expect(choose(pos, 2, () => 0).cell).toBe(cellOf(6, 6));
    expect(choose(pos, 1, () => 0.999).cell).toBe(cellOf(8, 8));
    expect(choose(pos, 2, () => 0.5).reason).toBe("opening");
  });

  it("answers a first stone off the centre by the level's own rules", () => {
    const choice = choose(position([[0, 0]], []), 1);
    expect(choice.reason).toBe("heuristic");
    expect(choice.cell).not.toBe(0);
  });
});

describe("chooseMove rules", () => {
  it("refuses a full board", () => {
    const full = new Uint8Array(createBitboard().length).fill(0xff);
    expect(() =>
      chooseMove({ position: { black: full, white: createBitboard(), moveCount: BOARD_CELLS }, level: 1, budget: BUDGET, rng: () => 0, now: () => 0 }),
    ).toThrow("The board is full");
  });

  it.each([1, 2] as const)("level %i takes the colour to move from the parity of moveCount", (level) => {
    // Both colours have an open four; white is to move (odd count) and wins on its own row.
    const pos = position(
      [
        [3, 7],
        [4, 7],
        [5, 7],
        [6, 7],
        [0, 14],
      ],
      [
        [3, 3],
        [4, 3],
        [5, 3],
        [6, 3],
      ],
    );
    const choice = choose(pos, level);
    expect(choice.reason).toBe("win");
    expect([cellOf(2, 3), cellOf(7, 3)]).toContain(choice.cell);
  });

  it.each([1, 2] as const)("level %i never returns an occupied cell", (level) => {
    const rng = createRng(99);
    for (let game = 0; game < 3; game++) {
      let black = createBitboard();
      let white = createBitboard();
      for (let moveCount = 0; moveCount < 30; moveCount++) {
        const choice = chooseMove({ position: { black, white, moveCount }, level, budget: { ...BUDGET, maxNodes: 300 }, rng, now: () => 0 });
        expect(hasStone(black, choice.cell) || hasStone(white, choice.cell)).toBe(false);
        if (moveCount % 2 === 0) black = withStone(black, choice.cell);
        else white = withStone(white, choice.cell);
      }
    }
  });
});
