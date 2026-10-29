import { describe, expect, it } from "vitest";

import { applyMove, type MoveState } from "./apply-move";
import {
  BOARD_CELLS,
  assertBoardConsistent,
  cellOf,
  createBitboard,
  hasStone,
  withStone,
  type Bitboard,
} from "./board";
import { BOARD_SIZE, WIN_LENGTH } from "./rules";

function start(blackSeat: 1 | 2 = 1): MoveState {
  return { black: createBitboard(), white: createBitboard(), moveCount: 0, blackSeat };
}

function play(state: MoveState, cells: number[]) {
  let current = state;
  let last: ReturnType<typeof applyMove> | undefined;
  for (const cell of cells) {
    last = applyMove(current, cell);
    if (!last.ok) throw new Error(`rejected ${cell}: ${last.reason}`);
    current = last.state;
  }
  return { state: current, last: last! };
}

describe("applyMove", () => {
  it("places black first, then white, and counts moves", () => {
    const first = applyMove(start(2), 112);
    if (!first.ok) throw new Error("rejected");
    expect(first.color).toBe("black");
    expect(first.seat).toBe(2);
    expect(first.result).toBeNull();
    expect(first.winLine).toBeNull();
    expect(first.state.moveCount).toBe(1);
    expect(hasStone(first.state.black, 112)).toBe(true);

    const second = applyMove(first.state, 113);
    if (!second.ok) throw new Error("rejected");
    expect(second.color).toBe("white");
    expect(second.seat).toBe(1);
    expect(hasStone(second.state.white, 113)).toBe(true);
  });

  it("does not mutate the previous state", () => {
    const before = start();
    applyMove(before, 5);
    expect(before.moveCount).toBe(0);
    expect(hasStone(before.black, 5)).toBe(false);
  });

  it("rejects an occupied cell of either colour and cells off the board", () => {
    const { state } = play(start(), [10, 11]);
    expect(applyMove(state, 10)).toEqual({ ok: false, reason: "occupied" });
    expect(applyMove(state, 11)).toEqual({ ok: false, reason: "occupied" });
    expect(applyMove(state, 225)).toEqual({ ok: false, reason: "out_of_board" });
    expect(applyMove(state, -1)).toEqual({ ok: false, reason: "out_of_board" });
  });

  it("ends with a win for the seat that moved", () => {
    const row = 7 * BOARD_SIZE;
    const blacks = [0, 1, 2, 3, 4].map((i) => row + i);
    const whites = [0, 1, 2, 3].map((i) => i); // top row, never five
    const sequence = blacks.flatMap((cell, i) => (i < 4 ? [cell, whites[i]!] : [cell]));
    const { last } = play(start(2), sequence);
    if (!last.ok) throw new Error("rejected");
    expect(last.result).toEqual({ winnerSeat: 2, reason: "five_in_row" });
    expect(last.winLine).toEqual(blacks);
    expect(WIN_LENGTH).toBe(5);
  });

  it("a white win belongs to the other seat", () => {
    const whites = [0, 1, 2, 3, 4].map((i) => 3 * BOARD_SIZE + i);
    const blacks = [200, 202, 204, 206, 208];
    const sequence = [blacks[0]!, whites[0]!, blacks[1]!, whites[1]!, blacks[2]!, whites[2]!, blacks[3]!, whites[3]!, blacks[4]!, whites[4]!];
    const { last } = play(start(1), sequence);
    if (!last.ok) throw new Error("rejected");
    expect(last.result).toEqual({ winnerSeat: 2, reason: "five_in_row" });
  });

  it("a five with the 225th stone is a win, not a draw", () => {
    const { blackCells, whiteCells } = drawLayout();
    // Row 0 gets black at x = 2, 3; two other black stones turn white to keep 113 / 112.
    const black = new Set([...blackCells, cellOf(2, 0), cellOf(3, 0)]);
    const white = new Set(whiteCells);
    white.delete(cellOf(2, 0));
    white.delete(cellOf(3, 0));
    for (const cell of [cellOf(0, 2), cellOf(1, 2)]) {
      black.delete(cell);
      white.add(cell);
    }
    const lastCell = cellOf(2, 0);
    black.delete(lastCell);
    expect(black.size).toBe(112);
    expect(white.size).toBe(112);
    const state: MoveState = {
      black: boardOf([...black]),
      white: boardOf([...white]),
      moveCount: 224,
      blackSeat: 1,
    };
    const last = applyMove(state, lastCell);
    if (!last.ok) throw new Error("rejected");
    expect(last.state.moveCount).toBe(BOARD_CELLS);
    expect(last.result).toEqual({ winnerSeat: 1, reason: "five_in_row" });
    expect(last.winLine).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("declares a draw when the board fills without a five", () => {
    const { blackCells, whiteCells } = drawLayout();
    const lastCell = blackCells[blackCells.length - 1]!;
    const state: MoveState = {
      black: boardOf(blackCells.slice(0, -1)),
      white: boardOf(whiteCells),
      moveCount: 224,
      blackSeat: 2,
    };
    const last = applyMove(state, lastCell);
    if (!last.ok) throw new Error("rejected");
    expect(last.result).toEqual({ winnerSeat: null, reason: "draw" });
    expect(last.winLine).toBeNull();
    const moves = blackCells.flatMap((cell, i) => (i < whiteCells.length ? [cell, whiteCells[i]!] : [cell]));
    expect(() =>
      assertBoardConsistent({ black: last.state.black, white: last.state.white, moves }),
    ).not.toThrow();
  });
});

function boardOf(cells: number[]): Bitboard {
  return cells.reduce(withStone, createBitboard());
}

/**
 * A full board with no run of five: colour = parity of (floor(x / 2) + y), so every line
 * has runs of at most two. 113 black and 112 white stones, as a 225-move game ends.
 */
function drawLayout() {
  const blackCells: number[] = [];
  const whiteCells: number[] = [];
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    const x = cell % BOARD_SIZE;
    const y = Math.floor(cell / BOARD_SIZE);
    (((Math.floor(x / 2) + y) % 2 === 0 ? blackCells : whiteCells)).push(cell);
  }
  return { blackCells, whiteCells };
}
