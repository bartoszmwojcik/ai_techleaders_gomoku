import { describe, expect, it } from "vitest";

import { createRng, rngFor, seedOf } from "./seed";

describe("seedOf", () => {
  it("is a stable unsigned 32-bit hash of the game id and the move number", () => {
    const seed = seedOf("game-1", 7);
    expect(seed).toBe(seedOf("game-1", 7));
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
  });

  it("differs between moves and between games", () => {
    expect(seedOf("game-1", 7)).not.toBe(seedOf("game-1", 8));
    expect(seedOf("game-1", 7)).not.toBe(seedOf("game-2", 7));
  });
});

describe("createRng", () => {
  it("repeats the same sequence in [0, 1) for the same seed", () => {
    const first = createRng(42);
    const second = createRng(42);
    const values = Array.from({ length: 1000 }, () => first());
    expect(values).toEqual(Array.from({ length: 1000 }, () => second()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(990);
  });

  it("gives different sequences for different seeds", () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});

describe("rngFor", () => {
  it("is the generator seeded with seedOf (R16: a recomputed move draws the same numbers)", () => {
    expect(rngFor("game-1", 3)()).toBe(createRng(seedOf("game-1", 3))());
  });
});
