import { SPECTATOR_PRESENCE_MS } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { countPresentSpectators, readAudience } from "./audience";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const emReturning = (n: number) => {
  const execute = vi.fn(async () => [{ n }]);
  return { em: { execute } as unknown as EntityManager, execute };
};

describe("countPresentSpectators", () => {
  it("counts the spectators whose access lasts and who were seen within the presence window", async () => {
    const { em, execute } = emReturning(5);
    expect(await countPresentSpectators(em, "g1", NOW)).toBe(5);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("last_seen_at > ?"), [
      "g1",
      NOW,
      new Date(NOW.getTime() - SPECTATOR_PRESENCE_MS),
    ]);
  });
});

describe("readAudience", () => {
  it("is the count for a public game in progress", async () => {
    const { em } = emReturning(3);
    expect(await readAudience(em, { id: "g1", status: "active", isPublic: true }, NOW)).toEqual({ spectators: 3 });
  });

  it.each([
    ["a private game (or a closed audience)", { status: "active", isPublic: false }],
    ["a finished game", { status: "finished", isPublic: true }],
    ["a waiting game", { status: "waiting", isPublic: true }],
  ])("is nothing for %s, without a query", async (_name, game) => {
    const { em, execute } = emReturning(3);
    expect(await readAudience(em, { id: "g1", ...game }, NOW)).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
