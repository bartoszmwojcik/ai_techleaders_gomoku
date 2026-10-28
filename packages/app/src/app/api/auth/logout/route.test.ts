import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connection,
  revoke,
  clearSessionCookie,
  sessionCookieName,
  cookieGet,
  getContainer,
} = vi.hoisted(() => ({
  connection: vi.fn(),
  revoke: vi.fn(),
  clearSessionCookie: vi.fn(),
  sessionCookieName: vi.fn(),
  cookieGet: vi.fn(),
  getContainer: vi.fn(),
}));
const serverConfig = {
  production: true,
  appOrigin: "https://gomoku.example",
  sessionCookieSecure: true,
};
vi.mock("next/server", () => ({ connection }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));
vi.mock("@/server/http/auth", () => ({
  clearSessionCookie,
  sessionCookieName,
}));
vi.mock("@/server/container", () => ({
  getContainer,
  withRequestScope: (fn: (scope: unknown) => unknown) =>
    fn({ cradle: { serverConfig, sessionService: { revoke } } }),
}));

import { POST } from "./route";

function post(headers: Record<string, string> = {}) {
  return new Request("https://gomoku.example/api/auth/logout", {
    method: "POST",
    headers: {
      origin: serverConfig.appOrigin,
      "x-gomoku-request": "1",
      ...headers,
    },
  });
}

beforeEach(() => {
  connection.mockReset().mockResolvedValue(undefined);
  revoke.mockReset().mockResolvedValue(undefined);
  clearSessionCookie.mockReset().mockResolvedValue(undefined);
  sessionCookieName.mockReset().mockReturnValue("__Host-gomoku_session");
  cookieGet.mockReset().mockReturnValue({ value: "tok" });
  getContainer.mockReset().mockResolvedValue({ cradle: { serverConfig } });
});

describe("POST /api/auth/logout", () => {
  it("revokes the current session and clears the cookie", async () => {
    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(connection).toHaveBeenCalledOnce();
    expect(cookieGet).toHaveBeenCalledWith("__Host-gomoku_session");
    expect(revoke).toHaveBeenCalledExactlyOnceWith("tok");
    expect(clearSessionCookie).toHaveBeenCalledExactlyOnceWith(serverConfig);
  });

  it("answers 200 and clears the cookie when there is no session cookie", async () => {
    cookieGet.mockReturnValue(undefined);

    const response = await POST(post());

    expect(response.status).toBe(200);
    expect(revoke).not.toHaveBeenCalled();
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("clears the cookie in the plain-name mode too", async () => {
    sessionCookieName.mockReturnValue("gomoku_session");

    await POST(post());

    expect(cookieGet).toHaveBeenCalledWith("gomoku_session");
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("clears the cookie even when the database fails, and answers 500", async () => {
    revoke.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(post());

    expect(response.status).toBe(500);
    expect(clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("rejects a request without the CSRF header with 403", async () => {
    const response = await POST(
      new Request("https://gomoku.example/api/auth/logout", {
        method: "POST",
        headers: { origin: serverConfig.appOrigin },
      }),
    );

    expect(response.status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin with 403", async () => {
    const response = await POST(post({ origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(revoke).not.toHaveBeenCalled();
  });
});
