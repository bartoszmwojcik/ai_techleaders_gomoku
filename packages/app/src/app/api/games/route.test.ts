import { ConflictError, ServiceUnavailableError, TooManyRequestsError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, create, getCurrentUser, getContainer, readGuestToken, setGuestCookie, clientKey } = vi.hoisted(
  () => ({
    connection: vi.fn(),
    create: vi.fn(),
    getCurrentUser: vi.fn(),
    getContainer: vi.fn(),
    readGuestToken: vi.fn(),
    setGuestCookie: vi.fn(),
    clientKey: vi.fn(),
  }),
);
const NOW = new Date("2026-10-30T12:00:00Z");
const serverConfig = { appOrigin: "https://gomoku.example", sessionCookieSecure: true };
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ getCurrentUser }));
vi.mock("@/server/http/client-address", () => ({ clientKey }));
vi.mock("@/server/http/guest-cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/http/guest-cookie")>()),
  readGuestToken,
  setGuestCookie,
}));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { gameService: { create }, serverConfig, clock: { now: () => NOW } } }),
}));

import { hashOpaqueToken } from "@/server/http/opaque-token";

import { POST } from "./route";

const HUMAN = { kind: "human" };

const created = {
  gameId: "game-1",
  invitation: {
    code: "ABCD-EFGH",
    url: "https://gomoku.example/invite/ABCD-EFGH",
    mcpUrl: "https://gomoku.example/api/mcp",
    expiresAt: new Date("2026-10-31T12:00:00Z"),
  },
};

function post(body?: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    ...headers,
  };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return new Request("https://gomoku.example/api/games", {
    method: "POST",
    headers: sent,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  create.mockReset().mockResolvedValue(created);
  getCurrentUser.mockReset().mockResolvedValue({ id: "user-1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
  readGuestToken.mockReset().mockResolvedValue(undefined);
  setGuestCookie.mockReset().mockResolvedValue(undefined);
  clientKey.mockReset().mockReturnValue("games-create-guest:ip:abc");
});

describe("POST /api/games with a session", () => {
  it("creates a game for the signed-in user and answers 201, without a body", async () => {
    const response = await POST(post());

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    expect(JSON.parse(JSON.stringify(await response.json())).data.gameId).toBe("game-1");
    expect(create).toHaveBeenCalledWith({ kind: "account", userId: "user-1", isPublic: undefined, settings: { variant: "classic", timeControlMs: 600_000 }, opponent: HUMAN });
    expect(setGuestCookie).not.toHaveBeenCalled();
  });

  it("ignores the guest fields, even an invalid nickname", async () => {
    const response = await POST(post({ nickname: "<>", cancelOwnWaitingGame: true }));
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ kind: "account", userId: "user-1", isPublic: undefined, settings: { variant: "classic", timeControlMs: 600_000 }, opponent: HUMAN });
  });
});

describe("POST /api/games variant settings (E11)", () => {
  const paper = {
    kind: "account",
    userId: "user-1",
    isPublic: undefined,
    settings: { variant: "paper", timeControlMs: 120_000 },
    opponent: HUMAN,
  };

  it("passes the paper variant and its clock for a signed-in user", async () => {
    expect((await POST(post({ variant: "paper", timeControlMs: 120_000 }))).status).toBe(201);
    expect(create).toHaveBeenCalledWith(paper);
  });

  it("defaults the paper clock to three minutes", async () => {
    await POST(post({ variant: "paper" }));
    expect(create).toHaveBeenCalledWith({ ...paper, settings: { variant: "paper", timeControlMs: 180_000 } });
  });

  it("passes the settings of a guest", async () => {
    getCurrentUser.mockResolvedValue(null);
    await POST(post({ acknowledgedGuestWarning: true, variant: "paper", timeControlMs: 60_000 }));
    expect(create.mock.calls[0]![0].settings).toEqual({ variant: "paper", timeControlMs: 60_000 });
  });

  it.each([
    ["a clock in the classic game", { timeControlMs: 60_000 }],
    ["an unknown variant", { variant: "renju" }],
    ["an unknown clock", { variant: "paper", timeControlMs: 90_000 }],
  ])("answers 400 for %s, creating nothing", async (_name, body) => {
    expect((await POST(post(body))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/games with a session, public flag (BR-40)", () => {
  it("passes isPublic from the body to the service", async () => {
    const response = await POST(post({ isPublic: true }));
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ kind: "account", userId: "user-1", isPublic: true, settings: { variant: "classic", timeControlMs: 600_000 }, opponent: HUMAN });
  });

  it.each([["a non-boolean flag", { isPublic: "yes" }], ["garbage", "{nope"]])(
    "answers 400 for %s, creating nothing",
    async (_name, body) => {
      const request =
        typeof body === "string"
          ? new Request("https://gomoku.example/api/games", {
              method: "POST",
              headers: { origin: serverConfig.appOrigin, "x-gomoku-request": "1" },
              body,
            })
          : post(body);
      expect((await POST(request)).status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/games without a session (guest)", () => {
  beforeEach(() => getCurrentUser.mockResolvedValue(null));

  it("creates a game, mints a token when the browser has none and sets the cookie until an hour after the expiry", async () => {
    const response = await POST(post({ acknowledgedGuestWarning: true, nickname: " Ala " }));

    expect(response.status).toBe(201);
    expect(clientKey).toHaveBeenCalledWith(expect.any(Headers), "games-create-guest", serverConfig);
    const [creator] = create.mock.calls[0]!;
    expect(creator).toEqual({
      kind: "guest",
      nickname: "Ala",
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      limitKey: "games-create-guest:ip:abc",
      cancelOwnWaitingGame: undefined,
      settings: { variant: "classic", timeControlMs: 600_000 },
      opponent: HUMAN,
    });
    const [config, token, maxAge] = setGuestCookie.mock.calls[0]!;
    expect(config).toBe(serverConfig);
    expect(hashOpaqueToken(token)).toBe(creator.tokenHash);
    expect(maxAge).toBe(25 * 3600);
  });

  it("passes isPublic to the service for a guest", async () => {
    await POST(post({ acknowledgedGuestWarning: true, isPublic: true }));
    expect(create.mock.calls[0]![0]).toMatchObject({ kind: "guest", isPublic: true });
  });

  it("keeps the token the browser already carries and passes the cancel flag", async () => {
    readGuestToken.mockResolvedValue("old-token");
    await POST(post({ acknowledgedGuestWarning: true, cancelOwnWaitingGame: true }));
    expect(create.mock.calls[0]![0]).toMatchObject({
      tokenHash: hashOpaqueToken("old-token"),
      cancelOwnWaitingGame: true,
    });
    expect(setGuestCookie).toHaveBeenCalledWith(serverConfig, "old-token", 25 * 3600);
  });

  it.each([
    ["no body", undefined],
    ["a body without the acknowledgement", {}],
    ["a false acknowledgement", { acknowledgedGuestWarning: false }],
    ["an invalid nickname", { acknowledgedGuestWarning: true, nickname: "<b>" }],
  ])("answers 400 for %s, before anything is created", async (_name, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(setGuestCookie).not.toHaveBeenCalled();
    expect(clientKey).not.toHaveBeenCalled();
  });

  it("names the failing field", async () => {
    const response = await POST(post({ nickname: "Ala" }));
    const body = (await response.json()) as { error: { fieldErrors?: Record<string, string[]> } };
    expect(Object.keys(body.error.fieldErrors ?? {})).toEqual(["acknowledgedGuestWarning"]);
  });

  it("answers 500 when the client address is unknown in production, creating nothing", async () => {
    clientKey.mockImplementation(() => {
      throw new Error("Client address is unavailable behind the proxy.");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(post({ acknowledgedGuestWarning: true }));
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(create).not.toHaveBeenCalled();
    expect(setGuestCookie).not.toHaveBeenCalled();
  });

  it("sets no cookie when the service refuses: 409 with the game id", async () => {
    create.mockRejectedValue(
      new ConflictError("Masz oczekującą partię.", { code: "OWN_WAITING_GAME", data: { gameId: "g9" } }),
    );
    const response = await POST(post({ acknowledgedGuestWarning: true }));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; data?: unknown } };
    expect(body.error.code).toBe("OWN_WAITING_GAME");
    expect(setGuestCookie).not.toHaveBeenCalled();
  });
});

describe("POST /api/games (common)", () => {
  it("answers 403 without the CSRF header or with a foreign origin", async () => {
    expect((await POST(post(undefined, { "x-gomoku-request": "" }))).status).toBe(403);
    expect((await POST(post(undefined, { origin: "https://evil.example" }))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes service errors on: 429 with Retry-After", async () => {
    create.mockRejectedValue(new TooManyRequestsError("limit", { retryAfterSeconds: 30 }));
    const response = await POST(post());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
  });

  it("passes service errors on: 409 ACTIVE_GAME_EXISTS", async () => {
    create.mockRejectedValue(new ConflictError("Masz już partię.", { code: "ACTIVE_GAME_EXISTS" }));
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("ACTIVE_GAME_EXISTS");
  });
});

describe("POST /api/games with the bot (hosted-bot spec)", () => {
  const botGame = { gameId: "game-bot", opponent: "bot", bot: { level: 2, name: "Bot · poziom 2 · 16 MB" } };

  it("creates a game with the bot for an account: 201 without an invitation", async () => {
    create.mockResolvedValue(botGame);
    const response = await POST(post({ opponent: "bot", botLevel: 2 }));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual(botGame);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: "account", opponent: { kind: "bot", level: 2 } }));
  });

  it("gives a guest the cookie of a game in progress", async () => {
    getCurrentUser.mockResolvedValue(null);
    create.mockResolvedValue({ ...botGame, bot: { level: 1, name: "Bot · poziom 1" } });
    const response = await POST(post({ acknowledgedGuestWarning: true, opponent: "bot", botLevel: 1 }));
    expect(response.status).toBe(201);
    expect(create.mock.calls[0]![0]).toMatchObject({ kind: "guest", opponent: { kind: "bot", level: 1 } });
    expect(setGuestCookie).toHaveBeenCalledWith(serverConfig, expect.any(String), 2 * 3600);
  });

  it.each([
    ["no level", { opponent: "bot" }],
    ["a level without the bot", { botLevel: 1 }],
    ["the paper game", { opponent: "bot", botLevel: 1, variant: "paper" }],
    ["a public game", { opponent: "bot", botLevel: 1, isPublic: true }],
    ["a clock", { opponent: "bot", botLevel: 1, timeControlMs: 60_000 }],
  ])("answers 400 for %s, creating nothing", async (_name, body) => {
    expect((await POST(post(body))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("answers 503 BOT_UNAVAILABLE with Retry-After while the bot is switched off", async () => {
    create.mockRejectedValue(
      new ServiceUnavailableError("Bot jest teraz niedostępny.", { code: "BOT_UNAVAILABLE", retryAfterSeconds: 60 }),
    );
    const response = await POST(post({ opponent: "bot", botLevel: 1 }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect((await response.json()).error.code).toBe("BOT_UNAVAILABLE");
  });
});
