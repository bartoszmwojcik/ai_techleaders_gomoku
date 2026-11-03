import { describe, expect, it } from "vitest";

import { DEFAULT_VARIANT, GAME_VARIANTS, PAPER_CELLS, PAPER_DEFAULT_TIME_MS, PAPER_TIME_CONTROLS_MS } from "./constants";

describe("paper constants", () => {
  it("matches the spec", () => {
    expect(PAPER_CELLS).toBe(10201);
    expect(PAPER_TIME_CONTROLS_MS).toEqual([60_000, 120_000, 180_000, 300_000]);
    expect(PAPER_TIME_CONTROLS_MS).toContain(PAPER_DEFAULT_TIME_MS);
    expect(GAME_VARIANTS).toEqual(["classic", "paper"]);
    expect(DEFAULT_VARIANT).toBe("classic");
  });
});
