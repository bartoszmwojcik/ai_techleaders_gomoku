import { describe, expect, it } from "vitest";

import { encodeBitboard, encodeMoves } from "./bitboard-codec";
import { boardView, type BoardRow } from "./board-view";
import { createBitboard, withStone } from "./board";

const bits = (cells: number[]) => encodeBitboard(cells.reduce(withStone, createBitboard()));

function row(over: Partial<BoardRow> = {}): BoardRow {
  return {
    status: "active",
    blackSeat: 2,
    moveCount: 3,
    stonesBlack: bits([10, 12]),
    stonesWhite: bits([11]),
    moves: encodeMoves([10, 11, 12]),
    winnerSeat: null,
    endReason: null,
    ...over,
  };
}

describe("boardView", () => {
  it("tells who is on turn and returns only the moves after `after`", () => {
    expect(boardView(row(), 0)).toEqual({
      moveCount: 3,
      blackSeat: 2,
      turnSeat: 1, // 3 moves made: white (seat 1) plays move 4
      moves: [10, 11, 12],
      result: null,
    });
    expect(boardView(row(), 2).moves).toEqual([12]);
    expect(boardView(row(), 3).moves).toEqual([]);
  });

  it("has no turn before the game starts or after it ends", () => {
    const waiting = boardView(row({ status: "waiting", blackSeat: null, moveCount: 0, moves: new Uint8Array(0) }), 0);
    expect(waiting).toMatchObject({ blackSeat: null, turnSeat: null, moves: [], result: null });
    expect(boardView(row({ status: "cancelled" }), 0).turnSeat).toBeNull();
  });

  it("has no turn for an active game without a black seat", () => {
    expect(boardView(row({ blackSeat: null }), 0).turnSeat).toBeNull();
  });

  it("reports a five with the winning line recomputed from the last move", () => {
    const blacks = [0, 1, 2, 3, 4].map((i) => 100 + i);
    const whites = [0, 1, 2, 3].map((i) => i);
    const moves = blacks.flatMap((cell, i) => (i < 4 ? [cell, whites[i]!] : [cell]));
    const view = boardView(
      row({
        status: "finished",
        blackSeat: 1,
        moveCount: 9,
        stonesBlack: bits(blacks),
        stonesWhite: bits(whites),
        moves: encodeMoves(moves),
        winnerSeat: 1,
        endReason: "five_in_row",
      }),
      0,
    );
    expect(view.turnSeat).toBeNull();
    expect(view.result).toEqual({ winnerSeat: 1, reason: "five_in_row", winLine: blacks });
  });

  it("finds a white winning line too", () => {
    const whites = [0, 1, 2, 3, 4].map((i) => 15 * i); // vertical, in order of play
    const blacks = [200, 202, 204, 206, 208];
    const moves = whites.flatMap((cell, i) => [blacks[i]!, cell]);
    const view = boardView(
      row({
        status: "finished",
        blackSeat: 1,
        moveCount: 10,
        stonesBlack: bits(blacks),
        stonesWhite: bits(whites),
        moves: encodeMoves(moves),
        winnerSeat: 2,
        endReason: "five_in_row",
      }),
      0,
    );
    expect(view.result?.winLine).toEqual(whites);
  });

  it("tolerates a five row whose line cannot be found", () => {
    const view = boardView(row({ status: "finished", endReason: "five_in_row", winnerSeat: 1 }), 0);
    expect(view.result).toEqual({ winnerSeat: 1, reason: "five_in_row", winLine: null });
  });

  it("gives other endings no winning line", () => {
    expect(boardView(row({ status: "finished", endReason: "draw" }), 0).result).toEqual({
      winnerSeat: null,
      reason: "draw",
      winLine: null,
    });
    expect(boardView(row({ status: "finished", endReason: "timeout", winnerSeat: 2 }), 0).result).toEqual({
      winnerSeat: 2,
      reason: "timeout",
      winLine: null,
    });
    expect(boardView(row({ status: "finished", endReason: "resignation", winnerSeat: 1 }), 0).result?.winLine).toBeNull();
  });

  it("has no result for a finished row without a reason", () => {
    expect(boardView(row({ status: "finished" }), 0).result).toBeNull();
  });
});
