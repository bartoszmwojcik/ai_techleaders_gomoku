import { describe, expect, it } from "vitest";

import { buildFinishedGameStats, KNOWN_PAIRS } from "./finished-stats";
import { PARTICIPANT_KINDS } from "./types";

describe("buildFinishedGameStats", () => {
  it("returns the seven known pairs with zeros for no rows", () => {
    const stats = buildFinishedGameStats([]);
    expect(stats).toMatchObject({ timeZone: "Europe/Warsaw", total: 0, today: 0, last7Days: 0 });
    expect(stats.pairs.map(({ pair }) => pair)).toEqual([
      "account-account",
      "account-guest",
      "account-agent",
      "guest-guest",
      "agent-guest",
      "account-bot",
      "bot-guest",
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
      { kind_a: "llm", kind_b: "account", total: 2, today: 0, last7_days: 2 },
    ]);
    expect(stats.pairs.slice(7).map(({ pair }) => pair)).toEqual(["llm-account", "robot-robot"]);
    expect(stats.total).toBe(3);
  });

  it("counts the games with the bot in their own two pairs (hosted-bot R12)", () => {
    const stats = buildFinishedGameStats([
      { kind_a: "account", kind_b: "bot", total: 2, today: 1, last7_days: 2 },
      { kind_a: "bot", kind_b: "guest", total: 5, today: 0, last7_days: 3 },
    ]);
    expect(stats.pairs.slice(5)).toEqual([
      { pair: "account-bot", kinds: ["account", "bot"], total: 2, today: 1, last7Days: 2 },
      { pair: "bot-guest", kinds: ["bot", "guest"], total: 5, today: 0, last7Days: 3 },
    ]);
    expect([stats.total, stats.today, stats.last7Days]).toEqual([7, 1, 5]);
  });
});

describe("KNOWN_PAIRS", () => {
  it("stores every pair in the alphabetical order of recordFinishedGame (min, max) and covers every kind but agent-agent and bot-bot", () => {
    for (const [a, b] of KNOWN_PAIRS) expect([a, b]).toEqual([a, b].sort());
    const keys = KNOWN_PAIRS.map(([a, b]) => `${a}-${b}`);
    expect(new Set(keys).size).toBe(keys.length);
    const possible = PARTICIPANT_KINDS.flatMap((a) => PARTICIPANT_KINDS.filter((b) => a <= b).map((b) => `${a}-${b}`));
    expect(possible.filter((key) => !keys.includes(key)).sort()).toEqual(["agent-agent", "agent-bot", "bot-bot"]);
  });
});
