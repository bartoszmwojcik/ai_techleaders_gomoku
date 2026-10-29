import { GamePlayer, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { GameParticipation } from "./game-participation";

function setup(count: number) {
  const em = { count: vi.fn(async () => count) };
  return {
    em,
    participation: new GameParticipation({ em: em as unknown as EntityManager }),
  };
}

describe("GameParticipation.hasActiveGame", () => {
  it("is true when the user holds an occupied seat in an active game", async () => {
    const { em, participation } = setup(1);
    expect(await participation.hasActiveGame("user-1")).toBe(true);
    expect(em.count).toHaveBeenCalledWith(GamePlayer, {
      user: "user-1",
      isActive: true,
      game: { status: "active" },
    });
  });

  it("is false without such a seat", async () => {
    expect(await setup(0).participation.hasActiveGame("user-1")).toBe(false);
  });

  it("can ask only about a game that started before a moment (G5)", async () => {
    const { em, participation } = setup(1);
    const expiredAt = new Date("2026-10-27T11:00:00Z");
    await participation.hasActiveGame("user-1", { startedBefore: expiredAt });
    expect(em.count).toHaveBeenCalledWith(GamePlayer, {
      user: "user-1",
      isActive: true,
      game: { status: "active", startedAt: { $lte: expiredAt } },
    });
  });
});

describe("GameParticipation.occupiesSlot", () => {
  it("counts waiting and active games (BR-13)", async () => {
    const { em, participation } = setup(1);
    expect(await participation.occupiesSlot("user-1")).toBe(true);
    expect(em.count).toHaveBeenCalledWith(GamePlayer, {
      user: "user-1",
      isActive: true,
      game: { status: { $in: ["waiting", "active"] } },
    });
  });

  it("is false when the slot is free", async () => {
    expect(await setup(0).participation.occupiesSlot("user-1")).toBe(false);
  });
});
