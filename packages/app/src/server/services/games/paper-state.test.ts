import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { loadPaperSnapshot } from "./paper-state";

function fake(state: Record<string, unknown>[], moves: Record<string, unknown>[] = []) {
  const execute = vi.fn(async (sql: string) => (sql.includes("from paper_game_states") ? state : moves));
  return { tx: { execute } as unknown as EntityManager, execute };
}

describe("loadPaperSnapshot", () => {
  it("is null for a game without a sheet (classic) and reads no moves", async () => {
    const { tx, execute } = fake([]);
    expect(await loadPaperSnapshot(tx, "game-1")).toBeNull();
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("paper_game_states"), ["game-1"]);
  });

  it("reads the state and the ordered moves, with times as epoch milliseconds", async () => {
    const { tx, execute } = fake(
      [{ move_count: 2, auto_seat: 2, pending_ms: "1762171200000" }],
      [
        { move_number: 1, x: 50, y: 50, seat: 1, is_auto: false, at_ms: "1762171100000" },
        { move_number: 2, x: 51, y: 50, seat: 2, is_auto: true, at_ms: 1762171150000 },
      ],
    );

    expect(await loadPaperSnapshot(tx, "game-1")).toEqual({
      moveCount: 2,
      autoSeat: 2,
      pendingAutoAtMs: 1762171200000,
      moves: [
        { n: 1, x: 50, y: 50, seat: 1, auto: false, atMs: 1762171100000 },
        { n: 2, x: 51, y: 50, seat: 2, auto: true, atMs: 1762171150000 },
      ],
    });
    expect(execute).toHaveBeenLastCalledWith(expect.stringContaining("order by move_number"), ["game-1"]);
  });

  it("has no pending stone and no automat outside its phase", async () => {
    const { tx } = fake([{ move_count: 0, auto_seat: null, pending_ms: null }]);
    expect(await loadPaperSnapshot(tx, "game-1")).toEqual({
      moveCount: 0,
      autoSeat: null,
      pendingAutoAtMs: null,
      moves: [],
    });
  });
});
