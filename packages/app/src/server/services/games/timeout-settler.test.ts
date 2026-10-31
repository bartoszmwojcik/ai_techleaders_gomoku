import { INITIAL_CLOCK_MS } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { SqlTimeoutSettler } from "./timeout-settler";

const NOW = new Date("2026-10-29T12:00:00Z");

type Snapshot = {
  status?: string;
  black_seat?: number | null;
  move_count?: number;
  clock_ms_1?: number;
  clock_ms_2?: number;
  /** Seconds before NOW the turn began; `null` = clock not started. */
  turnAgo?: number | null;
};

function snapshot(row: Snapshot) {
  const ago = row.turnAgo === undefined ? 0 : row.turnAgo;
  return {
    status: row.status ?? "active",
    black_seat: row.black_seat === undefined ? 1 : row.black_seat,
    move_count: row.move_count ?? 0,
    clock_ms_1: row.clock_ms_1 ?? INITIAL_CLOCK_MS,
    clock_ms_2: row.clock_ms_2 ?? INITIAL_CLOCK_MS,
    turn_started_ms: ago === null ? null : NOW.getTime() - ago * 1000,
  };
}

function setup(
  row: Snapshot | null,
  options: { finished?: boolean; candidates?: string[]; rowAfterLock?: Snapshot | null } = {},
) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let snapshots = 0;
  const em = {
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      const text = sql.trim().replace(/\s+/g, " ");
      calls.push({ sql: text, params });
      if (text.startsWith("select status")) {
        const source = snapshots++ > 0 && options.rowAfterLock !== undefined ? options.rowAfterLock : row;
        return source ? [snapshot(source)] : [];
      }
      if (text.includes("from games g join game_players")) return (options.candidates ?? []).map((id) => ({ id }));
      if (text.startsWith("update games set status")) return options.finished === false ? [] : [{ id: "game-1" }];
      return [];
    }),
  };
  const settler = new SqlTimeoutSettler({ em: em as unknown as EntityManager, clock: { now: () => NOW } });
  return { settler, em, calls };
}
const tx = (em: unknown) => em as EntityManager;
const sqlOf = (calls: { sql: string }[]) => calls.map(({ sql }) => sql.split(" ").slice(0, 3).join(" "));

describe("SqlTimeoutSettler.settleGame", () => {
  it("finishes the game of the player who ran out of time and frees the slots", async () => {
    // Seat 1 is black and on turn; 600 s have passed.
    const { settler, em, calls } = setup({ turnAgo: 600 });
    expect(await settler.settleGame("game-1", tx(em))).toBe(true);
    const finish = calls[1]!;
    expect(finish.sql).toContain("end_reason = 'timeout'");
    expect(finish.sql).toContain("clock_ms_1 = 0");
    expect(finish.params).toEqual([2, new Date(NOW.getTime() - 0), "game-1", 0]);
    expect(calls[2]!.sql).toContain("insert into game_pair_counters");
    expect(calls[2]!.params).toEqual(["game-1", "game-1"]);
    expect(calls[3]!.sql).toContain("update game_players set is_active = false");
    expect(calls[3]!.params).toEqual(["game-1"]);
    expect(calls).toHaveLength(4);
  });

  it("stamps the end with the moment the time ran out, not the moment it was noticed", async () => {
    const { settler, em, calls } = setup({ turnAgo: 700, clock_ms_1: 100_000 });
    expect(await settler.settleGame("game-1", tx(em), NOW)).toBe(true);
    expect(calls[1]!.params[1]).toEqual(new Date(NOW.getTime() - 600_000));
  });

  it("empties the clock of seat 2 when it is the loser", async () => {
    const { settler, em, calls } = setup({ turnAgo: 601, move_count: 1, black_seat: 1 });
    expect(await settler.settleGame("game-1", tx(em))).toBe(true);
    expect(calls[1]!.sql).toContain("clock_ms_2 = 0");
    expect(calls[1]!.params[0]).toBe(1);
    expect(calls[1]!.params[3]).toBe(1);
  });

  it("settles at exactly the deadline but not one millisecond earlier", async () => {
    const exact = setup({ turnAgo: 600 });
    expect(await exact.settler.settleGame("game-1", tx(exact.em))).toBe(true);
    const early = setup({ turnAgo: 599.999 });
    expect(await early.settler.settleGame("game-1", tx(early.em))).toBe(false);
    expect(early.calls).toHaveLength(1);
  });

  it.each([
    ["missing game", null],
    ["not active", { status: "finished", turnAgo: 9999 }],
    ["no black seat", { black_seat: null, turnAgo: 9999 }],
    ["clock not started", { turnAgo: null }],
  ] as const)("does nothing for a %s", async (_name, row) => {
    const { settler, em, calls } = setup(row);
    expect(await settler.settleGame("game-1", tx(em))).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("returns false and frees nothing when the conditional update finds nobody to finish", async () => {
    const { settler, em, calls } = setup({ turnAgo: 700 }, { finished: false });
    expect(await settler.settleGame("game-1", tx(em))).toBe(false);
    expect(calls).toHaveLength(2);
  });
});

describe("SqlTimeoutSettler.settleExpired", () => {
  it("is a plain read while the time is not up", async () => {
    const { settler, em, calls } = setup({ turnAgo: 10 });
    expect(await settler.settleExpired("game-1", tx(em))).toBe(false);
    expect(sqlOf(calls)).toEqual(["select status, black_seat,"]);
  });

  it("locks the game and settles once the time is up", async () => {
    const { settler, em, calls } = setup({ turnAgo: 650 });
    expect(await settler.settleExpired("game-1", tx(em), NOW)).toBe(true);
    expect(sqlOf(calls)).toEqual([
      "select status, black_seat,",
      "select id from",
      "select status, black_seat,",
      "update games set",
      "insert into game_pair_counters",
      "update game_players set",
    ]);
    expect(calls[1]!.sql).toContain("for update");
  });

  it("re-reads under the lock: a move made meanwhile wins", async () => {
    const { settler, em, calls } = setup({ turnAgo: 650 }, { rowAfterLock: { turnAgo: 1 } });
    expect(await settler.settleExpired("game-1", tx(em))).toBe(false);
    expect(sqlOf(calls)).toEqual(["select status, black_seat,", "select id from", "select status, black_seat,"]);
  });
});

describe("SqlTimeoutSettler.settleFor", () => {
  it("does not lock anything for a user without a running game", async () => {
    const { settler, em } = setup(null);
    await settler.settleFor("user-1");
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("locks the user before the games and settles the ones that ran out", async () => {
    const { settler, calls } = setup({ turnAgo: 700 }, { candidates: ["game-1"] });
    await settler.settleFor("user-1");
    expect(sqlOf(calls).slice(0, 2)).toEqual(["select g.id from", "select id from"]);
    expect(calls[1]!.sql).toContain("from users");
    expect(calls[1]!.sql).toContain("for no key update");
    expect(calls.some(({ sql }) => sql.startsWith("update games set status"))).toBe(true);
    const order = calls.map(({ sql }) => sql);
    expect(order.findIndex((s) => s.includes("from users"))).toBeLessThan(
      order.findIndex((s) => s.includes("from games where id = ? for update")),
    );
  });

  it("leaves a running game whose time is not up alone", async () => {
    const { settler, calls } = setup({ turnAgo: 5 }, { candidates: ["game-1"] });
    await settler.settleFor("user-1");
    expect(calls.some(({ sql }) => sql.startsWith("update games"))).toBe(false);
  });
});

describe("SqlTimeoutSettler.settleForGuest", () => {
  it("does not lock anything for a token without a running game", async () => {
    const { settler, em, calls } = setup(null);
    await settler.settleForGuest("hash");
    expect(em.transactional).not.toHaveBeenCalled();
    expect(calls[0]!.params).toEqual(["hash"]);
    expect(calls[0]!.sql).toContain("p.guest_token_hash = ?");
  });

  it("settles the running games of the token without locking a user", async () => {
    const { settler, calls } = setup({ turnAgo: 700 }, { candidates: ["game-1"] });
    await settler.settleForGuest("hash");
    expect(calls.some(({ sql }) => sql.includes("from users"))).toBe(false);
    expect(calls.some(({ sql }) => sql.startsWith("update games set status"))).toBe(true);
  });

  it("leaves a running game whose time is not up alone", async () => {
    const { settler, calls } = setup({ turnAgo: 5 }, { candidates: ["game-1"] });
    await settler.settleForGuest("hash");
    expect(calls.some(({ sql }) => sql.startsWith("update games"))).toBe(false);
  });
});
