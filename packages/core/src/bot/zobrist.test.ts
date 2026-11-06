import { describe, expect, it, vi } from "vitest";

import { BOARD_CELLS } from "../games/board";
import { ZOBRIST_HI, ZOBRIST_LO } from "./zobrist";

describe("Zobrist keys", () => {
  it("hold one pair per cell and colour", () => {
    expect(ZOBRIST_HI).toHaveLength(BOARD_CELLS * 2);
    expect(ZOBRIST_LO).toHaveLength(BOARD_CELLS * 2);
  });

  it("are distinct 64-bit keys", () => {
    const keys = new Set(Array.from(ZOBRIST_HI, (hi, index) => `${hi}:${ZOBRIST_LO[index]}`));
    expect(keys.size).toBe(BOARD_CELLS * 2);
    expect(ZOBRIST_HI).not.toEqual(ZOBRIST_LO);
  });

  it("come from a fixed seed (the same on every load)", async () => {
    vi.resetModules();
    const reloaded = await import("./zobrist");
    expect(reloaded.ZOBRIST_HI).toEqual(ZOBRIST_HI);
    expect(reloaded.ZOBRIST_LO).toEqual(ZOBRIST_LO);
  });
});
