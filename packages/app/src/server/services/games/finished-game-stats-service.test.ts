import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { FinishedGameStatsService } from "./finished-game-stats-service";

describe("FinishedGameStatsService", () => {
  it("reads the stats with the application clock", async () => {
    const now = new Date("2026-10-31T10:00:00Z");
    const execute = vi.fn().mockResolvedValue([
      { kind_a: "account", kind_b: "account", total: 5, today: 1, last7_days: 4 },
    ]);
    const service = new FinishedGameStatsService({
      em: { execute } as unknown as EntityManager,
      clock: { now: () => now },
    });

    const stats = await service.finishedByPair();

    expect(execute.mock.calls[0]![1]).toEqual([now]);
    expect(stats).toMatchObject({ total: 5, today: 1, last7Days: 4 });
  });
});
