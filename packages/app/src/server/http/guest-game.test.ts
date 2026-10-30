import { beforeEach, describe, expect, it, vi } from "vitest";

const { readGuestTokenHash, currentGameOfGuest, scope } = vi.hoisted(() => ({
  readGuestTokenHash: vi.fn(),
  currentGameOfGuest: vi.fn(),
  scope: vi.fn(),
}));
const serverConfig = { sessionCookieSecure: false };
vi.mock("./guest-cookie", () => ({ readGuestTokenHash }));
vi.mock("../container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => {
    scope();
    return fn({ cradle: { serverConfig, gameParticipation: { currentGameOfGuest } } });
  },
}));

import { loadGuestCurrentGame } from "./guest-game";

beforeEach(() => {
  readGuestTokenHash.mockReset().mockResolvedValue("hash");
  currentGameOfGuest.mockReset().mockResolvedValue({ gameId: "g1", status: "waiting", seat: 1 });
  scope.mockReset();
});

describe("loadGuestCurrentGame", () => {
  it("reads the browser's game by the hash of its token", async () => {
    expect(await loadGuestCurrentGame()).toEqual({ gameId: "g1", status: "waiting", seat: 1 });
    expect(readGuestTokenHash).toHaveBeenCalledWith(serverConfig);
    expect(currentGameOfGuest).toHaveBeenCalledWith("hash");
  });

  it("asks nothing of the database without a cookie", async () => {
    readGuestTokenHash.mockResolvedValue(undefined);
    expect(await loadGuestCurrentGame()).toBeNull();
    expect(currentGameOfGuest).not.toHaveBeenCalled();
  });

  it("fails closed: a failing lookup is no game", async () => {
    currentGameOfGuest.mockRejectedValue(new Error("db down"));
    expect(await loadGuestCurrentGame()).toBeNull();
  });
});
