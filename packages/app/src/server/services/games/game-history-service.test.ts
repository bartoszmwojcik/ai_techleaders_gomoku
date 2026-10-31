import { decodeHistoryCursor, encodeHistoryCursor, HISTORY_PAGE_SIZE, ValidationError } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { GameHistoryService } from "./game-history-service";

const USER = "user-1";
const ID = "0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978";

type Row = Record<string, unknown>;

const row = (over: Row = {}): Row => ({
  id: ID,
  finished_at: "2026-10-31T15:04:05.123456Z",
  end_reason: "five_in_row",
  winner_seat: 1,
  my_seat: 1,
  opponent_kind: "account",
  opponent_seat: 2,
  opponent_nickname: null,
  opponent_name: "Alicja_99",
  ...over,
});

function setup(rows: Row[] = []) {
  const order: string[] = [];
  const execute = vi.fn(async () => {
    order.push("query");
    return rows;
  });
  const timeoutSettler = {
    settleFor: vi.fn(async () => {
      order.push("settle");
    }),
  };
  const service = new GameHistoryService({
    em: { execute } as unknown as EntityManager,
    timeoutSettler: timeoutSettler as never,
  });
  return { service, execute, timeoutSettler, order };
}

describe("GameHistoryService.list", () => {
  it("settles the games out of time, then reads the first page for the account", async () => {
    const { service, execute, timeoutSettler, order } = setup([row()]);

    const page = await service.list(USER);

    expect(timeoutSettler.settleFor).toHaveBeenCalledExactlyOnceWith(USER);
    expect(order).toEqual(["settle", "query"]);
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("g.status = 'finished'");
    expect(sql).toContain("order by g.finished_at desc, g.id desc");
    expect(sql).not.toContain("::timestamptz");
    expect(sql).not.toMatch(/email|password/);
    expect(params).toEqual([USER, HISTORY_PAGE_SIZE + 1]);
    expect(page).toEqual({
      entries: [
        {
          gameId: ID,
          finishedAt: "2026-10-31T15:04:05.123Z",
          result: "win",
          reason: "five_in_row",
          opponent: { kind: "account", name: "Alicja_99" },
        },
      ],
      nextCursor: null,
    });
  });

  it("returns an empty page for an account without games", async () => {
    expect(await setup([]).service.list(USER)).toEqual({ entries: [], nextCursor: null });
  });

  it("continues after the cursor, binding its parts", async () => {
    const { service, execute } = setup([]);
    const cursor = encodeHistoryCursor({ finishedAt: "2026-10-30T10:00:00.000001Z", id: ID });

    await service.list(USER, { cursor });

    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("(g.finished_at, g.id) < (?::timestamptz, ?::uuid)");
    expect(params).toEqual([USER, "2026-10-30T10:00:00.000001Z", ID, HISTORY_PAGE_SIZE + 1]);
  });

  it("rejects a foreign cursor before settling or reading", async () => {
    const { service, execute, timeoutSettler } = setup([row()]);

    await expect(service.list(USER, { cursor: "garbage" })).rejects.toBeInstanceOf(ValidationError);

    expect(timeoutSettler.settleFor).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns exactly a page without a next cursor", async () => {
    const rows = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) => row({ id: `id-${i}` }));
    const page = await setup(rows).service.list(USER);
    expect(page.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(page.nextCursor).toBeNull();
  });

  it("drops the extra row and points the cursor at the last row kept", async () => {
    const rows = Array.from({ length: HISTORY_PAGE_SIZE + 1 }, (_, i) =>
      row({ id: ID.replace(/.$/, String(i % 10)), finished_at: `2026-10-31T15:00:${String(59 - i).padStart(2, "0")}.000100Z` }),
    );

    const page = await setup(rows).service.list(USER);

    expect(page.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(decodeHistoryCursor(page.nextCursor!)).toEqual({
      finishedAt: rows[HISTORY_PAGE_SIZE - 1]!.finished_at,
      id: rows[HISTORY_PAGE_SIZE - 1]!.id,
    });
  });

  it.each([
    ["win", 2, 2, "five_in_row"],
    ["loss", 1, 2, "timeout"],
    ["loss", 2, 1, "resignation"],
    ["draw", null, 1, "draw"],
  ] as const)("shows %s from the seat of the reader (winner %s, seat %s, %s)", async (result, winner, seat, reason) => {
    const page = await setup([row({ winner_seat: winner, my_seat: seat, end_reason: reason })]).service.list(USER);
    expect(page.entries[0]).toMatchObject({ result, reason });
  });

  it("names the opponents: a deleted account has no name, a guest has a nickname or a default, an agent none", async () => {
    const { service } = setup([
      row({ opponent_name: null }),
      row({ opponent_kind: "guest", opponent_nickname: "Kasia", opponent_name: null }),
      row({ opponent_kind: "guest", opponent_nickname: null, opponent_seat: 2, opponent_name: null }),
      row({ opponent_kind: "agent", opponent_name: null }),
    ]);

    const page = await service.list(USER);

    expect(page.entries.map((entry) => entry.opponent)).toEqual([
      { kind: "account", name: null },
      { kind: "guest", name: "Kasia" },
      { kind: "guest", name: "Gracz 2" },
      { kind: "agent", name: null },
    ]);
  });

  it("does not put an account id or an e-mail in an entry", async () => {
    const page = await setup([row({ user_id: "secret", email: "a@b.pl" })]).service.list(USER);
    expect(JSON.stringify(page)).not.toMatch(/secret|a@b\.pl|userId|email/);
  });
});
