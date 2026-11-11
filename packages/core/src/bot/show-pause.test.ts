import { describe, expect, it } from "vitest";

import { seedOf } from "./seed";
import { showPauseMs } from "./show-pause";

const RANGE = { minMs: 1000, maxMs: 2000 };
const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

describe("showPauseMs (show-mode P9)", () => {
  it("stays within the range, in whole milliseconds, for many games and moves", () => {
    for (let game = 0; game < 20; game++) {
      for (let move = 1; move <= 60; move++) {
        const pause = showPauseMs(`game-${game}`, move, RANGE);
        expect(Number.isInteger(pause)).toBe(true);
        expect(pause).toBeGreaterThanOrEqual(1000);
        expect(pause).toBeLessThanOrEqual(2000);
      }
    }
  });

  it("is the same for the same game and move (a read after a restart waits for the same moment)", () => {
    expect(showPauseMs(GAME, 7, RANGE)).toBe(showPauseMs(GAME, 7, RANGE));
  });

  it("varies between moves and games, and does not follow the seed of the search", () => {
    const pauses = new Set(Array.from({ length: 30 }, (_, index) => showPauseMs(GAME, index + 1, RANGE)));
    expect(pauses.size).toBeGreaterThan(20);
    expect(showPauseMs("a", 1, RANGE)).not.toBe(showPauseMs("b", 1, RANGE));
    expect(showPauseMs(GAME, 3, RANGE)).not.toBe(1000 + (seedOf(GAME, 3) % 1001));
  });

  it("gives exactly the value of an empty range, also zero", () => {
    expect(showPauseMs(GAME, 1, { minMs: 1500, maxMs: 1500 })).toBe(1500);
    expect(showPauseMs(GAME, 1, { minMs: 0, maxMs: 0 })).toBe(0);
  });

  it("reaches both ends of a narrow range", () => {
    const pauses = new Set(Array.from({ length: 50 }, (_, index) => showPauseMs(GAME, index + 1, { minMs: 10, maxMs: 11 })));
    expect([...pauses].sort()).toEqual([10, 11]);
  });
});
