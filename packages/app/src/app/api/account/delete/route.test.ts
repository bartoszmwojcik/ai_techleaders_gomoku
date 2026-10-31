import {
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, hit, release, reset, deleteAccount, requireSessionWithId, clearSessionCookie, getContainer } =
  vi.hoisted(() => ({
    connection: vi.fn(),
    hit: vi.fn(),
    release: vi.fn(),
    reset: vi.fn(),
    deleteAccount: vi.fn(),
    requireSessionWithId: vi.fn(),
    clearSessionCookie: vi.fn(),
    getContainer: vi.fn(),
  }));
const serverConfig = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
  appOrigin: "https://gomoku.example",
  sessionCookieSecure: true,
};
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSessionWithId, clearSessionCookie }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        serverConfig,
        rateLimiter: { hit, release, reset },
        accountService: { delete: deleteAccount },
      },
    }),
}));

import { ACCOUNT_DELETE_LIMIT, ACCOUNT_DELETE_WINDOW_MS, POST } from "./route";

const valid = { password: "secret123", confirm: true };
const KEY = "account-delete:user:u1";

function post(body: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    ...headers,
  };
  for (const name of Object.keys(sent)) {
    if (sent[name] === "") delete sent[name];
  }
  return new Request("https://gomoku.example/api/account/delete", {
    method: "POST",
    headers: sent,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const wrongPassword = () =>
  new ValidationError("Nieprawidłowe hasło.", {
    code: "INVALID_PASSWORD",
    fieldErrors: { password: ["Nieprawidłowe hasło."] },
  });

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  hit.mockReset().mockResolvedValue({ count: 1, retryAfterSeconds: 60 });
  release.mockReset().mockResolvedValue(undefined);
  reset.mockReset().mockResolvedValue(undefined);
  deleteAccount.mockReset().mockResolvedValue(undefined);
  clearSessionCookie.mockReset().mockResolvedValue(undefined);
  requireSessionWithId.mockReset().mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/account/delete", () => {
  it("counts the attempt, deletes, forgets the counter, drops the cookie and answers 200", async () => {
    const response = await POST(post(valid));

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(hit).toHaveBeenCalledWith(KEY, ACCOUNT_DELETE_LIMIT, ACCOUNT_DELETE_WINDOW_MS);
    expect(ACCOUNT_DELETE_LIMIT).toBe(10);
    expect(ACCOUNT_DELETE_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(deleteAccount).toHaveBeenCalledWith("u1", "secret123");
    expect(hit.mock.invocationCallOrder[0]).toBeLessThan(deleteAccount.mock.invocationCallOrder[0] as number);
    expect(reset).toHaveBeenCalledWith(KEY);
    expect(release).not.toHaveBeenCalled();
    expect(clearSessionCookie).toHaveBeenCalledWith(serverConfig);
  });

  it("answers 401 without a session and touches nothing", async () => {
    requireSessionWithId.mockRejectedValue(new UnauthorizedError("Zaloguj."));
    const response = await POST(post(valid));
    expect(response.status).toBe(401);
    expect(hit).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("answers 400 without the confirmation and spends no attempt", async () => {
    const response = await POST(post({ password: "secret123", confirm: false }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; fieldErrors: Record<string, string[]> } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fieldErrors.confirm).toBeDefined();
    expect(hit).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("answers 400 for an empty password and for a body that is not JSON", async () => {
    expect((await POST(post({ password: "", confirm: true }))).status).toBe(400);
    expect((await POST(post("not json"))).status).toBe(400);
    expect(hit).not.toHaveBeenCalled();
  });

  it("answers 400 INVALID_PASSWORD, keeps the attempt counted and the cookie", async () => {
    deleteAccount.mockRejectedValue(wrongPassword());
    const response = await POST(post(valid));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; fieldErrors: Record<string, string[]> } };
    expect(body.error.code).toBe("INVALID_PASSWORD");
    expect(body.error.fieldErrors.password).toEqual(["Nieprawidłowe hasło."]);
    expect(release).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("answers 409 ACTIVE_GAME with the game id and gives the attempt back", async () => {
    deleteAccount.mockRejectedValue(
      new ConflictError("Najpierw dokończ albo poddaj partię.", { code: "ACTIVE_GAME", data: { gameId: "g1" } }),
    );
    const response = await POST(post(valid));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; data: { gameId: string } } };
    expect(body.error.code).toBe("ACTIVE_GAME");
    expect(body.error.data).toEqual({ gameId: "g1" });
    expect(release).toHaveBeenCalledWith(KEY, ACCOUNT_DELETE_WINDOW_MS);
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("answers 401 when the account is already gone: gives the attempt back and drops the cookie", async () => {
    deleteAccount.mockRejectedValue(new UnauthorizedError("Zaloguj się."));
    const response = await POST(post(valid));
    expect(response.status).toBe(401);
    expect(release).toHaveBeenCalledWith(KEY, ACCOUNT_DELETE_WINDOW_MS);
    expect(clearSessionCookie).toHaveBeenCalledWith(serverConfig);
  });

  it("answers 500 on a failure, gives the attempt back and keeps the cookie", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    deleteAccount.mockRejectedValue(new Error("database down"));
    const response = await POST(post(valid));
    expect(response.status).toBe(500);
    expect(release).toHaveBeenCalledOnce();
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("does not let a failing release hide the original error", async () => {
    release.mockRejectedValue(new Error("release failed"));
    deleteAccount.mockRejectedValue(
      new ConflictError("Najpierw dokończ albo poddaj partię.", { code: "ACTIVE_GAME", data: { gameId: "g1" } }),
    );
    expect((await POST(post(valid))).status).toBe(409);
  });

  it("answers 429 over the limit before the password is checked", async () => {
    hit.mockRejectedValue(new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 30 }));
    const response = await POST(post(valid));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header and for a foreign Origin", async () => {
    expect((await POST(post(valid, { "x-gomoku-request": "" }))).status).toBe(403);
    expect((await POST(post(valid, { origin: "https://evil.example" }))).status).toBe(403);
    expect(requireSessionWithId).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
