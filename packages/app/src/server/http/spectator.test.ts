import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, find, readSpectatorTokenHash } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  find: vi.fn(),
  readSpectatorTokenHash: vi.fn(),
}));
const serverConfig = { sessionCookieSecure: false };
vi.mock("./auth", () => ({ getCurrentUser }));
vi.mock("./spectator-cookie", () => ({ readSpectatorTokenHash }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { serverConfig, spectatorService: { find } } }),
}));

import { resolveSpectator } from "./spectator";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

beforeEach(() => {
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-1" });
  find.mockReset().mockResolvedValue({ spectatorId: "s1" });
  readSpectatorTokenHash.mockReset().mockResolvedValue(undefined);
});

describe("resolveSpectator", () => {
  it("resolves the signed-in account to its spectator", async () => {
    expect(await resolveSpectator(GAME)).toEqual({ gameId: GAME, spectator: { spectatorId: "s1" } });
    expect(find).toHaveBeenCalledWith({ userId: "user-1", tokenHash: undefined }, GAME);
  });

  it("passes the hash of the spectator cookie, also without a session", async () => {
    getCurrentUser.mockResolvedValue(null);
    readSpectatorTokenHash.mockResolvedValue("h".repeat(64));
    await resolveSpectator(GAME);
    expect(readSpectatorTokenHash).toHaveBeenCalledWith(serverConfig);
    expect(find).toHaveBeenCalledWith({ userId: undefined, tokenHash: "h".repeat(64) }, GAME);
  });

  it("answers 404 for a stranger and for a malformed id, which is never looked up", async () => {
    find.mockResolvedValue(null);
    await expect(resolveSpectator(GAME)).rejects.toMatchObject({ status: 404 });
    find.mockClear();
    await expect(resolveSpectator("nope")).rejects.toMatchObject({ status: 404 });
    expect(find).not.toHaveBeenCalled();
  });
});
