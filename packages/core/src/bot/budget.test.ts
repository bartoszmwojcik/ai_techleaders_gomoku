import { describe, expect, it } from "vitest";

import {
  BOT_LOW_CLOCK_MS,
  BOT_MEMORY_MB_MAX,
  DEFAULT_BOT_TIME_LIMITS,
  botStrengthFor,
  budgetFor,
  clampBotMemoryMb,
} from "./budget";

const MB = 1024 * 1024;
const limits = DEFAULT_BOT_TIME_LIMITS;

describe("clampBotMemoryMb", () => {
  it("keeps whole megabytes inside the smallint column", () => {
    expect(clampBotMemoryMb(767.9)).toBe(767);
    expect(clampBotMemoryMb(BOT_MEMORY_MB_MAX)).toBe(32_767);
    expect(clampBotMemoryMb(1_000_000)).toBe(32_767);
  });

  it("reads nothing sensible as no memory", () => {
    expect(clampBotMemoryMb(0)).toBe(0);
    expect(clampBotMemoryMb(-5)).toBe(0);
    expect(clampBotMemoryMb(Number.NaN)).toBe(0);
    expect(clampBotMemoryMb(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("botStrengthFor", () => {
  it("refuses below the lowest tier (R7)", () => {
    expect(botStrengthFor(2, 255.9)).toBeNull();
    expect(botStrengthFor(1, 100)).toBeNull();
  });

  it("freezes the memory and the depth limit of level 2 at every boundary (R7)", () => {
    expect(botStrengthFor(2, 256)).toEqual({ level: 2, memoryMb: 256, depthCap: 6 });
    expect(botStrengthFor(2, 768)).toEqual({ level: 2, memoryMb: 768, depthCap: 8 });
    expect(botStrengthFor(2, 1536)).toEqual({ level: 2, memoryMb: 1536, depthCap: 10 });
    expect(botStrengthFor(2, 3072)).toEqual({ level: 2, memoryMb: 3072, depthCap: 12 });
    expect(botStrengthFor(2, 64_000)).toEqual({ level: 2, memoryMb: 32_767, depthCap: 12 });
  });

  it("stores no memory for level 1 (R9)", () => {
    expect(botStrengthFor(1, 4096)).toEqual({ level: 1, memoryMb: null, depthCap: null });
  });
});

describe("budgetFor", () => {
  it("gives level 2 the R6 times and the table of its tier while the clock is long", () => {
    expect(budgetFor({ level: 2, memoryMb: 768, depthCap: 8, remainingClockMs: 600_000, limits })).toEqual({
      level: 2,
      budget: { softMs: 1500, ceilingMs: 3000, maxDepth: 8, ttBytes: 16 * MB },
    });
    expect(budgetFor({ level: 2, memoryMb: 4000, depthCap: 12, remainingClockMs: 600_000, limits }).budget.ttBytes).toBe(64 * MB);
  });

  it("cuts the times to a thirtieth and a tenth of the clock (R6)", () => {
    expect(budgetFor({ level: 2, memoryMb: 768, depthCap: 8, remainingClockMs: 15_000, limits }).budget).toMatchObject({
      softMs: 500,
      ceilingMs: 1500,
    });
    expect(budgetFor({ level: 1, memoryMb: null, depthCap: null, remainingClockMs: 1_200, limits })).toEqual({
      level: 1,
      budget: { softMs: 40, ceilingMs: 120, maxDepth: 1, ttBytes: 0 },
    });
  });

  it("plays level 1 under a second on the clock, and never a negative time (R6)", () => {
    expect(budgetFor({ level: 2, memoryMb: 768, depthCap: 8, remainingClockMs: BOT_LOW_CLOCK_MS, limits }).level).toBe(2);
    expect(budgetFor({ level: 2, memoryMb: 768, depthCap: 8, remainingClockMs: BOT_LOW_CLOCK_MS - 1, limits })).toEqual({
      level: 1,
      budget: { softMs: 33, ceilingMs: 99, maxDepth: 1, ttBytes: 0 },
    });
    expect(budgetFor({ level: 2, memoryMb: 768, depthCap: 8, remainingClockMs: -50, limits }).budget).toMatchObject({
      softMs: 0,
      ceilingMs: 0,
    });
  });

  it("takes the configured limits, not the defaults", () => {
    const custom = { 1: { softMs: 10, ceilingMs: 20 }, 2: { softMs: 700, ceilingMs: 900 } };
    expect(budgetFor({ level: 2, memoryMb: 300, depthCap: 6, remainingClockMs: 600_000, limits: custom }).budget).toEqual({
      softMs: 700,
      ceilingMs: 900,
      maxDepth: 6,
      ttBytes: 8 * MB,
    });
  });

  it("falls back to the lowest tier for a level-2 seat stored without parameters", () => {
    expect(budgetFor({ level: 2, memoryMb: null, depthCap: null, remainingClockMs: 600_000, limits }).budget).toMatchObject({
      maxDepth: 6,
      ttBytes: 8 * MB,
    });
    expect(budgetFor({ level: 2, memoryMb: 100, depthCap: 7, remainingClockMs: 600_000, limits }).budget).toMatchObject({
      maxDepth: 7,
      ttBytes: 8 * MB,
    });
  });
});
