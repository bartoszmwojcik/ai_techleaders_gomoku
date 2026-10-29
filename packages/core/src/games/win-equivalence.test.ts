import { describe, expect, it } from "vitest";

import { applyMove, type MoveState } from "./apply-move";
import { BOARD_CELLS, createBitboard, hasStone, type Bitboard } from "./board";
import { BOARD_SIZE, WIN_LENGTH } from "./rules";

/** Deterministic PRNG so a failure is reproducible. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reference implementation: scan the whole board for a run of `WIN_LENGTH` of one colour. */
function naiveHasFive(board: Bitboard): boolean {
  const grid = Array.from({ length: BOARD_CELLS }, (_, c) => hasStone(board, c));
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE && grid[y * BOARD_SIZE + x]!;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!grid[y * BOARD_SIZE + x]) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        let run = 0;
        while (run < WIN_LENGTH && at(x + dx * run, y + dy * run)) run++;
        if (run === WIN_LENGTH) return true;
      }
    }
  }
  return false;
}

describe("checkWin equivalence with a naive full-board scan", () => {
  it("agrees after every move of 2000 seeded random games", () => {
    const random = mulberry32(20261029);
    let wins = 0;
    let draws = 0;
    let mismatches = 0;
    for (let game = 0; game < 2000; game++) {
      // Biased towards the centre so that fives actually happen.
      const order = Array.from({ length: BOARD_CELLS }, (_, c) => c)
        .map((c) => {
          const dx = (c % BOARD_SIZE) - 7;
          const dy = Math.floor(c / BOARD_SIZE) - 7;
          return { c, k: random() * (4 + Math.hypot(dx, dy)) };
        })
        .sort((a, b) => a.k - b.k)
        .map(({ c }) => c);

      let state: MoveState = {
        black: createBitboard(),
        white: createBitboard(),
        moveCount: 0,
        blackSeat: 1,
      };
      for (const cell of order) {
        const outcome = applyMove(state, cell);
        if (!outcome.ok) throw new Error("random game made an illegal move");
        state = outcome.state;
        const mover = outcome.color === "black" ? state.black : state.white;
        if ((outcome.result?.reason === "five_in_row") !== naiveHasFive(mover)) mismatches++;
        if (outcome.result) {
          if (outcome.result.reason === "five_in_row") wins++;
          else draws++;
          break;
        }
      }
    }
    expect(mismatches).toBe(0);
    expect(wins).toBeGreaterThan(1500);
    expect(wins + draws).toBeLessThanOrEqual(2000);
  }, 120_000);
});
