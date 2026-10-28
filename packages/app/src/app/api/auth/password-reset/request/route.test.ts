import { TooManyRequestsError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, after, hit, request, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  after: vi.fn(),
  hit: vi.fn(),
  request: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
  appOrigin: "https://gomoku.example",
};
vi.mock("next/server", () => ({ connection, after }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        serverConfig,
        rateLimiter: { hit },
        passwordResetService: { request },
      },
    }),
}));

import {
  PASSWORD_RESET_REQUEST_IP_LIMIT,
  PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
  POST,
} from "./route";

function post(
  body: unknown = { email: " Ala@Example.com " },
  headers: Record<string, string> = {},
) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    "x-forwarded-for": "203.0.113.9",
    ...headers,
  };
  for (const name of Object.keys(sent)) {
    if (sent[name] === "") delete sent[name];
  }
  return POST(
    new Request("https://gomoku.example/api/auth/password-reset/request", {
      method: "POST",
      headers: sent,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  after.mockReset();
  hit.mockReset().mockResolvedValue(undefined);
  request.mockReset().mockResolvedValue(undefined);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/password-reset/request", () => {
  it("answers 200 and defers all account work to after()", async () => {
    const response = await post();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(hit).toHaveBeenCalledWith(
      expect.stringMatching(/^password-reset-request:ip:[0-9a-f]{64}$/),
      PASSWORD_RESET_REQUEST_IP_LIMIT,
      PASSWORD_RESET_REQUEST_IP_WINDOW_MS,
    );
    expect(hit.mock.calls[0]?.[0]).not.toContain("203.0.113.9");
    expect(request).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledOnce();

    await after.mock.calls[0]?.[0]();

    expect(request).toHaveBeenCalledWith("ala@example.com");
  });

  it("logs a failure inside after() without the address and does not throw", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    request.mockRejectedValue(new Error("boom ala@example.com"));
    await post();

    await expect(after.mock.calls[0]?.[0]()).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("ala@example.com");
    log.mockRestore();
  });

  it("answers 400 VALIDATION for a bad shape and schedules nothing", async () => {
    const response = await post({ email: "nope" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION");
    expect(after).not.toHaveBeenCalled();
  });

  it("answers 400 for an unparsable body", async () => {
    const response = await post("{");

    expect(response.status).toBe(400);
    expect(after).not.toHaveBeenCalled();
  });

  it("spends the address limit before parsing", async () => {
    await post("{");

    expect(hit).toHaveBeenCalledOnce();
  });

  it("answers 429 with Retry-After when the address limit is exceeded", async () => {
    hit.mockRejectedValue(
      new TooManyRequestsError("slow", { retryAfterSeconds: 60 }),
    );

    const response = await post();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(after).not.toHaveBeenCalled();
  });

  it("fails closed (500) without a trustworthy client address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post(undefined, { "x-forwarded-for": "" });

    expect(response.status).toBe(500);
    expect(after).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example" },
    { "x-gomoku-request": "" },
  ])("rejects a request failing CSRF (%j) with 403", async (headers) => {
    const response = await post(undefined, headers);

    expect(response.status).toBe(403);
    expect(hit).not.toHaveBeenCalled();
  });
});
