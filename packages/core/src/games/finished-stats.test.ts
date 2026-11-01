import { describe, expect, it } from "vitest";

import { buildFinishedGameStats } from "./finished-stats";

describe("buildFinishedGameStats", () => {
  it("returns the five known pairs with zeros for no rows", () => {
    const stats = buildFinishedGameStats([]);
    expect(stats).toMatchObject({ timeZone: "Europe/Warsaw", total: 0, today: 0, last7Days: 0 });
    expect(stats.pairs.map(({ pair }) => pair)).toEqual([
      "account-account",
      "account-guest",
      "account-agent",
      "guest-guest",
      "agent-guest",
    ]);
    expect(stats.pairs.every(({ total }) => total === 0)).toBe(true);
  });

  it("fills the known pairs in a fixed order and sums the totals (strings from sum() included)", () => {
    const stats = buildFinishedGameStats([
      { kind_a: "guest", kind_b: "guest", total: "3", today: "1", last7_days: "2" },
      { kind_a: "account", kind_b: "account", total: 4, today: 0, last7_days: 4 },
    ]);
    expect(stats.pairs[0]).toEqual({
      pair: "account-account",
      kinds: ["account", "account"],
      total: 4,
      today: 0,
      last7Days: 4,
    });
    expect(stats.pairs[3]).toMatchObject({ pair: "guest-guest", total: 3, today: 1, last7Days: 2 });
    expect([stats.total, stats.today, stats.last7Days]).toEqual([7, 1, 6]);
  });

  it("appends unknown pairs alphabetically after the known ones and counts them", () => {
    const stats = buildFinishedGameStats([
      { kind_a: "robot", kind_b: "robot", total: 1, today: 1, last7_days: 1 },
      { kind_a: "account", kind_b: "bot", total: 2, today: 0, last7_days: 2 },
    ]);
    expect(stats.pairs.slice(5).map(({ pair }) => pair)).toEqual(["account-bot", "robot-robot"]);
    expect(stats.total).toBe(3);
  });
});
