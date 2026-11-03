import { ConflictError, GoneError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, join, getCurrentUser, getContainer, readSpectatorTokenHash, setSpectatorCookie } = vi.hoisted(() => ({
  connection: vi.fn(),
  join: vi.fn(),
  getCurrentUser: vi.fn(),
  getContainer: vi.fn(),
  readSpectatorTokenHash: vi.fn(),
  setSpectatorCookie: vi.fn(),
}));
const serverConfig = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
  appOrigin: "https://gomoku.example",
};
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("@/server/http/spectator-cookie", () => ({ readSpectatorTokenHash, setSpectatorCookie }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) => fn({ cradle: { serverConfig, spectatorService: { join } } }),
}));

import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    "x-forwarded-for": "2.2.2.2",
    ...headers,
  };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return new Request("https://gomoku.example/api/invitations/ABCD-EFGH/spectate", {
    method: "POST",
    headers: sent,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ code: "ABCD-EFGH" }) };

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  join.mockReset().mockResolvedValue({ gameId: "game-1" });
  getCurrentUser.mockReset().mockResolvedValue(null);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  readSpectatorTokenHash.mockReset().mockResolvedValue(undefined);
  setSpectatorCookie.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/invitations/[code]/spectate", () => {
  it("lets an account watch, with the lookup pool of its address", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-2" });

    const response = await POST(post(undefined), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { gameId: "game-1" } });
    expect(join).toHaveBeenCalledWith(
      "ABCD-EFGH",
      { userId: "user-2", tokenHash: undefined },
      {},
      expect.objectContaining({ key: expect.stringMatching(/^invitation-lookup:ip:/), limit: 20 }),
    );
    expect(setSpectatorCookie).not.toHaveBeenCalled();
  });

  it("makes a visitor a spectator: the token goes to the cookie, never into the answer", async () => {
    join.mockResolvedValue({ gameId: "game-1", spectatorToken: "secret-token" });

    const response = await POST(post({ nickname: " Ala " }), context);

    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true, data: { gameId: "game-1" } });
    expect(text).not.toContain("secret-token");
    expect(join).toHaveBeenCalledWith("ABCD-EFGH", { userId: undefined, tokenHash: undefined }, { nickname: "Ala" }, expect.anything());
    expect(setSpectatorCookie).toHaveBeenCalledWith(serverConfig, "secret-token");
  });

  it("passes the hash of the cookie of a returning spectator and sets no new cookie", async () => {
    readSpectatorTokenHash.mockResolvedValue("h".repeat(64));
    await POST(post({}), context);
    expect(join).toHaveBeenCalledWith("ABCD-EFGH", { userId: undefined, tokenHash: "h".repeat(64) }, {}, expect.anything());
    expect(setSpectatorCookie).not.toHaveBeenCalled();
  });

  it("uses the global pool when the address is unknown", async () => {
    await POST(post({}, { "x-forwarded-for": "" }), context);
    expect(join).toHaveBeenCalledWith("ABCD-EFGH", expect.anything(), expect.anything(), {
      key: "invitation-lookup:global",
      limit: 300,
    });
  });

  it("answers 400 for a body that is not JSON or has a bad nickname, before any lookup", async () => {
    expect((await POST(post("not json"), context)).status).toBe(400);
    const response = await POST(post({ nickname: "<script>" }), context);
    expect(response.status).toBe(400);
    expect(join).not.toHaveBeenCalled();
  });

  it("answers 409 for a full audience and passes on the uniform 410", async () => {
    join.mockRejectedValueOnce(new ConflictError("Partia ma komplet widzów", { code: "SPECTATORS_FULL" }));
    const full = await POST(post({}), context);
    expect(full.status).toBe(409);
    expect(((await full.json()) as { error: { code: string } }).error.code).toBe("SPECTATORS_FULL");

    join.mockRejectedValueOnce(new GoneError("Nieważne.", { code: "INVALID_INVITATION" }));
    expect((await POST(post({}), context)).status).toBe(410);
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await POST(post({}, { "x-gomoku-request": "" }), context)).status).toBe(403);
    expect(join).not.toHaveBeenCalled();
  });
});
