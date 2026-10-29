import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, findParticipant } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findParticipant: vi.fn(),
}));
const { readGuestTokenHash } = vi.hoisted(() => ({ readGuestTokenHash: vi.fn() }));
const serverConfig = { sessionCookieSecure: false };
vi.mock("./auth", () => ({ getCurrentUser }));
vi.mock("./guest-cookie", () => ({ readGuestTokenHash }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, gameService: { findParticipant } } }),
}));

import { parseGameId, resolveParticipant } from "./participant";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-1" });
  findParticipant.mockReset().mockResolvedValue({ playerId: "player-1" });
  readGuestTokenHash.mockReset().mockResolvedValue(undefined);
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
    expect(findParticipant).toHaveBeenCalledWith(
      { userId: "user-1", guestTokenHash: undefined },
      GAME,
    );
  });

  it("passes the hash of the guest cookie, also without a session", async () => {
    getCurrentUser.mockResolvedValue(null);
    readGuestTokenHash.mockResolvedValue("h".repeat(64));
    await resolveParticipant(GAME);
    expect(readGuestTokenHash).toHaveBeenCalledWith(serverConfig);
    expect(findParticipant).toHaveBeenCalledWith(
      { userId: undefined, guestTokenHash: "h".repeat(64) },
      GAME,
    );
  });

  it("asks without an identity when nobody is signed in", async () => {
    getCurrentUser.mockResolvedValue(null);
    findParticipant.mockResolvedValue(null);
    await expect(resolveParticipant(GAME)).rejects.toMatchObject({ status: 404 });
    expect(findParticipant).toHaveBeenCalledWith(
      { userId: undefined, guestTokenHash: undefined },
      GAME,
    );
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
    expect(readGuestTokenHash).not.toHaveBeenCalled();
  });
});
