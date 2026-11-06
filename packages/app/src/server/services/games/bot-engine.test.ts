import { BOARD_CELLS, cellOf, createBitboard, withStone, type ChooseMoveInput, type MoveChoice } from "@gomoku/core";
import { describe, expect, it, vi } from "vitest";

import { createMainThreadBotEngine, firstFreeCell, MAIN_THREAD_BUDGET, type BotTurn } from "./bot-engine";

const CENTER = cellOf(7, 7);
const choice = (cell: number): MoveChoice => ({ cell, depth: 1, nodes: 1, score: 0, reason: "search", stoppedBy: "completed" });

function turn(extra: Partial<BotTurn> = {}): BotTurn {
  const black = withStone(createBitboard(), CENTER);
  return {
    position: { black, white: createBitboard(), moveCount: 1 },
    level: 2,
    depthCap: 8,
    memoryMb: 768,
    rng: () => 0.5,
    ...extra,
  };
}

describe("createMainThreadBotEngine (E13-S02)", () => {
  it("asks the engine with the fixed budget, the depth cap and the table of the memory tier", () => {
    const choose = vi.fn((_input: ChooseMoveInput) => choice(5));
    const now = () => 42;
    const engine = createMainThreadBotEngine({ choose, now });

    expect(engine.choose(turn())).toBe(5);

    const [input] = choose.mock.calls[0]!;
    expect(input).toMatchObject({ level: 2, now, budget: { ...MAIN_THREAD_BUDGET, maxDepth: 8, ttBytes: 16 * 1024 * 1024 } });
    expect(input.rng()).toBe(0.5);
  });

  it("gives a seat without parameters the smallest tier", () => {
    const choose = vi.fn((_input: ChooseMoveInput) => choice(5));
    createMainThreadBotEngine({ choose }).choose(turn({ level: 1, depthCap: null, memoryMb: null }));
    expect(choose.mock.calls[0]![0].budget).toMatchObject({ maxDepth: 6, ttBytes: 8 * 1024 * 1024 });
    createMainThreadBotEngine({ choose }).choose(turn({ memoryMb: 100 }));
    expect(choose.mock.calls[1]![0].budget.ttBytes).toBe(8 * 1024 * 1024);
  });

  it("falls back to level 1 when the search throws, and to the first free cell when that throws too", () => {
    const onlyLevel1 = vi.fn((input: ChooseMoveInput) => {
      if (input.level === 2) throw new Error("boom");
      return choice(9);
    });
    expect(createMainThreadBotEngine({ choose: onlyLevel1 }).choose(turn())).toBe(9);
    expect(onlyLevel1.mock.calls.map(([input]) => input.level)).toEqual([2, 1]);

    const broken = () => {
      throw new Error("boom");
    };
    expect(createMainThreadBotEngine({ choose: broken }).choose(turn())).toBe(0);
  });

  it("plays a legal move with the real engine on the main thread, by default", () => {
    const engine = createMainThreadBotEngine();
    for (const level of [1, 2] as const) {
      const cell = engine.choose(turn({ level }));
      expect(cell).not.toBe(CENTER);
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(BOARD_CELLS);
    }
  });
});

describe("firstFreeCell", () => {
  it("skips the stones of both colours and finds nothing on a full board", () => {
    const black = withStone(createBitboard(), 0);
    const white = withStone(createBitboard(), 1);
    expect(firstFreeCell({ black, white, moveCount: 2 })).toBe(2);
    let full = createBitboard();
    for (let cell = 0; cell < BOARD_CELLS; cell++) full = withStone(full, cell);
    expect(firstFreeCell({ black: full, white: createBitboard(), moveCount: BOARD_CELLS })).toBe(-1);
  });
});
