import { afterEach, describe, expect, it, vi } from "vitest";

import { ColorDraw } from "./color-draw";

afterEach(() => vi.restoreAllMocks());

describe("ColorDraw", () => {
  it("draws seat 1 or seat 2 with roughly even odds", () => {
    const draw = new ColorDraw();
    const counts = { 1: 0, 2: 0 };
    for (let i = 0; i < 400; i += 1) counts[draw.drawBlackSeat()] += 1;
    expect(counts[1] + counts[2]).toBe(400);
    expect(counts[1]).toBeGreaterThan(100);
    expect(counts[2]).toBeGreaterThan(100);
  });
});
