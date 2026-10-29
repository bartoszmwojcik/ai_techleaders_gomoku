import { READY_DEADLINE_MS } from "@gomoku/core";
import { GamePlayer, type EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { CANCEL_NOT_STARTED_OF_USER, EXPIRE_WAITING_OF_USER } from "../games/lazy-closing";
import { GameParticipation } from "./game-participation";

const NOW = new Date("2026-10-29T12:00:00Z");

function setup(count: number, player: unknown = null) {
  const em = {
    count: vi.fn(async () => count),
    findOne: vi.fn(async () => player),
    execute: vi.fn(async () => undefined),
  };
  return {
    em,
    participation: new GameParticipation({ em: em as unknown as EntityManager, clock: { now: () => NOW } }),
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

describe("GameParticipation.currentGame", () => {
  it("returns the game, its status and the user's seat", async () => {
    const { em, participation } = setup(0, { seat: 1, game: { id: "game-1", status: "waiting" } });
    expect(await participation.currentGame("user-1")).toEqual({ gameId: "game-1", status: "waiting", seat: 1 });
    expect(em.findOne).toHaveBeenCalledWith(
      GamePlayer,
      { user: "user-1", isActive: true, game: { status: { $in: ["waiting", "active"] } } },
      { populate: ["game"] },
    );
  });

  it("is null without a slot", async () => {
    expect(await setup(0).participation.currentGame("user-1")).toBeNull();
  });

  it("closes the user's stale slots before reading the current one (Q16, Q21)", async () => {
    const { em, participation } = setup(0, { seat: 1, game: { id: "game-1", status: "waiting" } });
    await participation.currentGame("user-1");
    expect(em.execute).toHaveBeenNthCalledWith(1, EXPIRE_WAITING_OF_USER, [NOW, "user-1"], "run");
    expect(em.execute).toHaveBeenNthCalledWith(
      2,
      CANCEL_NOT_STARTED_OF_USER,
      [new Date(NOW.getTime() - READY_DEADLINE_MS), "user-1"],
      "run",
    );
    expect(em.execute.mock.invocationCallOrder[1]).toBeLessThan(em.findOne.mock.invocationCallOrder[0]!);
  });
});
