import { describe, expect, it } from "vitest";

import { seedOf } from "./seed";
import { DEFAULT_BOT_TIME_LIMITS } from "./budget";
import { clipShowPause, showBotLimits, showPauseMs } from "./show-pause";

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

describe("clipShowPause (show-mode P9: min(pause, clock / 4))", () => {
  it("keeps the pause while the clock is ample", () => {
    expect(clipShowPause(2000, 600_000)).toBe(2000);
    expect(clipShowPause(2000, 8000)).toBe(2000);
  });

  it("cuts the pause to a quarter of the clock, in whole milliseconds, on a low clock", () => {
    expect(clipShowPause(2000, 7999)).toBe(1999);
    expect(clipShowPause(8000, 10_000)).toBe(2500);
    expect(clipShowPause(1500, 3)).toBe(0);
  });

  it("gives no pause for a clock run out (or below zero)", () => {
    expect(clipShowPause(2000, 0)).toBe(0);
    expect(clipShowPause(2000, -500)).toBe(0);
  });
});

describe("showBotLimits (SHOW_BOT_L2_SOFT_MS)", () => {
  it("gives level 2 the soft target and the ceiling min(BOT_L2_CEILING_MS, 2 x soft); level 1 unchanged", () => {
    expect(showBotLimits(DEFAULT_BOT_TIME_LIMITS, 1500)).toEqual({ 1: { softMs: 50, ceilingMs: 250 }, 2: { softMs: 1500, ceilingMs: 3000 } });
    expect(showBotLimits(DEFAULT_BOT_TIME_LIMITS, 1000)[2]).toEqual({ softMs: 1000, ceilingMs: 2000 });
    expect(showBotLimits(DEFAULT_BOT_TIME_LIMITS, 700)[2]).toEqual({ softMs: 700, ceilingMs: 1400 });
  });

  it("never goes over the ceiling of a normal game, and keeps the soft target under it", () => {
    expect(showBotLimits(DEFAULT_BOT_TIME_LIMITS, 2000)[2]).toEqual({ softMs: 2000, ceilingMs: 3000 });
    expect(showBotLimits(DEFAULT_BOT_TIME_LIMITS, 5000)[2]).toEqual({ softMs: 3000, ceilingMs: 3000 });
  });

  it("does not change the limits it is given", () => {
    const limits = { 1: { softMs: 50, ceilingMs: 250 }, 2: { softMs: 1500, ceilingMs: 3000 } };
    showBotLimits(limits, 700);
    expect(limits[2]).toEqual({ softMs: 1500, ceilingMs: 3000 });
  });
});
