import {
  AppError,
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
} from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, resend, requireSession, getContainer } = vi.hoisted(() => ({
  connection: vi.fn(),
  resend: vi.fn(),
  requireSession: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = {
  production: true,
  trustProxyHops: 1,
  clientIpHeader: "x-forwarded-for",
  appOrigin: "https://gomoku.example",
};
const user = {
  id: "u1",
  displayName: "Ala",
  email: "ala@example.com",
  emailVerifiedAt: null,
};
vi.mock("next/server", () => ({ connection }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, emailVerificationService: { resend } } }),
}));

import { POST } from "./route";

function post(headers: Record<string, string> = {}) {
  const sent: Record<string, string> = {
    origin: serverConfig.appOrigin,
    "x-gomoku-request": "1",
    "x-forwarded-for": "203.0.113.7",
    ...headers,
  };
  for (const name of Object.keys(sent)) {
    if (sent[name] === "") delete sent[name];
  }
  return POST(
    new Request("https://gomoku.example/api/auth/email-verification/resend", {
      method: "POST",
      headers: sent,
    }),
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  resend.mockReset().mockResolvedValue(undefined);
  requireSession.mockReset().mockResolvedValue(user);
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/email-verification/resend", () => {
  it("resends for the signed-in user with a hashed address key", async () => {
    const response = await post();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(resend).toHaveBeenCalledWith(
      user,
      expect.stringMatching(/^verification-resend:ip:[0-9a-f]{64}$/),
    );
    expect(resend.mock.calls[0]?.[1]).not.toContain("203.0.113.7");
  });

  it("answers 401 without a session and sends nothing", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("no"));

    const response = await post();

    expect(response.status).toBe(401);
    expect(resend).not.toHaveBeenCalled();
  });

  it("answers 409 ALREADY_VERIFIED", async () => {
    resend.mockRejectedValue(
      new ConflictError("done", { code: "ALREADY_VERIFIED" }),
    );

    const response = await post();

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ALREADY_VERIFIED");
  });

  it("answers 429 with Retry-After", async () => {
    resend.mockRejectedValue(
      new TooManyRequestsError("slow", { retryAfterSeconds: 90 }),
    );

    const response = await post();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect((await response.json()).error.code).toBe("RATE_LIMITED");
  });

  it.each([
    [502, "EMAIL_SEND_FAILED"],
    [503, "EMAIL_QUOTA_EXCEEDED"],
  ])("passes %i %s through", async (status, code) => {
    resend.mockRejectedValue(new AppError(status, code, "x"));

    const response = await post();

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it.each<Record<string, string>>([
    { origin: "https://evil.example" },
    { "x-gomoku-request": "" },
  ])("rejects a request failing CSRF (%j) with 403", async (headers) => {
    const response = await post(headers);

    expect(response.status).toBe(403);
    expect(requireSession).not.toHaveBeenCalled();
  });
});
