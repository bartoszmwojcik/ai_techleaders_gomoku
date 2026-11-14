import { describe, expect, it } from "vitest";

import { BOT_LEVELS, BOT_MIN_MEMORY_MB, botDisplayName, botStrengthOf, botTierOf, botViewOf, isBotLevel } from "./profile";

describe("bot profile", () => {
  it("offers two levels (BR-55)", () => {
    expect(BOT_LEVELS).toEqual([1, 2]);
    expect(isBotLevel(1)).toBe(true);
    expect(isBotLevel(2)).toBe(true);
    expect(isBotLevel(3)).toBe(false);
    expect(isBotLevel("1")).toBe(false);
  });

  it("maps the available memory onto the R7 tiers, with every boundary", () => {
    expect(botTierOf(BOT_MIN_MEMORY_MB - 1)).toBeNull();
    expect(botTierOf(256)).toEqual({ ttMb: 8, depthCap: 6 });
    expect(botTierOf(767)).toEqual({ ttMb: 8, depthCap: 6 });
    expect(botTierOf(768)).toEqual({ ttMb: 16, depthCap: 8 });
    expect(botTierOf(1535)).toEqual({ ttMb: 16, depthCap: 8 });
    expect(botTierOf(1536)).toEqual({ ttMb: 32, depthCap: 10 });
    expect(botTierOf(3071)).toEqual({ ttMb: 32, depthCap: 10 });
    expect(botTierOf(3072)).toEqual({ ttMb: 64, depthCap: 12 });
    expect(botTierOf(32_000)).toEqual({ ttMb: 64, depthCap: 12 });
  });

  it("names level 1 without memory and level 2 with its table (R9)", () => {
    expect(botDisplayName(1, null)).toBe("Bot · poziom 1");
    expect(botDisplayName(1, 4096)).toBe("Bot · poziom 1");
    expect(botDisplayName(2, 768)).toBe("Bot · poziom 2 · 16 MB");
    expect(botDisplayName(2, 300)).toBe("Bot · poziom 2 · 8 MB");
    expect(botDisplayName(2, null)).toBe("Bot · poziom 2");
    expect(botDisplayName(2, 100)).toBe("Bot · poziom 2");
  });

  it("gives the strength as data, with the table of level 2 only (i18n I14)", () => {
    expect(botStrengthOf(1, 4096)).toEqual({ level: 1, tableMb: null });
    expect(botStrengthOf(2, 768)).toEqual({ level: 2, tableMb: 16 });
    expect(botStrengthOf(2, null)).toEqual({ level: 2, tableMb: null });
    expect(botStrengthOf(2, 100)).toEqual({ level: 2, tableMb: null });
  });

  it("keeps the stored strength and adds the table size in the view (E15-S04)", () => {
    expect(botViewOf(2, 768)).toEqual({ level: 2, memoryMb: 768, tableMb: 16 });
    expect(botViewOf(1, null)).toEqual({ level: 1, memoryMb: null, tableMb: null });
  });
});
