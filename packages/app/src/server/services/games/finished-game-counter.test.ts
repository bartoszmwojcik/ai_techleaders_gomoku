import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { recordFinishedGame } from "./finished-game-counter";

describe("recordFinishedGame", () => {
  it("upserts the counter of the pair and day in one statement through the given tx", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);

    await recordFinishedGame({ execute } as unknown as EntityManager, "game-1");

    expect(execute).toHaveBeenCalledOnce();
    const [sql, params, mode] = execute.mock.calls[0]!;
    expect(sql).toContain("insert into game_pair_counters");
    expect(sql).toContain("g.status = 'finished'");
    expect(sql).toContain("Europe/Warsaw");
    expect(sql).toContain("on conflict (day, kind_a, kind_b)");
    expect(sql).not.toContain("$1");
    expect(params).toEqual(["game-1", "game-1"]);
    expect(mode).toBe("run");
  });
});
