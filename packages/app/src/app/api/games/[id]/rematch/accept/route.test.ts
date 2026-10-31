import { ConflictError, NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, accept, resolveParticipant, readGuestToken, setGuestCookie, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  accept: vi.fn(),
  resolveParticipant: vi.fn(),
  readGuestToken: vi.fn(),
  setGuestCookie: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/http/guest-cookie", () => ({ readGuestToken, setGuestCookie }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { rematchService: { accept }, serverConfig } }),
}));

import { POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const context = { params: Promise.resolve({ id: GAME }) };
const post = (headers: Record<string, string> = { origin: serverConfig.appOrigin, "x-gomoku-request": "1" }) =>
  new Request(`https://gomoku.example/api/games/${GAME}/rematch/accept`, { method: "POST", headers });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  resolveParticipant.mockReset().mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
  readGuestToken.mockReset().mockResolvedValue(undefined);
  setGuestCookie.mockReset().mockResolvedValue(undefined);
  accept.mockReset().mockResolvedValue({ gameId: "game-2" });
});

describe("POST /api/games/[id]/rematch/accept", () => {
  it("accepts for an account and answers with the new game, without a cookie", async () => {
    const response = await POST(post(), context);
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { gameId: "game-2" } });
    expect(accept).toHaveBeenCalledWith({ playerId: "player-1" }, GAME, undefined);
    expect(setGuestCookie).not.toHaveBeenCalled();
  });

  it("gives a guest the token of the new game in the cookie, never in the JSON", async () => {
    readGuestToken.mockResolvedValue("old-token");
    accept.mockResolvedValue({ gameId: "game-2", guestToken: "new-token" });
    const response = await POST(post(), context);
    expect(accept).toHaveBeenCalledWith({ playerId: "player-1" }, GAME, "old-token");
    expect(setGuestCookie).toHaveBeenCalledWith(serverConfig, "new-token");
    expect(await response.json()).toEqual({ ok: true, data: { gameId: "game-2" } });
  });

  it("refuses a request without the CSRF header", async () => {
    expect((await POST(post({ origin: serverConfig.appOrigin }), context)).status).toBe(403);
    expect(accept).not.toHaveBeenCalled();
  });

  it("answers 404 for a stranger and does nothing", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post(), context)).status).toBe(404);
    expect(accept).not.toHaveBeenCalled();
  });

  it("passes the conflicts of the service on and sets no cookie", async () => {
    accept.mockRejectedValue(new ConflictError("x", { code: "ACTIVE_GAME_EXISTS", data: { gameId: "g9" } }));
    const response = await POST(post(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "ACTIVE_GAME_EXISTS", data: { gameId: "g9" } });
    expect(setGuestCookie).not.toHaveBeenCalled();
  });
});
