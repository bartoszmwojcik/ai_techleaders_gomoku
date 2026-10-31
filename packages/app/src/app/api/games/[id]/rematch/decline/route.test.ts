import { ConflictError, NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, decline, resolveParticipant, refreshGuestCookie, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  decline: vi.fn(),
  resolveParticipant: vi.fn(),
  refreshGuestCookie: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/participant", () => ({ resolveParticipant }));
vi.mock("@/server/http/guest-cookie", () => ({ refreshGuestCookie }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { rematchService: { decline }, serverConfig } }),
}));

import { POST } from "./route";

const GAME = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";
const context = { params: Promise.resolve({ id: GAME }) };
const post = (headers: Record<string, string> = { origin: serverConfig.appOrigin, "x-gomoku-request": "1" }) =>
  new Request(`https://gomoku.example/api/games/${GAME}/rematch/decline`, { method: "POST", headers });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  refreshGuestCookie.mockReset().mockResolvedValue(undefined);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  resolveParticipant.mockReset().mockResolvedValue({ gameId: GAME, participant: { playerId: "player-1" } });
  decline.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/games/[id]/rematch/decline", () => {
  it("declines the offer", async () => {
    const response = await POST(post(), context);
    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(decline).toHaveBeenCalledWith({ playerId: "player-1" }, GAME);
    expect(refreshGuestCookie).toHaveBeenCalledWith(serverConfig);
  });

  it("refuses a request without the CSRF header", async () => {
    const response = await POST(post({ origin: serverConfig.appOrigin }), context);
    expect(response.status).toBe(403);
    expect(decline).not.toHaveBeenCalled();
  });

  it("answers 404 for a stranger and does nothing", async () => {
    resolveParticipant.mockRejectedValue(new NotFoundError("Nie znaleziono partii."));
    expect((await POST(post(), context)).status).toBe(404);
    expect(decline).not.toHaveBeenCalled();
  });

  it("passes the conflicts of the service on", async () => {
    decline.mockRejectedValue(new ConflictError("x", { code: "REMATCH_NOT_OFFERED" }));
    const response = await POST(post(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REMATCH_NOT_OFFERED");
  });
});
