import { TooManyRequestsError, UnauthorizedError, ValidationError } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, after, hit, reset, request, deliver, requireSession, serverConfig } = vi.hoisted(() => ({
  connection: vi.fn(),
  after: vi.fn(),
  hit: vi.fn(),
  reset: vi.fn(),
  request: vi.fn(),
  deliver: vi.fn(),
  requireSession: vi.fn(),
  serverConfig: {
    production: true,
    trustProxyHops: 1,
    clientIpHeader: "x-forwarded-for",
    appOrigin: "https://gomoku.example",
  },
}));
vi.mock("next/server", () => ({ connection, after }));
vi.mock("@/server/http/auth", () => ({ requireSession }));
vi.mock("@/server/container", () => ({
  getContainer: vi.fn().mockResolvedValue({ cradle: { serverConfig } }),
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, rateLimiter: { hit, reset }, emailChangeService: { request, deliver } } }),
}));

import { EMAIL_CHANGE_PASSWORD_LIMIT, EMAIL_CHANGE_PASSWORD_WINDOW_MS, POST } from "./route";

const account = { id: "u1", email: "ala@example.com", displayName: "Ala" };
const valid = { newEmail: " Nowy@Example.com ", currentPassword: "secret-1" };

function post(body: unknown = valid, headers: Record<string, string> = {}) {
  const sent: Record<string, string> = { origin: serverConfig.appOrigin, "x-gomoku-request": "1", ...headers };
  for (const name of Object.keys(sent)) if (sent[name] === "") delete sent[name];
  return POST(
    new Request("https://gomoku.example/api/auth/email-change", { method: "POST", headers: sent, body: JSON.stringify(body) }),
  );
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  after.mockReset();
  hit.mockReset().mockResolvedValue(undefined);
  reset.mockReset().mockResolvedValue(undefined);
  request.mockReset().mockResolvedValue(account);
  deliver.mockReset().mockResolvedValue(undefined);
  requireSession.mockReset().mockResolvedValue({ id: "u1" });
});

describe("POST /api/auth/email-change", () => {
  it("checks the password, gives the attempt back, answers 202 and delivers after the response", async () => {
    const response = await post();
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(hit).toHaveBeenCalledWith("password-change:user:u1", EMAIL_CHANGE_PASSWORD_LIMIT, EMAIL_CHANGE_PASSWORD_WINDOW_MS);
    expect(EMAIL_CHANGE_PASSWORD_LIMIT).toBe(10);
    expect(EMAIL_CHANGE_PASSWORD_WINDOW_MS).toBe(900_000);
    expect(request).toHaveBeenCalledWith("u1", "nowy@example.com", "secret-1");
    expect(reset).toHaveBeenCalledWith("password-change:user:u1");
    expect(deliver).not.toHaveBeenCalled();

    await (after.mock.calls[0]![0] as () => Promise<void>)();
    expect(deliver).toHaveBeenCalledWith(account, "nowy@example.com");
  });

  it("only logs a failure of the delivery, without the address", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deliver.mockRejectedValue(new Error("db nowy@example.com"));
    await post();
    await (after.mock.calls[0]![0] as () => Promise<void>)();
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain("nowy@example.com");
    log.mockRestore();
  });

  it("answers 401 without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Zaloguj."));
    expect((await post()).status).toBe(401);
    expect(hit).not.toHaveBeenCalled();
  });

  it("answers 400 for a bad address without spending an attempt", async () => {
    const response = await post({ newEmail: "nie-adres", currentPassword: "x" });
    expect(response.status).toBe(400);
    expect(hit).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("keeps the counter and schedules nothing for a wrong password", async () => {
    request.mockRejectedValue(
      new ValidationError("Złe.", { code: "INVALID_CURRENT_PASSWORD", fieldErrors: { currentPassword: ["Złe."] } }),
    );
    const response = await post();
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(reset).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("answers 429 over the password counter before the password is checked", async () => {
    hit.mockRejectedValue(new TooManyRequestsError("Za dużo.", { retryAfterSeconds: 30 }));
    const response = await post();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(request).not.toHaveBeenCalled();
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await post(valid, { "x-gomoku-request": "" })).status).toBe(403);
    expect(requireSession).not.toHaveBeenCalled();
  });
});
