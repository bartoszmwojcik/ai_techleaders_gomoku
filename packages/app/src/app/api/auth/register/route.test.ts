import { ConflictError, TooManyRequestsError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, consume, register, setSessionCookie, getContainer } =
  vi.hoisted(() => ({
    connection: vi.fn(),
    consume: vi.fn(),
    register: vi.fn(),
    setSessionCookie: vi.fn(),
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
vi.mock("@/server/http/auth", () => ({ setSessionCookie }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        serverConfig,
        rateLimiter: { consume },
        userService: { register },
      },
    }),
}));

import { POST, REGISTER_LIMIT, REGISTER_WINDOW_MS } from "./route";

const valid = {
  email: "Ala@Example.com",
  displayName: "Ala_7",
  password: "secret123",
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://gomoku.example/api/auth/register", {
    method: "POST",
    headers: {
      origin: serverConfig.appOrigin,
      "x-gomoku-request": "1",
      "x-forwarded-for": "203.0.113.9",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  consume.mockReset().mockResolvedValue(undefined);
  register.mockReset();
  setSessionCookie.mockReset().mockResolvedValue(undefined);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/register", () => {
  it("creates the account, sets the cookie and answers 201", async () => {
    register.mockResolvedValue({
      user: { id: "u1", displayName: "Ala_7" },
      session: { token: "tok", expiresAt: new Date() },
    });

    const response = await POST(post(valid));

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { user: { id: "u1", displayName: "Ala_7" } },
    });
    expect(register).toHaveBeenCalledWith({
      email: "ala@example.com",
      displayName: "Ala_7",
      password: "secret123",
    });
    expect(setSessionCookie).toHaveBeenCalledWith(serverConfig, "tok");
    const [key, limit, windowMs] = consume.mock.calls[0] as [
      string,
      number,
      number,
    ];
    expect(key).toMatch(/^register:ip:[0-9a-f]{64}$/);
    expect([limit, windowMs]).toEqual([REGISTER_LIMIT, REGISTER_WINDOW_MS]);
  });

  it("counts the attempt before validating, then answers 400 with field errors", async () => {
    const response = await POST(post({ ...valid, email: "nope" }));

    expect(consume).toHaveBeenCalledOnce();
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { fieldErrors: object } };
    expect(body.error.fieldErrors).toHaveProperty("email");
    expect(register).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await POST(post("{"));
    expect(response.status).toBe(400);
    expect(consume).not.toHaveBeenCalled();
  });

  it("passes a conflict through and sets no cookie", async () => {
    register.mockRejectedValue(new ConflictError("zajęte"));

    const response = await POST(post(valid));

    expect(response.status).toBe(409);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After and does not validate", async () => {
    consume.mockRejectedValue(
      new TooManyRequestsError("x", { retryAfterSeconds: 42 }),
    );

    const response = await POST(post(valid));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin before touching the limiter", async () => {
    const response = await POST(
      post(valid, { origin: "https://inny.byst.re" }),
    );
    expect(response.status).toBe(403);
    expect(consume).not.toHaveBeenCalled();
  });
});
