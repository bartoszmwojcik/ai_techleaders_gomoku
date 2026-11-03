import { AUTO_MOVE_DELAY_MS, indexStones, refusalIn, type Seat } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { PaperSettler } from "./paper-settler";

const NOW = new Date("2026-11-02T12:00:00Z");
const T0 = NOW.getTime() - 120_000;
const GAME = "game-1";

type Move = { x: number; y: number; seat: Seat; auto?: boolean };

// Black has a five in a row (one point), white four scattered stones: black leads 1 : 0.
const BLACK_FIVE: Move[] = [
  { x: 50, y: 50, seat: 1 },
  { x: 50, y: 52, seat: 2 },
  { x: 51, y: 50, seat: 1 },
  { x: 52, y: 52, seat: 2 },
  { x: 52, y: 50, seat: 1 },
  { x: 54, y: 52, seat: 2 },
  { x: 53, y: 50, seat: 1 },
  { x: 56, y: 52, seat: 2 },
  { x: 54, y: 50, seat: 1 },
];

type World = {
  status?: string;
  blackSeat?: number | null;
  clocks?: [number, number];
  turnStartedMs?: number | null;
  autoSeat?: number | null;
  pendingMs?: number | null;
  moves?: Move[];
  /** Rows `FINISH_SQL` returns; empty = another transaction finished the game first. */
  finishWritten?: boolean;
  noGame?: boolean;
};

function setup(world: World = {}) {
  const moves = world.moves ?? BLACK_FIVE;
  const calls: { sql: string; params: unknown[]; mode?: string }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params, mode });
    if (sql.includes("from games g join paper_game_states")) {
      if (world.noGame) return [];
      return [
        {
          status: world.status ?? "active",
          black_seat: world.blackSeat === undefined ? 1 : world.blackSeat,
          clock_ms_1: world.clocks?.[0] ?? 60_000,
          clock_ms_2: world.clocks?.[1] ?? 60_000,
          turn_started_ms: world.turnStartedMs === undefined ? T0 : world.turnStartedMs,
          auto_seat: world.autoSeat ?? null,
          pending_ms: world.pendingMs ?? null,
          move_count: moves.length,
        },
      ];
    }
    if (sql.includes("from paper_game_states where")) {
      return [{ move_count: moves.length, auto_seat: world.autoSeat ?? null, pending_ms: world.pendingMs ?? null }];
    }
    if (sql.includes("from paper_moves where")) {
      return moves.map((move, index) => ({
        move_number: index + 1,
        x: move.x,
        y: move.y,
        seat: move.seat,
        is_auto: move.auto ?? false,
        at_ms: T0 - 1000 * (moves.length - index),
      }));
    }
    if (sql.includes("returning id")) return world.finishWritten === false ? [] : [{ id: GAME }];
    return [];
  });
  const tx = { execute } as unknown as EntityManager;
  const settler = new PaperSettler({ clock: { now: () => NOW }, random: () => 0 });
  const ran = (marker: string) => calls.filter(({ sql }) => sql.includes(marker));
  return { settler, tx, calls, ran };
}

const NOTHING = { finished: false, changed: false };
const writes = (calls: { sql: string }[]) =>
  calls.filter(({ sql }) => /^(insert|update)/.test(sql)).length;

describe("PaperSettler.isDue", () => {
  it.each([
    ["no such paper game", { noGame: true }],
    ["a game that is not active", { status: "waiting" }],
    ["a game without colours", { blackSeat: null }],
    ["a clock that has not started", { turnStartedMs: null }],
  ] as const)("is false for %s", async (_name, world) => {
    const { settler, tx } = setup(world);
    expect(await settler.isDue(GAME, tx, NOW)).toBe(false);
  });

  it("is due exactly at the deadline of the player on turn, using the injected clock by default", async () => {
    // Nine moves: white is on turn, 60 s from T0.
    const early = setup({ turnStartedMs: NOW.getTime() - 59_999 });
    expect(await early.settler.isDue(GAME, early.tx)).toBe(false);
    const due = setup({ turnStartedMs: NOW.getTime() - 60_000 });
    expect(await due.settler.isDue(GAME, due.tx)).toBe(true);
  });

  it("reads the clock of the seat on turn: black after an even number of moves", async () => {
    const { settler, tx } = setup({ moves: BLACK_FIVE.slice(0, 8), clocks: [30_000, 600_000], turnStartedMs: NOW.getTime() - 40_000 });
    expect(await settler.isDue(GAME, tx, NOW)).toBe(true);
  });

  it("in the automat phase watches the opponent's clock and the pending stone, whichever comes first", async () => {
    const phase = { autoSeat: 1, moves: [...BLACK_FIVE.slice(0, 8), { x: 60, y: 50, seat: 1 as Seat, auto: true }] };
    // The player (seat 2) has 60 s from T0; nothing pending: due only at the deadline.
    const idle = setup({ ...phase, pendingMs: null, turnStartedMs: NOW.getTime() - 1000 });
    expect(await idle.settler.isDue(GAME, idle.tx, NOW)).toBe(false);
    // A pending stone makes the game due earlier than the deadline.
    const pending = setup({ ...phase, pendingMs: NOW.getTime() - 1, turnStartedMs: NOW.getTime() - 1000 });
    expect(await pending.settler.isDue(GAME, pending.tx, NOW)).toBe(true);
    // A pending stone in the future and a distant deadline: not due.
    const future = setup({ ...phase, pendingMs: NOW.getTime() + AUTO_MOVE_DELAY_MS, turnStartedMs: NOW.getTime() - 1000 });
    expect(await future.settler.isDue(GAME, future.tx, NOW)).toBe(false);
    // The deadline of the player (not the automat's spent clock) ends the game.
    const over = setup({ ...phase, pendingMs: NOW.getTime() + AUTO_MOVE_DELAY_MS, turnStartedMs: NOW.getTime() - 60_000 });
    expect(await over.settler.isDue(GAME, over.tx, NOW)).toBe(true);
  });
});

describe("PaperSettler.settle, nothing to do", () => {
  it.each([
    ["no such paper game", { noGame: true }],
    ["a game that is not active", { status: "finished" }],
    ["a game without colours", { blackSeat: null }],
    ["a clock that has not started", { turnStartedMs: null }],
  ] as const)("changes nothing for %s and reads no sheet", async (_name, world) => {
    const { settler, tx, calls } = setup(world);
    expect(await settler.settle(GAME, tx, NOW)).toEqual(NOTHING);
    expect(calls).toHaveLength(1);
  });

  it("changes nothing while the clock of the player on turn has time left", async () => {
    const { settler, tx, calls } = setup({ turnStartedMs: NOW.getTime() - 59_999 });
    expect(await settler.settle(GAME, tx)).toEqual(NOTHING);
    expect(writes(calls)).toBe(0);
  });

  it("changes nothing in the automat phase before the stone is due and before the player's deadline", async () => {
    const { settler, tx, calls } = setup({
      autoSeat: 1,
      pendingMs: NOW.getTime() + 1000,
      turnStartedMs: NOW.getTime() - 1000,
      moves: [...BLACK_FIVE.slice(0, 8), { x: 60, y: 50, seat: 1, auto: true }],
    });
    expect(await settler.settle(GAME, tx, NOW)).toEqual(NOTHING);
    expect(writes(calls)).toBe(0);
  });
});

describe("PaperSettler.settle, the automat takes over", () => {
  it("puts the stone at the deadline, spends the leader's clock and starts the opponent's from that moment", async () => {
    // Black (one point) is on turn after nine moves + the tenth white... ten moves: black on turn.
    const moves: Move[] = [...BLACK_FIVE, { x: 58, y: 52, seat: 2 }];
    const { settler, tx, ran, calls } = setup({ moves, turnStartedMs: T0 });
    const deadline = T0 + 60_000;

    expect(await settler.settle(GAME, tx, new Date(deadline + 1000))).toEqual({ finished: false, changed: true });

    const [insert] = ran("insert into paper_moves");
    const [, number, x, y, seat, at] = insert!.params as [string, number, number, number, number, Date];
    expect([number, seat, at]).toEqual([11, 1, new Date(deadline)]);
    // The stone obeys the rules of the sheet: free and at most 3 cells from another one.
    const stones = moves.map((move) => ({ ...move, auto: false }));
    expect(refusalIn(indexStones(stones), x, y)).toBeNull();
    expect(insert!.mode).toBe("run");
    // Move count 11, scores 1 : 0, the automat plays seat 1, nothing pending, last move at the deadline.
    expect(ran("update paper_game_states")[0]!.params).toEqual([11, 1, 0, 1, new Date(deadline), GAME]);
    expect(ran("update games set clock_ms_1 = 0, turn_started_at = ?")[0]!.params).toEqual([new Date(deadline), GAME]);
    expect(ran("clock_ms_2 = 0")).toHaveLength(0);
    expect(ran("status = 'finished'")).toHaveLength(0);
    expect(ran("game_pair_counters")).toHaveLength(0);
    // Stone, state, clock — in this order.
    const order = ["insert into paper_moves", "update paper_game_states", "update games set clock_ms_1"];
    const index = order.map((part) => calls.findIndex(({ sql }) => sql.includes(part)));
    expect(index).toEqual([...index].sort((a, b) => a - b));
  });

  it("spends the clock of seat 2 when it is seat 2 that leads and runs out", async () => {
    // Seat 2 holds the colour that moves after an even number of moves, and the five.
    const moves: Move[] = [
      { x: 50, y: 52, seat: 2 },
      { x: 50, y: 50, seat: 1 },
      { x: 51, y: 52, seat: 2 },
      { x: 52, y: 50, seat: 1 },
      { x: 52, y: 52, seat: 2 },
      { x: 54, y: 50, seat: 1 },
      { x: 53, y: 52, seat: 2 },
      { x: 56, y: 50, seat: 1 },
      { x: 54, y: 52, seat: 2 },
      { x: 58, y: 50, seat: 1 },
    ];
    const { settler, tx, ran } = setup({ moves, blackSeat: 2, turnStartedMs: T0 });
    const deadline = T0 + 60_000;

    expect(await settler.settle(GAME, tx, new Date(deadline + 1000))).toEqual({ finished: false, changed: true });

    expect(ran("insert into paper_moves")[0]!.params.slice(1, 2).concat(ran("insert into paper_moves")[0]!.params[4])).toEqual([11, 2]);
    expect(ran("update paper_game_states")[0]!.params).toEqual([11, 0, 1, 2, new Date(deadline), GAME]);
    expect(ran("update games set clock_ms_2 = 0, turn_started_at = ?")[0]!.params).toEqual([new Date(deadline), GAME]);
    expect(ran("clock_ms_1 = 0")).toHaveLength(0);
  });
});

describe("PaperSettler.settle, the end by time", () => {
  it("ends the game at the deadline for the player who does not lead, the leader wins on points", async () => {
    // Nine moves: white is on turn and trails 0 : 1.
    const { settler, tx, ran, calls } = setup({ turnStartedMs: T0 });
    const deadline = T0 + 60_000;

    expect(await settler.settle(GAME, tx, NOW)).toEqual({ finished: true, changed: true });

    expect(ran("insert into paper_moves")).toHaveLength(0);
    const finish = ran("status = 'finished'")[0]!;
    expect(finish.sql).toContain("end_reason = 'points'");
    expect(finish.sql).toContain("clock_ms_2 = 0");
    expect(finish.params).toEqual([1, new Date(deadline), GAME]);
    expect(ran("update paper_game_states")[0]!.params).toEqual([9, 1, 0, null, null, GAME]);
    // The finish is counted once and frees both slots, after it.
    expect(ran("game_pair_counters")).toHaveLength(1);
    expect(ran("update game_players set is_active = false")[0]!.params).toEqual([GAME]);
    const order = ["status = 'finished'", "game_pair_counters", "update game_players set is_active"];
    const index = order.map((part) => calls.findIndex(({ sql }) => sql.includes(part)));
    expect(index).toEqual([...index].sort((a, b) => a - b));
  });

  it("ends a game level on points as a draw, charging the clock of seat 1 when it is the one out of time", async () => {
    const { settler, tx, ran } = setup({ moves: [{ x: 50, y: 50, seat: 1 }, { x: 51, y: 50, seat: 2 }], turnStartedMs: T0 });
    expect(await settler.settle(GAME, tx, NOW)).toEqual({ finished: true, changed: true });
    const finish = ran("status = 'finished'")[0]!;
    expect(finish.sql).toContain("clock_ms_1 = 0");
    expect(finish.params).toEqual([null, new Date(T0 + 60_000), GAME]);
  });

  it("does not count or release anything when another transaction finished the game first", async () => {
    const { settler, tx, ran } = setup({ turnStartedMs: T0, finishWritten: false });
    expect(await settler.settle(GAME, tx, NOW)).toEqual({ finished: false, changed: true });
    expect(ran("game_pair_counters")).toHaveLength(0);
    expect(ran("update game_players")).toHaveLength(0);
  });
});

describe("PaperSettler.settle in the automat phase", () => {
  // Black plays by the automat (it led); white (seat 2) plays against a clock of 60 s from T0.
  const phase = (extra: World = {}): World => ({
    autoSeat: 1,
    moves: [...BLACK_FIVE, { x: 58, y: 52, seat: 2 }, { x: 60, y: 50, seat: 1, auto: true }],
    turnStartedMs: T0,
    clocks: [0, 60_000],
    ...extra,
  });

  it("puts the due stone for the automat, keeping the phase and the clock of the player", async () => {
    const pending = T0 + 30_000;
    const { settler, tx, ran } = setup(phase({ pendingMs: pending }));

    expect(await settler.settle(GAME, tx, new Date(pending + 1))).toEqual({ finished: false, changed: true });

    const [, number, , , seat, at] = ran("insert into paper_moves")[0]!.params as [string, number, number, number, number, Date];
    expect([number, seat, at]).toEqual([12, 1, new Date(pending)]);
    expect(ran("update paper_game_states")[0]!.params).toEqual([12, 1, 0, 1, new Date(pending), GAME]);
    // The take-over happened earlier: the clocks are not touched again.
    expect(ran("update games set clock_ms_")).toHaveLength(0);
  });

  it("ends the game by points when the player's clock ends, also after the last stone of the automat", async () => {
    const pending = T0 + 30_000;
    const { settler, tx, ran } = setup(phase({ pendingMs: pending }));

    expect(await settler.settle(GAME, tx, NOW)).toEqual({ finished: true, changed: true });

    expect(ran("insert into paper_moves")).toHaveLength(1);
    // The sheet is written without a pending stone; the finish names the player's clock and the leader.
    expect(ran("update paper_game_states")[0]!.params).toEqual([12, 1, 0, 1, new Date(pending), GAME]);
    const finish = ran("status = 'finished'")[0]!;
    expect(finish.sql).toContain("clock_ms_2 = 0");
    expect(finish.params).toEqual([1, new Date(T0 + 60_000), GAME]);
  });

  it("ends the game by points with no stone when none is pending", async () => {
    const { settler, tx, ran } = setup(phase({ pendingMs: null }));
    expect(await settler.settle(GAME, tx, NOW)).toEqual({ finished: true, changed: true });
    expect(ran("insert into paper_moves")).toHaveLength(0);
    expect(ran("status = 'finished'")[0]!.params).toEqual([1, new Date(T0 + 60_000), GAME]);
  });

  it("charges the clock of seat 1 when the automat plays seat 2 and seat 1 runs out", async () => {
    // Seat 2 (white) leads on points and plays by the automat; seat 1 is out of time.
    const moves: Move[] = [
      { x: 50, y: 50, seat: 1 },
      { x: 50, y: 52, seat: 2 },
      { x: 52, y: 50, seat: 1 },
      { x: 51, y: 52, seat: 2 },
      { x: 54, y: 50, seat: 1 },
      { x: 52, y: 52, seat: 2 },
      { x: 56, y: 50, seat: 1 },
      { x: 53, y: 52, seat: 2 },
      { x: 58, y: 50, seat: 1 },
      { x: 54, y: 52, seat: 2, auto: true },
    ];
    const { settler, tx, ran } = setup({ autoSeat: 2, moves, turnStartedMs: T0, clocks: [60_000, 0] });
    expect(await settler.settle(GAME, tx, NOW)).toEqual({ finished: true, changed: true });
    const finish = ran("status = 'finished'")[0]!;
    expect(finish.sql).toContain("clock_ms_1 = 0");
    expect(finish.params).toEqual([2, new Date(T0 + 60_000), GAME]);
  });
});
