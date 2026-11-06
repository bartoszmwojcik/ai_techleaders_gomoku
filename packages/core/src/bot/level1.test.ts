import { describe, expect, it } from "vitest";

import { cellOf } from "../games/board";
import { chooseLevel1 } from "./level1";
import { EngineBoard, type Side } from "./patterns";

function board(black: [number, number][], white: [number, number][]): EngineBoard {
  const result = new EngineBoard();
  for (const [x, y] of black) result.place(cellOf(x, y), 0);
  for (const [x, y] of white) result.place(cellOf(x, y), 1);
  return result;
}

const row = (y: number, from: number, to: number): [number, number][] =>
  Array.from({ length: to - from + 1 }, (_, index) => [from + index, y]);

describe("level 1", () => {
  it("wins at once, even when the opponent also threatens (an earlier cell)", () => {
    const choice = chooseLevel1(board([...row(7, 3, 6), [0, 14]], row(3, 3, 6)), 0, () => 0);
    expect(choice.reason).toBe("win");
    expect([cellOf(2, 7), cellOf(7, 7)]).toContain(choice.cell);
    expect(choice).toMatchObject({ depth: 0, nodes: 0, stoppedBy: "completed" });
  });

  it("blocks the opponent's immediate win", () => {
    const choice = chooseLevel1(board([[2, 3], [10, 10], [12, 12], [0, 14]], row(3, 3, 6)), 0, () => 0);
    expect(choice).toMatchObject({ cell: cellOf(7, 3), reason: "block" });
  });

  it("otherwise draws among the cells within 10% of the best value, repeatably for the same rng", () => {
    const position = board([[7, 7]], [[8, 8]]);
    const low = chooseLevel1(position, 0 as Side, () => 0);
    const high = chooseLevel1(position, 0 as Side, () => 0.999);
    expect(low.reason).toBe("heuristic");
    expect(low.cell).not.toBe(high.cell);
    expect(high.score).toBeGreaterThanOrEqual(low.score * 0.9);
    expect(low.score).toBeGreaterThanOrEqual(high.score * 0.9);
    expect(chooseLevel1(position, 0, () => 0)).toEqual(low);
  });

  it("extends its own open three to an open four rather than playing elsewhere", () => {
    const choice = chooseLevel1(board(row(7, 5, 7), [[0, 0], [14, 0], [0, 14]]), 0, () => 0);
    expect([cellOf(4, 7), cellOf(8, 7)]).toContain(choice.cell);
  });
});
