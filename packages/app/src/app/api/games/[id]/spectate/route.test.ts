import { NotFoundError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, resolveSpectator, getState, refreshSpectatorCookie } = vi.hoisted(() => ({
  connection: vi.fn(),
  resolveSpectator: vi.fn(),
  getState: vi.fn(),
  refreshSpectatorCookie: vi.fn(),
}));
const serverConfig = { appOrigin: "https://gomoku.example" };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/spectator", () => ({ resolveSpectator }));
vi.mock("@/server/http/spectator-cookie", () => ({ refreshSpectatorCookie }));
vi.mock("@/server/container", () => ({
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { serverConfig, spectatorService: { getState } } }),
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ id: "g1" }) };
const get = (query = "") => GET(new Request(`https://gomoku.example/api/games/g1/spectate${query}`), context);

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  resolveSpectator.mockReset().mockResolvedValue({ gameId: "g1", spectator: { spectatorId: "s1" } });
  getState.mockReset().mockResolvedValue({ status: "active", moveCount: 3 });
  refreshSpectatorCookie.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/games/[id]/spectate", () => {
  it("reads the state for a spectator, never cached, and slides the cookie", async () => {
    const response = await get();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { status: "active", moveCount: 3 } });
    expect(resolveSpectator).toHaveBeenCalledWith("g1");
    expect(getState).toHaveBeenCalledWith({ spectatorId: "s1" }, "g1", 0);
    expect(refreshSpectatorCookie).toHaveBeenCalledWith(serverConfig);
  });

  it("passes the number of moves the client knows", async () => {
    await get("?after=2");
    expect(getState).toHaveBeenCalledWith({ spectatorId: "s1" }, "g1", 2);
  });

  it("answers 400 for a bad after, before anything is resolved", async () => {
    expect((await get("?after=abc")).status).toBe(400);
    expect(resolveSpectator).not.toHaveBeenCalled();
  });

  it("answers 404 for somebody who does not watch the game", async () => {
    resolveSpectator.mockRejectedValue(new NotFoundError("x"));
    const response = await get();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getState).not.toHaveBeenCalled();
  });
});
