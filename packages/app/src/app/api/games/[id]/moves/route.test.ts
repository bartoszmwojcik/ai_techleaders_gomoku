import { ConflictError, NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, play, resolveParticipant, refreshGuestCookie } = vi.hoisted(() => ({
  connection: vi.fn(),
  refreshGuestCookie: vi.fn(),
  play: vi.fn(),
  resolveParticipant: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/http/guest-cookie", () => ({ refreshGuestCookie }));
vi.mock("@/server/container", () => ({
  getContainer: async () => ({ cradle: { serverConfig: SERVER_CONFIG } }),
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameMoveService: { play }, serverConfig: SERVER_CONFIG } }),
}));

import { POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const SERVER_CONFIG = { sessionCookieSecure: false };
const state = { status: "active", you: { seat: 1, kind: "account" }, moveCount: 1 };
const context = { params: Promise.resolve({ id: GAME }) };

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/games/${GAME}/moves`, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "x-gomoku-request": "1",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  refreshGuestCookie.mockReset().mockResolvedValue(undefined);
  play.mockReset().mockResolvedValue(state);
  resolveParticipant
    .mockReset()
    .mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
});

describe("POST /api/games/[id]/moves", () => {
  it("plays the move for the participant and returns the state", async () => {
    const response = await POST(request({ x: 7, y: 7, moveNumber: 1 }), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: state });
    expect(resolveParticipant).toHaveBeenCalledWith(GAME);
    expect(play).toHaveBeenCalledWith({ playerId: "player-1" }, GAME, { x: 7, y: 7, moveNumber: 1 });
    expect(refreshGuestCookie).not.toHaveBeenCalled();
  });

  it("slides the guest cookie after a guest's move", async () => {
    play.mockResolvedValue({ ...state, you: { seat: 2, kind: "guest" } });
    await POST(request({ x: 0, y: 0, moveNumber: 2 }), context);
    expect(refreshGuestCookie).toHaveBeenCalledWith(SERVER_CONFIG);
  });

  it("rejects a request without the CSRF header or with a foreign origin", async () => {
    const noHeader = new Request(`http://localhost:3000/api/games/${GAME}/moves`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: "{}",
    });
    expect((await POST(noHeader, context)).status).toBe(403);
    expect((await POST(request({}, { origin: "https://evil.example" }), context)).status).toBe(403);
    expect(play).not.toHaveBeenCalled();
  });

  it.each([["not json"], [{ x: 15, y: 0, moveNumber: 1 }], [{ x: 1, y: 1 }]])(
    "answers 400 to invalid input %j before looking the game up",
    async (body) => {
      const response = await POST(request(body), context);
      expect(response.status).toBe(400);
      expect(resolveParticipant).not.toHaveBeenCalled();
    },
  );

  it("answers 404 for a stranger", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(request({ x: 1, y: 1, moveNumber: 1 }), context)).status).toBe(404);
    expect(play).not.toHaveBeenCalled();
  });

  it("maps the rules' conflicts to 409 with their code", async () => {
    play.mockRejectedValue(new ConflictError("Teraz ruch przeciwnika.", { code: "NOT_YOUR_TURN" }));
    const response = await POST(request({ x: 1, y: 1, moveNumber: 1 }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_YOUR_TURN" } });
  });
});
