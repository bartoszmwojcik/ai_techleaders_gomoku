import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connection,
  getState,
  resolveParticipant,
  refreshGuestCookie,
  guestCookieMaxAge,
  readGuestToken,
  setGuestCookie,
  claimGuestSeat,
} = vi.hoisted(() => ({
  readGuestToken: vi.fn(),
  setGuestCookie: vi.fn(),
  claimGuestSeat: vi.fn(),
  connection: vi.fn(),
  refreshGuestCookie: vi.fn(),
  guestCookieMaxAge: vi.fn(),
  getState: vi.fn(),
  resolveParticipant: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/http/guest-cookie", () => ({
  refreshGuestCookie,
  guestCookieMaxAge,
  readGuestToken,
  setGuestCookie,
}));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        gameService: { getState },
        rematchService: { claimGuestSeat },
        serverConfig: SERVER_CONFIG,
        clock: { now: () => NOW },
      },
    }),
}));

import { GET } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const state = { status: "waiting", you: { seat: 1, kind: "account" }, players: [] };
const NOW = new Date("2026-10-30T12:00:00Z");
const SERVER_CONFIG = { sessionCookieSecure: false };
const context = { params: Promise.resolve({ id: GAME }) };

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  refreshGuestCookie.mockReset().mockResolvedValue(undefined);
  guestCookieMaxAge.mockReset().mockReturnValue(4321);
  getState.mockReset().mockResolvedValue(state);
  readGuestToken.mockReset().mockResolvedValue("old-token");
  setGuestCookie.mockReset().mockResolvedValue(undefined);
  claimGuestSeat.mockReset().mockResolvedValue("new-token");
  resolveParticipant
    .mockReset()
    .mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
});

describe("GET /api/games/[id]", () => {
  it("returns the state for the participant", async () => {
    const response = await GET(new Request(`https://gomoku.example/api/games/${GAME}`), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: state });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(getState).toHaveBeenCalledWith({ playerId: "player-1" }, GAME, 0);
    expect(refreshGuestCookie).not.toHaveBeenCalled();
  });

  it("passes `after` on and rejects a malformed one before reading", async () => {
    await GET(new Request(`https://gomoku.example/api/games/${GAME}?after=3`), context);
    expect(getState).toHaveBeenLastCalledWith({ playerId: "player-1" }, GAME, 3);

    getState.mockClear();
    const bad = await GET(new Request(`https://gomoku.example/api/games/${GAME}?after=-1`), context);
    expect(bad.status).toBe(400);
    expect(getState).not.toHaveBeenCalled();
  });

  it("slides the guest cookie on every successful read by a guest", async () => {
    getState.mockResolvedValue({ ...state, you: { seat: 2, kind: "guest" } });
    const response = await GET(new Request(`https://gomoku.example/api/games/${GAME}`), context);
    expect(response.status).toBe(200);
    expect(guestCookieMaxAge).toHaveBeenCalledWith(expect.objectContaining({ status: "waiting" }), NOW);
    expect(refreshGuestCookie).toHaveBeenCalledWith(SERVER_CONFIG, 4321);
  });

  it("hands a guest who proposed an accepted rematch the token of the new game", async () => {
    getState.mockResolvedValue({ ...state, you: { seat: 1, kind: "guest" }, rematch: { state: "accepted", gameId: "g2" } });
    await GET(new Request(`https://gomoku.example/api/games/${GAME}`), context);
    expect(claimGuestSeat).toHaveBeenCalledWith({ playerId: "player-1" }, GAME, "old-token");
    expect(setGuestCookie).toHaveBeenCalledWith(SERVER_CONFIG, "new-token");
  });

  it.each([
    ["no accepted rematch", { rematch: { state: "pending", gameId: null } }, "old-token", "new-token"],
    ["no cookie", { rematch: { state: "accepted", gameId: "g2" } }, undefined, "new-token"],
    ["nothing to claim", { rematch: { state: "accepted", gameId: "g2" } }, "old-token", undefined],
  ])("leaves the cookie alone with %s", async (_name, extra, token, claimed) => {
    getState.mockResolvedValue({ ...state, you: { seat: 1, kind: "guest" }, ...extra });
    readGuestToken.mockResolvedValue(token);
    claimGuestSeat.mockResolvedValue(claimed);
    await GET(new Request(`https://gomoku.example/api/games/${GAME}`), context);
    expect(setGuestCookie).not.toHaveBeenCalled();
  });

  it("does not claim anything for an account", async () => {
    getState.mockResolvedValue({ ...state, rematch: { state: "accepted", gameId: "g2" } });
    await GET(new Request(`https://gomoku.example/api/games/${GAME}`), context);
    expect(claimGuestSeat).not.toHaveBeenCalled();
  });

  it("answers 404 for a stranger and reads nothing", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    const response = await GET(new Request("https://gomoku.example/api/games/x"), context);
    expect(response.status).toBe(404);
    expect(getState).not.toHaveBeenCalled();
    expect(refreshGuestCookie).not.toHaveBeenCalled();
  });
});
