import {
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connection,
  hit,
  reset,
  changePassword,
  requireSessionWithId,
  getContainer,
} = vi.hoisted(() => ({
  connection: vi.fn(),
  hit: vi.fn(),
  reset: vi.fn(),
  changePassword: vi.fn(),
  requireSessionWithId: vi.fn(),
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
vi.mock("@/server/http/auth", () => ({ requireSessionWithId }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        serverConfig,
        rateLimiter: { hit, reset },
        userService: { changePassword },
      },
    }),
}));

import {
  PASSWORD_CHANGE_LIMIT,
  PASSWORD_CHANGE_WINDOW_MS,
  POST,
} from "./route";

const valid = { currentPassword: "old-secret1", newPassword: "new-secret2" };

function post(body: unknown, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    ...headers,
  };
  for (const name of Object.keys(sent)) {
    if (sent[name] === "") delete sent[name];
  }
  return new Request("https://gomoku.example/api/auth/password", {
    method: "POST",
    headers: sent,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  hit.mockReset().mockResolvedValue({ count: 1, retryAfterSeconds: 60 });
  reset.mockReset().mockResolvedValue(undefined);
  changePassword.mockReset().mockResolvedValue(undefined);
  requireSessionWithId
    .mockReset()
    .mockResolvedValue({ user: { id: "u1" }, sessionId: "s1" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/password", () => {
  it("counts the attempt, changes the password, gives the attempt back and answers 200", async () => {
    const response = await POST(post(valid));

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(hit).toHaveBeenCalledWith(
      "password-change:user:u1",
      PASSWORD_CHANGE_LIMIT,
      PASSWORD_CHANGE_WINDOW_MS,
    );
    expect(PASSWORD_CHANGE_LIMIT).toBe(10);
    expect(PASSWORD_CHANGE_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(changePassword).toHaveBeenCalledWith(
      "u1",
      "s1",
      "old-secret1",
      "new-secret2",
    );
    expect(hit.mock.invocationCallOrder[0]).toBeLessThan(
      changePassword.mock.invocationCallOrder[0] as number,
    );
    expect(reset).toHaveBeenCalledWith("password-change:user:u1");
  });

  it("answers 401 without a session and touches nothing", async () => {
    requireSessionWithId.mockRejectedValue(new UnauthorizedError("Zaloguj."));

    const response = await POST(post(valid));

    expect(response.status).toBe(401);
    expect(hit).not.toHaveBeenCalled();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("answers 400 for invalid input without spending an attempt", async () => {
    const response = await POST(post({ ...valid, newPassword: "short" }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; fieldErrors: Record<string, string[]> };
    };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fieldErrors.newPassword).toBeDefined();
    expect(hit).not.toHaveBeenCalled();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("answers 400 when the new password equals the current one", async () => {
    const response = await POST(
      post({ currentPassword: "same-secret1", newPassword: "same-secret1" }),
    );

    expect(response.status).toBe(400);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("answers 400 INVALID_CURRENT_PASSWORD and keeps the counter", async () => {
    changePassword.mockRejectedValue(
      new ValidationError("Nieprawidłowe obecne hasło.", {
        code: "INVALID_CURRENT_PASSWORD",
        fieldErrors: { currentPassword: ["Nieprawidłowe obecne hasło."] },
      }),
    );

    const response = await POST(post(valid));

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; fieldErrors: Record<string, string[]> };
    };
    expect(body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(body.error.fieldErrors.currentPassword).toBeDefined();
    expect(reset).not.toHaveBeenCalled();
  });

  it("answers 429 over the limit before the password is checked", async () => {
    hit.mockRejectedValue(
      new TooManyRequestsError("Za dużo prób.", { retryAfterSeconds: 30 }),
    );

    const response = await POST(post(valid));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header", async () => {
    const response = await POST(post(valid, { "x-gomoku-request": "" }));

    expect(response.status).toBe(403);
    expect(requireSessionWithId).not.toHaveBeenCalled();
  });

  it("answers 403 for a foreign Origin", async () => {
    const response = await POST(
      post(valid, { origin: "https://evil.example" }),
    );

    expect(response.status).toBe(403);
    expect(changePassword).not.toHaveBeenCalled();
  });
});
