import { describe, expect, it } from "vitest";

import { paperView, stonesOf, type PaperMoveRow } from "./view";

const move = (n: number, x: number, seat: 1 | 2, auto = false): PaperMoveRow => ({ n, x, y: 50, seat, auto, atMs: 1_000 * n });

describe("paperView", () => {
  const moves = [move(1, 50, 1), move(2, 51, 2), move(3, 52, 1, true)];

  it("lists the moves after `after`, with ISO times", () => {
    const view = paperView({ moveCount: 3, autoSeat: 1, pendingAutoAtMs: 5_000, moves }, 1);
    expect(view.moves).toEqual([
      { n: 2, x: 51, y: 50, seat: 2, auto: false, at: "1970-01-01T00:00:02.000Z" },
      { n: 3, x: 52, y: 50, seat: 1, auto: true, at: "1970-01-01T00:00:03.000Z" },
    ]);
    expect(view.autoMoveAt).toBe("1970-01-01T00:00:05.000Z");
    expect(view.autoSeat).toBe(1);
    expect(view.moveCount).toBe(3);
  });

  it("scores the sheet and reports no pending automat", () => {
    const five = [0, 1, 2, 3, 4].map((i) => move(i + 1, 40 + i, 1));
    const view = paperView({ moveCount: 5, autoSeat: null, pendingAutoAtMs: null, moves: five }, 0);
    expect(view.scores).toEqual([1, 0]);
    expect(view.fives).toHaveLength(1);
    expect(view.autoMoveAt).toBeNull();
  });

  it("drops the times from the stones", () => {
    expect(stonesOf(moves)[2]).toEqual({ x: 52, y: 50, seat: 1, auto: true });
  });
});
