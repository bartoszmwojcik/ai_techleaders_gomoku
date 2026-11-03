import { describe, expect, it } from "vitest";

import type { PaperStone } from "./board";
import { scoreGame } from "./scoring";

const mk = (seat: 1 | 2, cells: [number, number][]): PaperStone[] => cells.map(([x, y]) => ({ x, y, seat, auto: false }));
const row = (n: number, x0 = 10, y0 = 10, dx = 1, dy = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => [x0 + dx * i, y0 + dy * i]);

describe("scoreGame", () => {
  it.each([
    [4, 0],
    [5, 1],
    [6, 1],
    [9, 1],
    [10, 2],
    [14, 2],
    [15, 3],
  ])("a row of %i is worth %i", (n, points) => {
    expect(scoreGame(mk(1, row(n))).scores).toEqual([points, 0]);
  });

  it("counts every direction and both players", () => {
    const vertical = scoreGame(mk(2, row(5, 3, 3, 0, 1)));
    expect(vertical.scores).toEqual([0, 1]);
    expect(scoreGame(mk(1, row(5, 3, 3, 1, 1))).scores).toEqual([1, 0]);
    expect(scoreGame(mk(1, row(5, 20, 20, 1, -1))).scores).toEqual([1, 0]);
  });

  it("scores a cross of two fives sharing a stone twice (9 stones)", () => {
    const stones = mk(1, [...row(5, 10, 12), ...row(5, 12, 10, 0, 1).filter(([, y]) => y !== 12)]);
    expect(stones).toHaveLength(9);
    expect(scoreGame(stones).scores).toEqual([2, 0]);
  });

  it("scores a stone in three and four directions (13 and 17 stones)", () => {
    const center: [number, number] = [30, 30];
    const arm = (dx: number, dy: number): [number, number][] =>
      Array.from({ length: 4 }, (_, i) => [30 + dx * (i + 1), 30 + dy * (i + 1)]);
    const three = [center, ...arm(1, 0), ...arm(0, 1), ...arm(1, 1)];
    expect(three).toHaveLength(13);
    expect(scoreGame(mk(1, three)).scores).toEqual([3, 0]);
    const four = [...three, ...arm(1, -1)];
    expect(four).toHaveLength(17);
    expect(scoreGame(mk(1, four)).scores).toEqual([4, 0]);
  });

  it("joins two halves into one row", () => {
    const left = row(3, 10, 10);
    const right = row(3, 14, 10);
    expect(scoreGame(mk(1, [...left, ...right])).scores).toEqual([0, 0]);
    expect(scoreGame(mk(1, [...left, ...right, [13, 10]])).scores).toEqual([1, 0]);
  });

  it("is blocked by the opponent's stone and does not wrap at the edge", () => {
    expect(scoreGame([...mk(1, row(4, 10, 10)), ...mk(2, [[14, 10]]), ...mk(1, [[15, 10]])]).scores).toEqual([0, 0]);
    const wrap = mk(1, [[97, 5], [98, 5], [99, 5], [100, 5], [0, 6], [1, 6]]);
    expect(scoreGame(wrap).scores).toEqual([0, 0]);
    const diag = mk(1, [[100, 0], [0, 1], [99, 1], [98, 2], [97, 3], [96, 4], [95, 5]]);
    expect(scoreGame(diag).scores).toEqual([1, 0]);
  });

  it("cuts scoring rows into fives from the smaller coordinate", () => {
    const { fives } = scoreGame(mk(1, row(11, 10, 10)));
    expect(fives).toEqual([
      { seat: 1, from: { x: 10, y: 10 }, to: { x: 14, y: 10 } },
      { seat: 1, from: { x: 15, y: 10 }, to: { x: 19, y: 10 } },
    ]);
    const anti = scoreGame(mk(2, row(5, 20, 24, 1, -1))).fives;
    expect(anti).toEqual([{ seat: 2, from: { x: 20, y: 24 }, to: { x: 24, y: 20 } }]);
  });

  it("lists fives in a stable order", () => {
    const a = mk(2, row(5, 40, 40));
    const b = mk(1, row(5, 10, 50));
    const c = mk(1, row(5, 10, 10));
    const fives = scoreGame([...a, ...b, ...c]).fives;
    expect(fives.map((f) => [f.seat, f.from.y])).toEqual([[1, 10], [1, 50], [2, 40]]);
    expect(fives).toEqual(scoreGame([...c, ...a, ...b]).fives);
  });

  it("never drops after a move and ignores the order of moves (random games)", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let game = 0; game < 25; game += 1) {
      const stones: PaperStone[] = [];
      const taken = new Set<string>();
      let previous: [number, number] = [0, 0];
      for (let move = 0; move < 120; move += 1) {
        const x = 40 + Math.floor(random() * 8);
        const y = 40 + Math.floor(random() * 8);
        if (taken.has(`${x},${y}`)) continue;
        taken.add(`${x},${y}`);
        stones.push({ x, y, seat: (move % 2 === 0 ? 1 : 2) as 1 | 2, auto: false });
        const { scores } = scoreGame(stones);
        expect(scores[0]).toBeGreaterThanOrEqual(previous[0]);
        expect(scores[1]).toBeGreaterThanOrEqual(previous[1]);
        previous = scores;
      }
      const shuffled = [...stones].sort(() => random() - 0.5);
      expect(scoreGame(shuffled).scores).toEqual(previous);
    }
  });
});
