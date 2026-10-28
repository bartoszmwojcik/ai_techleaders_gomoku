import { TooManyRequestsError, ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, hit, confirm, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  hit: vi.fn(),
  confirm: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
  appOrigin: "https://gomoku.example",
};
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({
      cradle: {
        serverConfig,
        rateLimiter: { hit },
        passwordResetService: { confirm },
      },
    }),
}));

import {
  PASSWORD_RESET_CONFIRM_IP_LIMIT,
  PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
  POST,
} from "./route";

const valid = { token: "tok-123", newPassword: "brand-new-pass1" };

function post(body: unknown = valid, headers: Record<string, string> = {}) {
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
    new Request("https://gomoku.example/api/auth/password-reset/confirm", {
      method: "POST",
      headers: sent,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  hit.mockReset().mockResolvedValue(undefined);
  confirm.mockReset().mockResolvedValue(undefined);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/password-reset/confirm", () => {
  it("sets the password, logs nobody in and spends the address limit", async () => {
    const response = await post();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(confirm).toHaveBeenCalledWith("tok-123", "brand-new-pass1");
    expect(hit).toHaveBeenCalledWith(
      expect.stringMatching(/^password-reset-confirm:ip:[0-9a-f]{64}$/),
      PASSWORD_RESET_CONFIRM_IP_LIMIT,
      PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
    );
  });

  it("answers 400 INVALID_TOKEN", async () => {
    confirm.mockRejectedValue(
      new ValidationError("Link wygasł.", { code: "INVALID_TOKEN" }),
    );

    const response = await post();

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_TOKEN");
  });

  it("answers 400 VALIDATION with fieldErrors.newPassword", async () => {
    const response = await post({ token: "tok", newPassword: "short" });

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("VALIDATION");
    expect(error.fieldErrors.newPassword).toBeDefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("answers 400 for an unparsable body", async () => {
    const response = await post("{");

    expect(response.status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After and does not consume the token", async () => {
    hit.mockRejectedValue(
      new TooManyRequestsError("slow", { retryAfterSeconds: 30 }),
    );

    const response = await post();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example" },
    { "x-gomoku-request": "" },
  ])("rejects a request failing CSRF (%j) with 403", async (headers) => {
    const response = await post(valid, headers);

    expect(response.status).toBe(403);
    expect(hit).not.toHaveBeenCalled();
  });
});
