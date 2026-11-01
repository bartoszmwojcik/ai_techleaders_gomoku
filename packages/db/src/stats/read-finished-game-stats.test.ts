import { describe, expect, it, vi } from "vitest";

import { readFinishedGameStats } from "./read-finished-game-stats";

describe("readFinishedGameStats", () => {
  it("runs one read-only aggregate with the clock as parameter and shapes the rows", async () => {
    const now = new Date("2026-10-31T22:30:00Z");
    const execute = vi.fn().mockResolvedValue([
      { kind_a: "account", kind_b: "agent", total: 2, today: 1, last7_days: 2 },
    ]);

    const stats = await readFinishedGameStats({ execute }, now);

    expect(execute).toHaveBeenCalledOnce();
    const [sql, params] = execute.mock.calls[0]!;
    expect(sql).toMatch(/^\s*select/);
    expect(sql).not.toMatch(/insert|update|delete/i);
    expect(sql).toContain("Europe/Warsaw");
    expect(sql).toContain("between t.today - 6 and t.today");
    expect(params).toEqual([now]);
    expect(stats.total).toBe(2);
    expect(stats.pairs[2]).toMatchObject({ pair: "account-agent", total: 2, today: 1 });
  });
});
