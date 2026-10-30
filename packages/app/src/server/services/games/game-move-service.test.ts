import {
  cellOf,
  createBitboard,
  encodeBitboard,
  encodeMoves,
  withStone,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { GameMoveService } from "./game-move-service";

const NOW = new Date("2026-10-29T12:00:00Z");
const bits = (cells: number[]) => encodeBitboard(cells.reduce(withStone, createBitboard()));

type Row = {
  status?: string;
  black_seat?: number | null;
  move_count?: number;
  black?: number[];
  white?: number[];
  moves?: number[];
  seat?: Seat;
  clocks?: [number, number];
  /** Epoch ms the turn started at; `null` = the clock has not started. */
  started?: number | null;
  winner_seat?: number | null;
  end_reason?: string | null;
};

function lockedRow(row: Row) {
  const moves = row.moves ?? [];
  return {
    status: row.status ?? "active",
    black_seat: row.black_seat === undefined ? 1 : row.black_seat,
    move_count: row.move_count ?? moves.length,
    stones_black: bits(row.black ?? []),
    stones_white: bits(row.white ?? []),
    moves: Buffer.from(encodeMoves(moves)),
    seat: row.seat ?? 1,
    winner_seat: row.winner_seat ?? null,
    end_reason: row.end_reason ?? null,
    clock_ms_1: row.clocks?.[0] ?? 600_000,
    clock_ms_2: row.clocks?.[1] ?? 600_000,
    turn_started_ms: row.started === undefined ? NOW.getTime() - 5_000 : row.started,
  };
}

function setup(row: Row | null, options: { written?: { id: string }[]; settled?: boolean } = {}) {
  const calls: { sql: string; params: unknown[]; mode?: string }[] = [];
  const execute = vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
    calls.push({ sql: sql.trim().replace(/\s+/g, " "), params, mode });
    if (sql.includes("for no key update")) return row ? [lockedRow(row)] : [];
    if (sql.includes("update games")) return options.written ?? [{ id: "game-1" }];
    return [];
  });
  const em = {
    execute,
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
  };
  const state = { status: "active" };
  const gameService = { stateOf: vi.fn(async () => state) };
  const timeoutSettler = {
    settleFor: vi.fn(async () => undefined),
    settleForGuest: vi.fn(async () => undefined),
    settleGame: vi.fn(async () => options.settled ?? false),
    settleExpired: vi.fn(async () => false),
  };
  const service = new GameMoveService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    gameService: gameService as never,
    timeoutSettler,
  });
  return { service, calls, gameService, timeoutSettler, state, em };
}

const P = { playerId: "player-1" };
const move = (x: number, y: number, moveNumber: number) => ({ x, y, moveNumber });
const code = async (promise: Promise<unknown>) =>
  ((await promise.catch((e: unknown) => e)) as { status: number; code: string });

describe("GameMoveService.play", () => {
  it("locks the game row with the caller's seat, writes one conditional update, returns the state", async () => {
    const { service, calls, gameService, timeoutSettler, state, em } = setup({});

    const result = await service.play(P, "game-1", move(7, 7, 1));

    expect(result).toBe(state);
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(calls[0]!.sql).toContain("for no key update of g");
    expect(calls[0]!.params).toEqual(["game-1", "player-1"]);
    expect(timeoutSettler.settleGame).toHaveBeenCalledWith("game-1", em, NOW);
    const update = calls[1]!;
    expect(update.sql).toContain("move_count = ?");
    expect(update.sql).not.toContain("finished");
    expect(update.params).toEqual([
      bits([cellOf(7, 7)]),
      bits([]),
      Buffer.from([cellOf(7, 7)]),
      595_000,
      600_000,
      NOW,
      "game-1",
      0,
    ]);
    expect(calls).toHaveLength(2);
    expect(gameService.stateOf).toHaveBeenCalledWith(em, P, "game-1", 0, NOW);
  });

  it("places white on the second move for the other seat", async () => {
    const { service, calls } = setup({ black_seat: 2, black: [112], moves: [112], seat: 1 });
    await service.play(P, "game-1", move(8, 7, 2));
    expect(calls[1]!.params).toEqual([bits([112]), bits([cellOf(8, 7)]), Buffer.from([cellOf(8, 7)]), 595_000, 600_000, NOW, "game-1", 1]);
  });

  it("finishes the game with a five, stamps the time and frees both slots", async () => {
    const black = [0, 1, 2, 3].map((i) => 105 + i);
    const white = [0, 1, 2, 3].map((i) => i);
    const moves = black.flatMap((cell, i) => [cell, white[i]!]);
    const { service, calls } = setup({ black, white, moves, seat: 1 });

    await service.play(P, "game-1", move(4, 7, 9));

    const finish = calls.find(({ sql }) => sql.includes("status = 'finished'"))!;
    expect(finish.params).toEqual([
      bits([...black, 109]),
      bits(white),
      Buffer.from([109]),
      595_000,
      600_000,
      NOW,
      1,
      "five_in_row",
      NOW,
      "game-1",
      8,
    ]);
    const release = calls.at(-1)!;
    expect(release.sql).toContain("update game_players set is_active = false");
    expect(release.params).toEqual(["game-1"]);
    expect(release.mode).toBe("run");
  });

  it("finishes with a draw (no winner) on the 225th stone", async () => {
    const cells = Array.from({ length: 225 }, (_, c) => c);
    const isBlack = (c: number) => (Math.floor((c % 15) / 2) + Math.floor(c / 15)) % 2 === 0;
    const blackCells = cells.filter(isBlack);
    const whiteCells = cells.filter((c) => !isBlack(c));
    const last = blackCells.at(-1)!;
    const moves = blackCells.flatMap((cell, i) => (i < whiteCells.length ? [cell, whiteCells[i]!] : [cell])).slice(0, 224);
    const { service, calls } = setup({
      black: blackCells.slice(0, -1),
      white: whiteCells,
      moves,
      move_count: 224,
      seat: 1,
    });

    await service.play(P, "game-1", move(last % 15, Math.floor(last / 15), 225));

    const finish = calls.find(({ sql }) => sql.includes("status = 'finished'"))!;
    expect(finish.params.slice(6, 9)).toEqual([null, "draw", NOW]);
  });

  it("answers a retry of the same move with the state and writes nothing", async () => {
    const { service, calls, gameService, timeoutSettler } = setup({
      black: [112],
      moves: [112],
      seat: 1,
      black_seat: 1,
    });
    await service.play(P, "game-1", move(7, 7, 1));
    expect(calls).toHaveLength(1);
    expect(timeoutSettler.settleGame).not.toHaveBeenCalled();
    expect(gameService.stateOf).toHaveBeenCalledWith(expect.anything(), P, "game-1", 0, NOW);
  });

  it("answers a retry of the move that ended the game, too", async () => {
    const { service, calls } = setup({
      status: "finished",
      black: [112],
      moves: [112],
      seat: 1,
    });
    await service.play(P, "game-1", move(7, 7, 1));
    expect(calls).toHaveLength(1);
  });

  it("does not treat the opponent's move number or another cell as a retry", async () => {
    const mine = setup({ black: [112], moves: [112], seat: 2, black_seat: 1 });
    expect(await code(mine.service.play(P, "game-1", move(7, 7, 1)))).toMatchObject({ status: 409, code: "STALE_MOVE" });
    const other = setup({ black: [112], moves: [112], seat: 1, black_seat: 1 });
    expect(await code(other.service.play(P, "game-1", move(7, 8, 1)))).toMatchObject({ status: 409, code: "NOT_YOUR_TURN" });
  });

  it("answers 404 for a stranger or a missing game", async () => {
    const { service, gameService } = setup(null);
    expect(await code(service.play(P, "game-1", move(0, 0, 1)))).toMatchObject({ status: 404 });
    expect(gameService.stateOf).not.toHaveBeenCalled();
  });

  it("rejects a move after the clock settled the game", async () => {
    const { service, calls } = setup({}, { settled: true });
    expect(await code(service.play(P, "game-1", move(0, 0, 1)))).toMatchObject({ status: 409, code: "GAME_FINISHED" });
    expect(calls).toHaveLength(1);
  });

  it("charges the time of the turn to the mover only and restarts the turn", async () => {
    const { service, calls } = setup({ clocks: [300_000, 200_000], started: NOW.getTime() - 12_345 });
    await service.play(P, "game-1", move(7, 7, 1));
    expect(calls[1]!.params.slice(3, 6)).toEqual([287_655, 200_000, NOW]);
  });

  it("charges seat 2 into its own clock", async () => {
    const { service, calls } = setup({ black: [112], moves: [112], seat: 2, black_seat: 1, clocks: [400_000, 300_000] });
    await service.play(P, "game-1", move(8, 7, 2));
    expect(calls[1]!.params.slice(3, 6)).toEqual([400_000, 295_000, NOW]);
  });

  it("charges nothing for a negative elapsed time (clock set back)", async () => {
    const { service, calls } = setup({ started: NOW.getTime() + 60_000 });
    await service.play(P, "game-1", move(7, 7, 1));
    expect(calls[1]!.params.slice(3, 6)).toEqual([600_000, 600_000, NOW]);
  });

  it("rejects a move before the clock started, whoever is to move", async () => {
    for (const seat of [1, 2] as const) {
      const { service, calls } = setup({ started: null, seat });
      expect(await code(service.play(P, "game-1", move(7, 7, 1)))).toMatchObject({
        status: 409,
        code: "GAME_NOT_STARTED",
      });
      expect(calls).toHaveLength(1);
    }
  });

  it("rejects a move in a finished game", async () => {
    const { service } = setup({ status: "finished", black: [112], moves: [112] });
    expect(await code(service.play(P, "game-1", move(0, 0, 2)))).toMatchObject({ code: "GAME_FINISHED" });
  });

  it.each([["waiting", 1], ["cancelled", 1], ["active", null]] as const)(
    "rejects a move in a %s game without a running turn",
    async (status, blackSeat) => {
      const { service } = setup({ status, black_seat: blackSeat });
      expect(await code(service.play(P, "game-1", move(0, 0, 1)))).toMatchObject({ status: 409, code: "GAME_NOT_ACTIVE" });
    },
  );

  it("rejects a move out of turn", async () => {
    const { service, calls } = setup({ seat: 2, black_seat: 1 });
    expect(await code(service.play(P, "game-1", move(0, 0, 1)))).toMatchObject({ code: "NOT_YOUR_TURN" });
    expect(calls).toHaveLength(1);
  });

  it("rejects a stale move number (the turn check comes first)", async () => {
    const { service } = setup({ black: [112], moves: [112], seat: 2, black_seat: 1 });
    expect(await code(service.play(P, "game-1", move(0, 0, 1)))).toMatchObject({ code: "STALE_MOVE" });
    expect(await code(service.play(P, "game-1", move(0, 0, 3)))).toMatchObject({ code: "STALE_MOVE" });
  });

  it("rejects an occupied cell of either colour", async () => {
    const { service } = setup({ black: [112], white: [113], moves: [112, 113], seat: 1 });
    expect(await code(service.play(P, "game-1", move(7, 7, 3)))).toMatchObject({ code: "CELL_OCCUPIED" });
    expect(await code(service.play(P, "game-1", move(8, 7, 3)))).toMatchObject({ code: "CELL_OCCUPIED" });
  });

  it("rejects coordinates that are not on the board", async () => {
    const { service } = setup({});
    expect(await code(service.play(P, "game-1", move(20, 14, 1)))).toMatchObject({ status: 400 });
  });

  it("answers 409 instead of 500 when the conditional update loses a race", async () => {
    const { service, gameService } = setup({}, { written: [] });
    expect(await code(service.play(P, "game-1", move(7, 7, 1)))).toMatchObject({ status: 409, code: "STALE_MOVE" });
    expect(gameService.stateOf).not.toHaveBeenCalled();
  });
});

describe("GameMoveService.resign", () => {
  it("locks the game, finishes it for the opponent, frees both slots, returns the state", async () => {
    const { service, calls, gameService, timeoutSettler, state, em } = setup({ seat: 1 });

    expect(await service.resign(P, "game-1")).toBe(state);

    expect(em.transactional).toHaveBeenCalledOnce();
    expect(calls[0]!.sql).toContain("for no key update of g");
    expect(calls[0]!.params).toEqual(["game-1", "player-1"]);
    expect(timeoutSettler.settleGame).toHaveBeenCalledWith("game-1", em, NOW);
    expect(calls[1]!.sql).toContain("status = 'finished'");
    expect(calls[1]!.sql).toContain("status = 'active'");
    expect(calls[1]!.params).toEqual([2, "resignation", NOW, "game-1"]);
    expect(calls[2]!.sql).toContain("update game_players set is_active = false");
    expect(calls[2]!.mode).toBe("run");
    expect(calls).toHaveLength(3);
    expect(gameService.stateOf).toHaveBeenCalledWith(em, P, "game-1", 0, NOW);
  });

  it("gives the win to seat 1 when seat 2 resigns, also out of turn and before any move", async () => {
    const { service, calls } = setup({ seat: 2, moves: [], started: null });
    await service.resign(P, "game-1");
    expect(calls[1]!.params).toEqual([1, "resignation", NOW, "game-1"]);
  });

  it("answers 404 for a stranger or a missing game", async () => {
    const { service, gameService } = setup(null);
    expect(await code(service.resign(P, "game-1"))).toMatchObject({ status: 404 });
    expect(gameService.stateOf).not.toHaveBeenCalled();
  });

  it("answers a repeat by the player who resigned with the state and writes nothing", async () => {
    const { service, calls, gameService, state, timeoutSettler } = setup({
      status: "finished",
      seat: 1,
      winner_seat: 2,
      end_reason: "resignation",
    });
    expect(await service.resign(P, "game-1")).toBe(state);
    expect(calls).toHaveLength(1);
    expect(timeoutSettler.settleGame).not.toHaveBeenCalled();
    expect(gameService.stateOf).toHaveBeenCalledOnce();
  });

  it("refuses the loser of a resignation by the opponent with GAME_FINISHED", async () => {
    const { service } = setup({ status: "finished", seat: 1, winner_seat: 1, end_reason: "resignation" });
    expect(await code(service.resign(P, "game-1"))).toMatchObject({ status: 409, code: "GAME_FINISHED" });
  });

  it("refuses a game finished another way", async () => {
    const { service, calls } = setup({ status: "finished", winner_seat: 1, end_reason: "five_in_row" });
    expect(await code(service.resign(P, "game-1"))).toMatchObject({ status: 409, code: "GAME_FINISHED" });
    expect(calls).toHaveLength(1);
  });

  it("lets the loss on time win over the resignation, thrown after the transaction", async () => {
    const { service, calls, gameService } = setup({}, { settled: true });
    expect(await code(service.resign(P, "game-1"))).toMatchObject({ status: 409, code: "GAME_FINISHED" });
    expect(calls).toHaveLength(1);
    expect(gameService.stateOf).not.toHaveBeenCalled();
  });

  it("refuses a waiting or cancelled game", async () => {
    for (const status of ["waiting", "cancelled"]) {
      const { service, calls } = setup({ status, black_seat: null });
      expect(await code(service.resign(P, "game-1"))).toMatchObject({ status: 409, code: "GAME_NOT_ACTIVE" });
      expect(calls).toHaveLength(1);
    }
  });

  it("answers 409 instead of 500 when the conditional update loses a race", async () => {
    const { service, gameService } = setup({}, { written: [] });
    expect(await code(service.resign(P, "game-1"))).toMatchObject({ status: 409, code: "GAME_FINISHED" });
    expect(gameService.stateOf).not.toHaveBeenCalled();
  });
});
