import { describe, expect, it } from "vitest";

import { pickAutoMove } from "./auto-move";
import { isAllowed, type PaperStone } from "./board";

const s = (x: number, y: number, seat: 1 | 2 = 2): PaperStone => ({ x, y, seat, auto: false });

describe("pickAutoMove", () => {
  it("picks from the first ring around the opponent's stone, in a fixed order", () => {
    const stones = [s(50, 50, 1)];
    const first = pickAutoMove(stones, { x: 50, y: 50 }, () => 0);
    expect(first).toEqual({ x: 49, y: 49 });
    const last = pickAutoMove(stones, { x: 50, y: 50 }, () => 0.9999);
    expect(last).toEqual({ x: 51, y: 51 });
    const mid = pickAutoMove(stones, { x: 50, y: 50 }, () => 0.5);
    expect(Math.max(Math.abs(mid!.x - 50), Math.abs(mid!.y - 50))).toBe(1);
  });

  it("moves to the next ring when the first is full and clamps a random of 1", () => {
    const stones: PaperStone[] = [];
    for (let y = 49; y <= 51; y += 1) for (let x = 49; x <= 51; x += 1) stones.push(s(x, y));
    const cell = pickAutoMove(stones, { x: 50, y: 50 }, () => 1)!;
    expect(Math.max(Math.abs(cell.x - 50), Math.abs(cell.y - 50))).toBe(2);
    expect(isAllowed(stones, cell.x, cell.y)).toBe(true);
  });

  it("skips cells off the sheet near the edge", () => {
    const stones = [s(0, 0, 1)];
    for (const r of [0, 0.5, 0.99]) {
      const cell = pickAutoMove(stones, { x: 0, y: 0 }, () => r)!;
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns null when the sheet is full", () => {
    const stones: PaperStone[] = [];
    for (let y = 0; y < 101; y += 1) for (let x = 0; x < 101; x += 1) stones.push(s(x, y));
    expect(pickAutoMove(stones, { x: 50, y: 50 }, () => 0)).toBeNull();
  });
});
