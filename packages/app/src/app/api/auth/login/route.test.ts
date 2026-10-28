import { TooManyRequestsError, UnauthorizedError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connection,
  hit,
  reset,
  authenticate,
  create,
  setSessionCookie,
  getCurrentUser,
  getContainer,
} = vi.hoisted(() => ({
  connection: vi.fn(),
  hit: vi.fn(),
  reset: vi.fn(),
  authenticate: vi.fn(),
  create: vi.fn(),
  setSessionCookie: vi.fn(),
  getCurrentUser: vi.fn(),
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
vi.mock("@/server/http/auth", () => ({ setSessionCookie, getCurrentUser }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        serverConfig,
        rateLimiter: { hit, reset },
        userService: { authenticate },
        sessionService: { create },
      },
    }),
}));

import {
  LOGIN_EMAIL_IP_LIMIT,
  LOGIN_EMAIL_IP_WINDOW_MS,
  LOGIN_EMAIL_LIMIT,
  LOGIN_EMAIL_WINDOW_MS,
  LOGIN_IP_LIMIT,
  LOGIN_IP_WINDOW_MS,
  POST,
} from "./route";

const valid = { email: " Ala@Example.com ", password: "secret123" };

function post(body: unknown, address = "203.0.113.9") {
  return new Request("https://gomoku.example/api/auth/login", {
    method: "POST",
    headers: {
      origin: serverConfig.appOrigin,
      "x-gomoku-request": "1",
      "x-forwarded-for": address,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const keys = () => hit.mock.calls.map((call) => call[0] as string);

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  hit.mockReset().mockResolvedValue({ count: 1, retryAfterSeconds: 60 });
  reset.mockReset().mockResolvedValue(undefined);
  authenticate
    .mockReset()
    .mockResolvedValue({ id: "u1", displayName: "Ala_7" });
  create
    .mockReset()
    .mockResolvedValue({ token: "tok", expiresAt: new Date() });
  setSessionCookie.mockReset().mockResolvedValue(undefined);
  getCurrentUser.mockReset().mockResolvedValue(null);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/login", () => {
  it("authenticates, resets the e-mail counters before creating the session and answers 200", async () => {
    const response = await POST(post(valid));

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: { user: { id: "u1", displayName: "Ala_7" } },
    });
    expect(hit.mock.invocationCallOrder[0]).toBeLessThan(
      getCurrentUser.mock.invocationCallOrder[0] as number,
    );
    expect(getCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(
      hit.mock.invocationCallOrder[1] as number,
    );
    expect(authenticate).toHaveBeenCalledWith("ala@example.com", "secret123");
    expect(setSessionCookie).toHaveBeenCalledWith(serverConfig, "tok");
    const [ipKey, emailIpKey, emailKey] = keys();
    expect(ipKey).toMatch(/^login:ip:[0-9a-f]{64}$/);
    expect(emailIpKey).toMatch(/^login:email-ip:[0-9a-f]{64}$/);
    expect(emailKey).toMatch(/^login:email:[0-9a-f]{64}$/);
    expect(hit.mock.calls.map((call) => call.slice(1))).toEqual([
      [LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS],
      [LOGIN_EMAIL_IP_LIMIT, LOGIN_EMAIL_IP_WINDOW_MS],
      [LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS],
    ]);
    expect(reset.mock.calls.map((call) => call[0])).toEqual([
      emailIpKey,
      emailKey,
    ]);
    expect(reset.mock.invocationCallOrder[1]).toBeLessThan(
      create.mock.invocationCallOrder[0] as number,
    );
    expect(JSON.stringify(keys())).not.toContain("ala@example.com");
  });

  it("builds the pair key from e-mail and address", async () => {
    await POST(post(valid, "203.0.113.9"));
    await POST(post(valid, "203.0.113.10"));
    await POST(post({ ...valid, email: "inna@example.com" }, "203.0.113.9"));

    const calls = keys();
    expect(calls[1]).not.toBe(calls[4]);
    expect(calls[2]).toBe(calls[5]);
    expect(calls[1]).not.toBe(calls[7]);
  });

  it("answers 401 for bad credentials, keeps the counters and sets no cookie", async () => {
    authenticate.mockRejectedValue(new UnauthorizedError("Nieprawidłowy."));

    const response = await POST(post(valid));

    expect(response.status).toBe(401);
    expect(reset).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("answers 400 for invalid data after counting the address, without e-mail counters", async () => {
    const response = await POST(post({ email: "x", password: "" }));

    expect(response.status).toBe(400);
    expect(keys()).toHaveLength(1);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    expect((await POST(post("{"))).status).toBe(400);
    expect(keys()).toHaveLength(1);
    expect(keys()[0]).toMatch(/^login:ip:/);
  });

  it("answers 409 ALREADY_AUTHENTICATED after counting the address, without e-mail counters", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });

    const response = await POST(post(valid));

    expect(response.status).toBe(409);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code,
    ).toBe("ALREADY_AUTHENTICATED");
    expect(keys()).toHaveLength(1);
    expect(keys()[0]).toMatch(/^login:ip:/);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("answers 429 for the address before looking at the session", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1" });
    hit.mockRejectedValueOnce(
      new TooManyRequestsError("Zbyt wiele.", { retryAfterSeconds: 7 }),
    );

    const response = await POST(post(valid));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    "answers 429 with Retry-After when limiter call %i is exceeded",
    async (failing) => {
      for (let i = 0; i < failing; i++) {
        hit.mockResolvedValueOnce({ count: 1, retryAfterSeconds: 60 });
      }
      hit.mockRejectedValueOnce(
        new TooManyRequestsError("Zbyt wiele.", { retryAfterSeconds: 42 }),
      );

      const response = await POST(post(valid));

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("42");
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it("answers 403 without the CSRF header", async () => {
    const request = new Request("https://gomoku.example/api/auth/login", {
      method: "POST",
      headers: { origin: serverConfig.appOrigin },
      body: JSON.stringify(valid),
    });
    expect((await POST(request)).status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
