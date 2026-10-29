import { GoneError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, accept, getCurrentUser, getContainer, readGuestTokenHash, setGuestCookie } =
  vi.hoisted(() => ({
  readGuestTokenHash: vi.fn(),
  setGuestCookie: vi.fn(),
  connection: vi.fn(),
  accept: vi.fn(),
  getCurrentUser: vi.fn(),
  getContainer: vi.fn(),
  }));
const serverConfig = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
  appOrigin: "https://gomoku.example",
};
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("@/server/http/guest-cookie", () => ({ readGuestTokenHash, setGuestCookie }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, invitationService: { accept } } }),
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
  return new Request("https://gomoku.example/api/invitations/ABCD-EFGH/accept", {
    method: "POST",
    headers: sent,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const context = { params: Promise.resolve({ code: "ABCD-EFGH" }) };

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  accept.mockReset().mockResolvedValue({ gameId: "game-1" });
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-2" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  readGuestTokenHash.mockReset().mockResolvedValue(undefined);
  setGuestCookie.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/invitations/[code]/accept", () => {
  it("joins the signed-in user with the lookup pool of their address", async () => {
    const response = await POST(post({ as: "user", cancelOwnWaitingGame: true }), context);

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { gameId: "game-1" } });
    expect(accept).toHaveBeenCalledWith(
      "ABCD-EFGH",
      { userId: "user-2", guestTokenHash: undefined },
      { as: "user", cancelOwnWaitingGame: true },
      expect.objectContaining({ key: expect.stringMatching(/^invitation-lookup:ip:/), limit: 20 }),
    );
  });

  it("passes an anonymous viewer to the service, which answers 401", async () => {
    getCurrentUser.mockResolvedValue(null);
    await POST(post({ as: "user" }), context);
    expect(accept).toHaveBeenCalledWith(
      "ABCD-EFGH",
      { userId: undefined, guestTokenHash: undefined },
      expect.anything(),
      expect.anything(),
    );
    expect(setGuestCookie).not.toHaveBeenCalled();
  });

  it("uses the global pool when the address is unknown", async () => {
    await POST(post({ as: "user" }, { "x-forwarded-for": "" }), context);
    expect(accept).toHaveBeenCalledWith(
      "ABCD-EFGH",
      expect.anything(),
      expect.anything(),
      { key: "invitation-lookup:global", limit: 300 },
    );
  });

  it("answers 400 for a body that is not JSON or not valid, before any lookup", async () => {
    expect((await POST(post("not json"), context)).status).toBe(400);
    const response = await POST(post({ as: "admin" }), context);
    expect(response.status).toBe(400);
    expect(accept).not.toHaveBeenCalled();
  });

  it("answers 400 on the acknowledgement field for a guest without it", async () => {
    const response = await POST(post({ as: "guest" }), context);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { fieldErrors: Record<string, string[]> } };
    expect(body.error.fieldErrors.acknowledgedGuestWarning).toBeDefined();
  });

  it("joins a guest: the token goes to the cookie, never into the answer", async () => {
    getCurrentUser.mockResolvedValue(null);
    readGuestTokenHash.mockResolvedValue("h".repeat(64));
    accept.mockResolvedValue({ gameId: "game-1", guestToken: "secret-token" });

    const response = await POST(post({ as: "guest", acknowledgedGuestWarning: true }), context);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true, data: { gameId: "game-1" } });
    expect(text).not.toContain("secret-token");
    expect(accept).toHaveBeenCalledWith(
      "ABCD-EFGH",
      { userId: undefined, guestTokenHash: "h".repeat(64) },
      { as: "guest", acknowledgedGuestWarning: true },
      expect.anything(),
    );
    expect(setGuestCookie).toHaveBeenCalledWith(serverConfig, "secret-token");
  });

  it("sets no cookie for a returning guest", async () => {
    getCurrentUser.mockResolvedValue(null);
    await POST(post({ as: "guest", acknowledgedGuestWarning: true }), context);
    expect(setGuestCookie).not.toHaveBeenCalled();
  });

  it("passes on the uniform 410", async () => {
    accept.mockRejectedValue(new GoneError("Nieważne.", { code: "INVALID_INVITATION" }));
    const response = await POST(post({ as: "user" }), context);
    expect(response.status).toBe(410);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("INVALID_INVITATION");
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await POST(post({ as: "user" }, { "x-gomoku-request": "" }), context)).status).toBe(403);
    expect(accept).not.toHaveBeenCalled();
  });
});
