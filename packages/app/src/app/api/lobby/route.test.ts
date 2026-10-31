import { UnauthorizedError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, requireSession, view, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  requireSession: vi.fn(),
  view: vi.fn(),
  getContainer: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { lobbyService: { view } } }),
}));

import { GET } from "./route";

const lobby = {
  me: null,
  currentGame: null,
  seekers: [{ id: "s1", displayName: "Alicja_99", sinceMs: 1000, expiresInMs: 299_000 }],
};

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  requireSession.mockReset().mockResolvedValue({ id: "user-1" });
  view.mockReset().mockResolvedValue(lobby);
});

describe("GET /api/lobby", () => {
  it("answers 200 with the lobby of the signed-in user", async () => {
    const response = await GET(new Request("https://gomoku.example/api/lobby"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: lobby });
    expect(connection).toHaveBeenCalledOnce();
    expect(view).toHaveBeenCalledExactlyOnceWith("user-1");
  });

  it("answers 401 without a session and reads nothing", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj się, aby kontynuować."));

    const response = await GET(new Request("https://gomoku.example/api/lobby"));

    expect(response.status).toBe(401);
    expect(view).not.toHaveBeenCalled();
  });
});
