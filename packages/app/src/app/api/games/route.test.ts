import { TooManyRequestsError, UnauthorizedError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, create, requireSession, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  create: vi.fn(),
  requireSession: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameService: { create } } }),
}));

import { POST } from "./route";

const created = {
  gameId: "game-1",
  invitation: { code: "ABCD-EFGH", url: "https://gomoku.example/invite/ABCD-EFGH", expiresAt: "2026-10-30T12:00:00.000Z" },
};

function post(headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    ...headers,
  };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return new Request("https://gomoku.example/api/games", { method: "POST", headers: sent });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  create.mockReset().mockResolvedValue(created);
  requireSession.mockReset().mockResolvedValue({ id: "user-1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/games", () => {
  it("creates a game for the signed-in user and answers 201", async () => {
    const response = await POST(post());

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: created });
    expect(create).toHaveBeenCalledWith("user-1");
  });

  it("answers 401 without a session (a guest has none)", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj."));
    const response = await POST(post());
    expect(response.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header or with a foreign origin", async () => {
    expect((await POST(post({ "x-gomoku-request": "" }))).status).toBe(403);
    expect((await POST(post({ origin: "https://evil.example" }))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes service errors on: 429 with Retry-After", async () => {
    create.mockRejectedValue(new TooManyRequestsError("limit", { retryAfterSeconds: 30 }));
    const response = await POST(post());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("passes service errors on: 409 ACTIVE_GAME_EXISTS", async () => {
    const { ConflictError } = await import("@gomoku/core");
    create.mockRejectedValue(new ConflictError("Masz już partię.", { code: "ACTIVE_GAME_EXISTS" }));
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("ACTIVE_GAME_EXISTS");
  });
});
