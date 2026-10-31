import { ConflictError, NotFoundError, TooManyRequestsError, UnauthorizedError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireSession, pick, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireSession: vi.fn(),
  pick: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { lobbyService: { pick } } }),
}));

import { POST } from "./route";

const SEEKER = "4d293981-7b3c-4f81-a1af-0a9e3bf3636b";

function call(id: string, headers: Record<string, string> = {}) {
  return POST(
    new Request(`https://gomoku.example/api/lobby/seekers/${id}/pick`, {
      method: "POST",
      headers: { origin: serverConfig.appOrigin, "x-gomoku-request": "1", ...headers },
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireSession.mockReset().mockResolvedValue({ id: "user-1" });
  pick.mockReset().mockResolvedValue({ gameId: "game-1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/lobby/seekers/{id}/pick", () => {
  it("picks the seeker for the signed-in user and answers 200 with the game", async () => {
    const response = await call(SEEKER);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { gameId: "game-1" } });
    expect(connection).toHaveBeenCalledOnce();
    expect(pick).toHaveBeenCalledExactlyOnceWith("user-1", SEEKER);
  });

  it("rejects a request from a foreign origin with 403, before anything else", async () => {
    const response = await call(SEEKER, { origin: "https://evil.example" });

    expect(response.status).toBe(403);
    expect(requireSession).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj się."));

    expect((await call(SEEKER)).status).toBe(401);
    expect(pick).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that is not a uuid, without reaching the service", async () => {
    const response = await call("nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(pick).not.toHaveBeenCalled();
  });

  it("passes the service's 404 on", async () => {
    pick.mockRejectedValue(new NotFoundError("Nie znaleziono."));

    expect((await call(SEEKER)).status).toBe(404);
  });

  it.each(["ACTIVE_GAME_EXISTS", "LOBBY_SEEKER_TAKEN", "LOBBY_SEEKER_EXPIRED", "CANNOT_PICK_SELF"])(
    "passes %s on as 409 with its code",
    async (code) => {
      pick.mockRejectedValue(new ConflictError("Konflikt.", { code, data: { gameId: "game-9" } }));

      const response = await call(SEEKER);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ ok: false, error: { code, data: { gameId: "game-9" } } });
    },
  );

  it("answers 429 with Retry-After when the limit is spent", async () => {
    pick.mockRejectedValue(new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 42 }));

    const response = await call(SEEKER);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
  });
});
