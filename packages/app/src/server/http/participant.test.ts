import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, findParticipant } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findParticipant: vi.fn(),
}));
vi.mock("./auth", () => ({ getCurrentUser }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameService: { findParticipant } } }),
}));

import { parseGameId, resolveParticipant } from "./participant";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-1" });
  findParticipant.mockReset().mockResolvedValue({ playerId: "player-1" });
});

describe("parseGameId", () => {
  it("passes a uuid through", () => {
    expect(parseGameId(GAME)).toBe(GAME);
  });

  it("answers 404 for anything else", () => {
    expect(() => parseGameId("nope")).toThrow(/Nie znaleziono partii/);
  });
});

describe("resolveParticipant", () => {
  it("resolves the signed-in account to its player", async () => {
    expect(await resolveParticipant(GAME)).toEqual({
      gameId: GAME,
      participant: { playerId: "player-1" },
    });
    expect(findParticipant).toHaveBeenCalledWith({ userId: "user-1" }, GAME);
  });

  it("asks without an identity when nobody is signed in", async () => {
    getCurrentUser.mockResolvedValue(null);
    findParticipant.mockResolvedValue(null);
    await expect(resolveParticipant(GAME)).rejects.toMatchObject({ status: 404 });
    expect(findParticipant).toHaveBeenCalledWith({ userId: undefined }, GAME);
  });

  it("answers 404 for a stranger, the same as for a missing game", async () => {
    findParticipant.mockResolvedValue(null);
    await expect(resolveParticipant(GAME)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("answers 404 for a malformed id without touching the session or the database", async () => {
    await expect(resolveParticipant("1; drop table games")).rejects.toMatchObject({ status: 404 });
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(findParticipant).not.toHaveBeenCalled();
  });
});
