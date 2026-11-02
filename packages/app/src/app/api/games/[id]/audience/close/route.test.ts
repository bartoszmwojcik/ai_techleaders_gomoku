import { ConflictError, NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, closeAudience, resolveParticipant, refreshGuestCookie } = vi.hoisted(() => ({
  connection: vi.fn(),
  refreshGuestCookie: vi.fn(),
  closeAudience: vi.fn(),
  resolveParticipant: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/http/guest-cookie", () => ({ refreshGuestCookie }));
vi.mock("@/server/container", () => ({
  getContainer: async () => ({ cradle: { serverConfig: SERVER_CONFIG } }),
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameService: { closeAudience }, serverConfig: SERVER_CONFIG } }),
}));

import { POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const SERVER_CONFIG = { sessionCookieSecure: false };
const state = { status: "active", you: { seat: 1, kind: "account" } };
const context = { params: Promise.resolve({ id: GAME }) };

function request(headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/games/${GAME}/audience/close`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "x-gomoku-request": "1", ...headers },
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  refreshGuestCookie.mockReset().mockResolvedValue(undefined);
  closeAudience.mockReset().mockResolvedValue(state);
  resolveParticipant
    .mockReset()
    .mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
});

describe("POST /api/games/[id]/closeAudience", () => {
  it("closeAudiences for the participant and returns the state", async () => {
    const response = await POST(request(), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: state });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(closeAudience).toHaveBeenCalledWith({ playerId: "player-1" }, GAME);
    expect(refreshGuestCookie).not.toHaveBeenCalled();
  });

  it("slides the guest cookie after a guest's closeAudienceation", async () => {
    closeAudience.mockResolvedValue({ ...state, you: { seat: 2, kind: "guest" } });
    await POST(request(), context);
    expect(refreshGuestCookie).toHaveBeenCalledWith(SERVER_CONFIG);
  });

  it("rejects a request without the CSRF header or with a foreign origin", async () => {
    const noHeader = new Request(`http://localhost:3000/api/games/${GAME}/audience/close`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    expect((await POST(noHeader, context)).status).toBe(403);
    expect((await POST(request({ origin: "https://evil.example" }), context)).status).toBe(403);
    expect(closeAudience).not.toHaveBeenCalled();
  });

  it("answers 404 for a stranger", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(request(), context)).status).toBe(404);
    expect(closeAudience).not.toHaveBeenCalled();
  });

  it("maps the conflicts to 409 with their code", async () => {
    closeAudience.mockRejectedValue(new ConflictError("Ta partia nie jest publiczna.", { code: "GAME_NOT_PUBLIC" }));
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "GAME_NOT_PUBLIC" } });
  });
});
