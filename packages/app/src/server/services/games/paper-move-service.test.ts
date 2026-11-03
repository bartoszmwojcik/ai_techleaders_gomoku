import { AUTO_MOVE_DELAY_MS, type Seat } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import {
  AUTO_TURN_MESSAGE,
  CELL_OCCUPIED_MESSAGE,
  FIRST_MOVE_CENTER_MESSAGE,
  GAME_FINISHED_MESSAGE,
  GAME_NOT_ACTIVE_MESSAGE,
  GAME_NOT_STARTED_MESSAGE,
  MOVE_TOO_FAR_MESSAGE,
  NOT_YOUR_TURN_MESSAGE,
  OFF_BOARD_MESSAGE,
  PaperMoveService,
  STALE_MOVE_MESSAGE,
  type PaperMoveOutcome,
} from "./paper-move-service";

const NOW = new Date("2026-11-02T12:00:00Z");
const GAME = "game-1";
const P = { playerId: "player-1" };

type Stone = { x: number; y: number; seat: Seat; auto?: boolean };

type World = {
  status?: string;
  blackSeat?: number | null;
  clocks?: [number, number];
  turnStartedMs?: number | null;
  autoSeat?: number | null;
  stones?: Stone[];
  /** The retry lookup: the stored move under the number of the request. */
  stored?: Stone | null;
  updateWritten?: boolean;
  settled?: boolean;
};

const state = { status: "active" };

function setup(world: World = {}) {
  const stones = world.stones ?? [];
  const calls: { sql: string; params: unknown[]; mode?: string }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params, mode });
    if (sql.includes("select x, y, seat from paper_moves")) return world.stored ? [world.stored] : [];
    if (sql.includes("from games where id")) {
      return [
        {
          status: world.status ?? "active",
          black_seat: world.blackSeat === undefined ? 1 : world.blackSeat,
          clock_ms_1: world.clocks?.[0] ?? 60_000,
          clock_ms_2: world.clocks?.[1] ?? 60_000,
          turn_started_ms: world.turnStartedMs === undefined ? NOW.getTime() - 5000 : world.turnStartedMs,
        },
      ];
    }
    if (sql.includes("from paper_game_states where")) {
      return [{ move_count: stones.length, auto_seat: world.autoSeat ?? null, pending_ms: null }];
    }
    if (sql.includes("from paper_moves where")) {
      return stones.map((stone, index) => ({
        move_number: index + 1,
        x: stone.x,
        y: stone.y,
        seat: stone.seat,
        is_auto: stone.auto ?? false,
        at_ms: NOW.getTime() - 1000 * (stones.length - index),
      }));
    }
    if (sql.includes("update paper_game_states")) return world.updateWritten === false ? [] : [{ game_id: GAME }];
    return [];
  });
  const tx = { execute } as unknown as EntityManager;
  const gameService = { stateOf: vi.fn(async () => state) };
  const paperSettler = { settle: vi.fn(async () => ({ finished: world.settled ?? false, changed: false })) };
  const service = new PaperMoveService({
    clock: { now: () => NOW },
    gameService: gameService as never,
    paperSettler: paperSettler as never,
  });
  const play = (seat: Seat, x: number, y: number, moveNumber: number): Promise<PaperMoveOutcome> =>
    service.play(tx, { participant: P, gameId: GAME, seat, now: NOW, input: { x, y, moveNumber } });
  const ran = (marker: string) => calls.filter(({ sql }) => sql.includes(marker));
  return { play, tx, calls, ran, gameService, paperSettler };
}

const refusalOf = (outcome: PaperMoveOutcome) => (outcome as { refusal: Error & { code?: string; status?: number } }).refusal;
const FIRST: Stone[] = [{ x: 50, y: 50, seat: 1 }];

describe("PaperMoveService.play, retry and settlement", () => {
  it("answers the same move under the same number again with the state, writing and settling nothing", async () => {
    const { play, gameService, paperSettler, calls, tx } = setup({ stored: { x: 50, y: 50, seat: 1 } });

    expect(await play(1, 50, 50, 1)).toBe(state);

    expect(gameService.stateOf).toHaveBeenCalledExactlyOnceWith(tx, P, GAME, 0, NOW);
    expect(paperSettler.settle).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["another cell", { x: 51, y: 50, seat: 1 as Seat }],
    ["another seat", { x: 50, y: 50, seat: 2 as Seat }],
  ])("does not take %s under that number for a retry", async (_name, stored) => {
    const { play, paperSettler } = setup({ stored });
    const outcome = await play(1, 50, 50, 1);
    expect(paperSettler.settle).toHaveBeenCalledOnce();
    expect(outcome).toBe(state);
  });

  it("settles the timeline first, under the same time, and says so when that finished the game", async () => {
    const { play, paperSettler, calls } = setup({ settled: true });
    expect(await play(1, 50, 50, 1)).toBe("settled");
    expect(paperSettler.settle).toHaveBeenCalledWith(GAME, expect.anything(), NOW);
    expect(calls.some(({ sql }) => sql.includes("from games where id"))).toBe(false);
  });
});

describe("PaperMoveService.play, refusals", () => {
  it("refuses a finished game with GAME_FINISHED", async () => {
    const { play } = setup({ status: "finished" });
    const refusal = refusalOf(await play(1, 50, 50, 1));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([409, "GAME_FINISHED", GAME_FINISHED_MESSAGE]);
  });

  it.each([
    ["a game that is waiting", { status: "waiting" }],
    ["a game without colours", { blackSeat: null }],
  ])("refuses %s with GAME_NOT_ACTIVE", async (_name, world) => {
    const { play } = setup(world);
    const refusal = refusalOf(await play(1, 50, 50, 1));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([409, "GAME_NOT_ACTIVE", GAME_NOT_ACTIVE_MESSAGE]);
  });

  it("refuses a move before the clock started with GAME_NOT_STARTED", async () => {
    const { play } = setup({ turnStartedMs: null });
    const refusal = refusalOf(await play(1, 50, 50, 1));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([409, "GAME_NOT_STARTED", GAME_NOT_STARTED_MESSAGE]);
  });

  it("refuses the opponent's turn with NOT_YOUR_TURN", async () => {
    const { play, ran } = setup();
    const refusal = refusalOf(await play(2, 50, 50, 1));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([409, "NOT_YOUR_TURN", NOT_YOUR_TURN_MESSAGE]);
    expect(ran("insert into paper_moves")).toHaveLength(0);
  });

  it("tells that the automat is on turn when it is its stone that is due", async () => {
    // Black (seat 1) plays by the automat; after one stone it is white's turn, after two black's again.
    const { play } = setup({ autoSeat: 1, stones: [{ x: 50, y: 50, seat: 1 }, { x: 51, y: 50, seat: 2 }] });
    const refusal = refusalOf(await play(2, 52, 50, 3));
    expect([refusal.code, refusal.message]).toEqual(["NOT_YOUR_TURN", AUTO_TURN_MESSAGE]);
    // The other player is on turn against an automat that plays the opposite seat: the ordinary message.
    const other = setup({ autoSeat: 2, stones: [{ x: 50, y: 50, seat: 1 }, { x: 51, y: 50, seat: 2 }] });
    expect(refusalOf(await other.play(2, 52, 50, 3)).message).toBe(NOT_YOUR_TURN_MESSAGE);
  });

  it("refuses a move number other than the next one with STALE_MOVE", async () => {
    const { play, ran } = setup();
    const refusal = refusalOf(await play(1, 50, 50, 3));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([409, "STALE_MOVE", STALE_MOVE_MESSAGE]);
    expect(ran("update paper_game_states")).toHaveLength(0);
  });

  it("refuses an occupied cell with CELL_OCCUPIED", async () => {
    const { play } = setup({ stones: [...FIRST, { x: 51, y: 50, seat: 2 }] });
    const refusal = refusalOf(await play(1, 51, 50, 3));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([409, "CELL_OCCUPIED", CELL_OCCUPIED_MESSAGE]);
  });

  it("refuses a cell off the sheet with a validation error", async () => {
    const { play } = setup({ stones: [...FIRST, { x: 51, y: 50, seat: 2 }] });
    const refusal = refusalOf(await play(1, 101, 50, 3));
    expect([refusal.status, refusal.message]).toEqual([400, OFF_BOARD_MESSAGE]);
  });

  it("wants the first stone in the middle", async () => {
    const { play } = setup();
    const refusal = refusalOf(await play(1, 10, 10, 1));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([400, "FIRST_MOVE_CENTER", FIRST_MOVE_CENTER_MESSAGE]);
  });

  it("refuses a stone farther than 3 cells from every other with MOVE_TOO_FAR", async () => {
    const { play, ran } = setup({ stones: [...FIRST, { x: 51, y: 50, seat: 2 }] });
    const refusal = refusalOf(await play(1, 55, 50, 3));
    expect([refusal.status, refusal.code, refusal.message]).toEqual([400, "MOVE_TOO_FAR", MOVE_TOO_FAR_MESSAGE]);
    expect(ran("insert into paper_moves")).toHaveLength(0);
  });
});

describe("PaperMoveService.play, a legal move", () => {
  it("writes the state, the stone and the clock of the player, then returns the state after the previous move", async () => {
    const { play, ran, gameService, tx, calls } = setup({ stones: FIRST, turnStartedMs: NOW.getTime() - 5000, clocks: [60_000, 40_000] });

    expect(await play(2, 51, 50, 2)).toBe(state);

    // Scores 0 : 0, no automat, the sheet counts only on the number the move was computed from.
    expect(ran("update paper_game_states")[0]!.params).toEqual([0, 0, null, NOW, GAME, 1]);
    expect(ran("insert into paper_moves")[0]).toMatchObject({ params: [GAME, 2, 51, 50, 2, NOW], mode: "run" });
    // Seat 2 spent 5 s of its clock; the turn restarts now.
    expect(ran("update games set clock_ms_1")[0]).toMatchObject({ params: [60_000, 35_000, NOW, GAME], mode: "run" });
    expect(gameService.stateOf).toHaveBeenCalledExactlyOnceWith(tx, P, GAME, 1, NOW);
    const order = ["update paper_game_states", "insert into paper_moves", "update games set clock_ms_1"];
    const index = order.map((part) => calls.findIndex(({ sql }) => sql.includes(part)));
    expect(index).toEqual([...index].sort((a, b) => a - b));
  });

  it("charges the clock of seat 1 for black's move", async () => {
    const { play, ran } = setup({ turnStartedMs: NOW.getTime() - 5000, clocks: [60_000, 40_000] });
    await play(1, 50, 50, 1);
    expect(ran("update games set clock_ms_1")[0]!.params).toEqual([55_000, 40_000, NOW, GAME]);
  });

  it("scores the five the stone completes", async () => {
    const stones: Stone[] = [
      { x: 50, y: 50, seat: 1 },
      { x: 50, y: 52, seat: 2 },
      { x: 51, y: 50, seat: 1 },
      { x: 52, y: 52, seat: 2 },
      { x: 52, y: 50, seat: 1 },
      { x: 54, y: 52, seat: 2 },
      { x: 53, y: 50, seat: 1 },
      { x: 56, y: 52, seat: 2 },
    ];
    const { play, ran } = setup({ stones });
    await play(1, 54, 50, 9);
    expect(ran("update paper_game_states")[0]!.params).toEqual([1, 0, null, NOW, GAME, 8]);
  });

  it("in the phase of the automat leaves the player's clock alone and schedules the automat's stone two seconds later", async () => {
    // Seat 1 is played by the automat; seat 2 plays on and its clock runs without a break (BR-50).
    const { play, ran, gameService } = setup({ autoSeat: 1, stones: [{ x: 50, y: 50, seat: 1 }] });

    expect(await play(2, 51, 50, 2)).toBe(state);

    expect(ran("update paper_game_states")[0]!.params).toEqual([
      0,
      0,
      new Date(NOW.getTime() + AUTO_MOVE_DELAY_MS),
      NOW,
      GAME,
      1,
    ]);
    expect(ran("insert into paper_moves")).toHaveLength(1);
    expect(ran("update games")).toHaveLength(0);
    expect(gameService.stateOf).toHaveBeenCalledOnce();
  });

  it("answers STALE_MOVE and writes no stone when the conditional update lost a race", async () => {
    const { play, ran, gameService } = setup({ stones: FIRST, updateWritten: false });
    const refusal = refusalOf(await play(2, 51, 50, 2));
    expect([refusal.status, refusal.code]).toEqual([409, "STALE_MOVE"]);
    expect(ran("insert into paper_moves")).toHaveLength(0);
    expect(ran("update games")).toHaveLength(0);
    expect(gameService.stateOf).not.toHaveBeenCalled();
  });
});
