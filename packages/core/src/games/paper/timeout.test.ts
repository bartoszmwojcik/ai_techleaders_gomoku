import { describe, expect, it } from "vitest";

import type { PaperStone } from "./board";
import { AUTO_MOVE_DELAY_MS } from "./constants";
import { autoDueAt, resolvePaperClock, type PaperClockState } from "./timeout";

const T0 = 1_000_000;
const stone = (x: number, y: number, seat: 1 | 2): PaperStone => ({ x, y, seat, auto: false });
const fiveOf = (seat: 1 | 2, y: number) => Array.from({ length: 5 }, (_, i) => stone(40 + i, y, seat));

/** Seat 1 leads 1:0 and is on turn; seat 2 has only a couple of stones. */
const leaderOnTurn = (over: Partial<PaperClockState> = {}): PaperClockState => ({
  stones: [...fiveOf(1, 50), stone(41, 51, 2), stone(42, 51, 2)],
  clockMs: [30_000, 40_000],
  turnSeat: 1,
  turnStartedAtMs: T0,
  autoSeat: null,
  pendingAutoAtMs: null,
  ...over,
});
const trailingOnTurn = (): PaperClockState => leaderOnTurn({ turnSeat: 2 });

const first = () => 0;

describe("resolvePaperClock", () => {
  it("does nothing before the deadline", () => {
    const state = leaderOnTurn();
    const result = resolvePaperClock(state, T0 + 29_999, first);
    expect(result).toEqual({ autoMoves: [], finish: null, state });
  });

  it("ends the game at the deadline when the player on turn is behind: the leader wins", () => {
    const result = resolvePaperClock(trailingOnTurn(), T0 + 100_000, first);
    expect(result.finish).toEqual({ atMs: T0 + 40_000, winnerSeat: 1 });
    expect(result.autoMoves).toEqual([]);
  });

  it("ends in a draw when the player on turn has run out with equal points", () => {
    const state: PaperClockState = { ...leaderOnTurn(), stones: [stone(50, 50, 1), stone(51, 50, 2)] };
    expect(resolvePaperClock(state, T0 + 30_000, first).finish).toEqual({ atMs: T0 + 30_000, winnerSeat: null });
  });

  it("hands the leader's turn to the automat, which plays at once and starts the opponent's clock", () => {
    const result = resolvePaperClock(leaderOnTurn(), T0 + 30_000, first);
    expect(result.finish).toBeNull();
    expect(result.autoMoves).toHaveLength(1);
    expect(result.autoMoves[0]).toMatchObject({ seat: 1, atMs: T0 + 30_000 });
    expect(result.state).toMatchObject({
      autoSeat: 1,
      turnSeat: 2,
      turnStartedAtMs: T0 + 30_000,
      clockMs: [0, 40_000],
      pendingAutoAtMs: null,
    });
    expect(result.state.stones).toHaveLength(8);
    expect(result.state.stones[7]).toMatchObject({ seat: 1, auto: true });
  });

  it("plays the automat around the opponent's last stone", () => {
    const result = resolvePaperClock(leaderOnTurn(), T0 + 30_000, first);
    const [move] = result.autoMoves;
    expect(Math.max(Math.abs(move!.x - 42), Math.abs(move!.y - 51))).toBe(1);
  });

  it("falls back to the last stone when the opponent has none", () => {
    const state = leaderOnTurn({ stones: fiveOf(1, 50) });
    const [move] = resolvePaperClock(state, T0 + 30_000, first).autoMoves;
    expect(Math.max(Math.abs(move!.x - 44), Math.abs(move!.y - 50))).toBe(1);
  });

  it("ends the game when the sheet leaves the automat no cell", () => {
    const stones: PaperStone[] = [];
    for (let y = 0; y < 101; y += 1) for (let x = 0; x < 101; x += 1) stones.push(stone(x, y, y <= 70 ? 1 : 2));
    const result = resolvePaperClock({ ...leaderOnTurn(), stones }, T0 + 31_000, first);
    expect(result.finish).toEqual({ atMs: T0 + 30_000, winnerSeat: 1 });
    expect(result.autoMoves).toEqual([]);
  });

  it("in the automat phase plays the pending stone when due and keeps the opponent's clock", () => {
    const phase = resolvePaperClock(leaderOnTurn(), T0 + 30_000, first).state;
    const pendingAt = T0 + 40_000;
    const waiting: PaperClockState = { ...phase, stones: [...phase.stones, stone(44, 52, 2)], pendingAutoAtMs: pendingAt };
    const before = resolvePaperClock(waiting, pendingAt - 1, first);
    expect(before.autoMoves).toEqual([]);
    expect(before.state.pendingAutoAtMs).toBe(pendingAt);
    const due = resolvePaperClock(waiting, pendingAt + 5_000, first);
    expect(due.finish).toBeNull();
    expect(due.autoMoves).toHaveLength(1);
    expect(due.autoMoves[0]).toMatchObject({ seat: 1, atMs: pendingAt });
    expect(due.state).toMatchObject({ pendingAutoAtMs: null, turnStartedAtMs: T0 + 30_000, turnSeat: 2 });
  });

  it("ends the game at the opponent's deadline with the winner by points", () => {
    const phase = resolvePaperClock(leaderOnTurn(), T0 + 30_000, first).state;
    const deadline = T0 + 30_000 + 40_000;
    const result = resolvePaperClock(phase, deadline + 999, first);
    expect(result.finish).toEqual({ atMs: deadline, winnerSeat: 1 });
  });

  it("does not play a pending automat stone that falls after the opponent's deadline", () => {
    const phase = resolvePaperClock(leaderOnTurn(), T0 + 30_000, first).state;
    const deadline = T0 + 30_000 + 40_000;
    const waiting: PaperClockState = { ...phase, pendingAutoAtMs: deadline + 1 };
    const result = resolvePaperClock(waiting, deadline + 5_000, first);
    expect(result.autoMoves).toEqual([]);
    expect(result.finish).toEqual({ atMs: deadline, winnerSeat: 1 });
  });

  it("lets the opponent win on points after catching up in the automat phase", () => {
    const phase = resolvePaperClock(leaderOnTurn(), T0 + 30_000, first).state;
    const caught: PaperClockState = { ...phase, stones: [...phase.stones, ...fiveOf(2, 60), ...fiveOf(2, 70)] };
    const result = resolvePaperClock(caught, T0 + 30_000 + 40_000, first);
    expect(result.finish).toEqual({ atMs: T0 + 70_000, winnerSeat: 2 });
  });

  it("gives the same result when polled late as when polled continuously", () => {
    const start = leaderOnTurn();
    const late = resolvePaperClock(start, T0 + 500_000, first);
    const step1 = resolvePaperClock(start, T0 + 30_000, first);
    const step2 = resolvePaperClock(step1.state, T0 + 500_000, first);
    expect(late.finish).toEqual(step2.finish);
    expect(late.finish).toEqual({ atMs: T0 + 70_000, winnerSeat: 1 });
  });

  it("schedules the automat two seconds after a move", () => {
    expect(AUTO_MOVE_DELAY_MS).toBe(2000);
    expect(autoDueAt(T0)).toBe(T0 + 2000);
  });
});
