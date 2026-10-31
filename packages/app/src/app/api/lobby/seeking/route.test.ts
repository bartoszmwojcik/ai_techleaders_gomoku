import { ConflictError, TooManyRequestsError, UnauthorizedError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireSession, markSeeking, withdraw, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireSession: vi.fn(),
  markSeeking: vi.fn(),
  withdraw: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { lobbyService: { markSeeking, withdraw } } }),
}));

import { DELETE, PUT } from "./route";

const me = { id: "s1", createdAt: new Date("2026-10-31T12:00:00Z"), expiresInMs: 300_000 };

function call(method: "PUT" | "DELETE", headers: Record<string, string> = {}) {
  return new Request("https://gomoku.example/api/lobby/seeking", {
    method,
    headers: { origin: serverConfig.appOrigin, "x-gomoku-request": "1", ...headers },
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireSession.mockReset().mockResolvedValue({ id: "user-1" });
  markSeeking.mockReset().mockResolvedValue(me);
  withdraw.mockReset().mockResolvedValue(undefined);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("PUT /api/lobby/seeking", () => {
  it("marks the signed-in user and answers 200 with the status", async () => {
    const response = await PUT(call("PUT"));

    expect(response.status).toBe(200);
    expect(JSON.parse(JSON.stringify(await response.json()))).toEqual({
      ok: true,
      data: { me: { ...me, createdAt: "2026-10-31T12:00:00.000Z" } },
    });
    expect(connection).toHaveBeenCalledOnce();
    expect(markSeeking).toHaveBeenCalledExactlyOnceWith("user-1");
  });

  it("answers 401 without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj się, aby kontynuować."));

    expect((await PUT(call("PUT"))).status).toBe(401);
    expect(markSeeking).not.toHaveBeenCalled();
  });

  it("answers 409 ACTIVE_GAME_EXISTS with the game to return to (BR-13)", async () => {
    markSeeking.mockRejectedValue(
      new ConflictError("Masz już partię.", { code: "ACTIVE_GAME_EXISTS", data: { gameId: "game-1" } }),
    );

    const response = await PUT(call("PUT"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "ACTIVE_GAME_EXISTS", data: { gameId: "game-1" } },
    });
  });

  it("answers 429 when the limit is spent", async () => {
    markSeeking.mockRejectedValue(new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 60 }));

    const response = await PUT(call("PUT"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("rejects a request without the CSRF header or from a foreign origin with 403", async () => {
    const noHeader = new Request("https://gomoku.example/api/lobby/seeking", {
      method: "PUT",
      headers: { origin: serverConfig.appOrigin },
    });
    expect((await PUT(noHeader)).status).toBe(403);
    expect((await PUT(call("PUT", { origin: "https://evil.example" }))).status).toBe(403);
    expect(markSeeking).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/lobby/seeking", () => {
  it("withdraws the status and answers 200 with no status", async () => {
    const response = await DELETE(call("DELETE"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { me: null } });
    expect(withdraw).toHaveBeenCalledExactlyOnceWith("user-1");
  });

  it("answers 401 without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj się, aby kontynuować."));

    expect((await DELETE(call("DELETE"))).status).toBe(401);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin with 403", async () => {
    expect((await DELETE(call("DELETE", { origin: "https://evil.example" }))).status).toBe(403);
    expect(withdraw).not.toHaveBeenCalled();
  });
});
