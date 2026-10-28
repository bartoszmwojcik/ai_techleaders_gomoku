import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookies, withRequestScope } = vi.hoisted(() => ({
  cookies: vi.fn(),
  withRequestScope: vi.fn(),
}));
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../container", () => ({ withRequestScope }));

import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  clearSessionCookie,
  getCurrentUser,
  getCurrentUserWith,
  requirePageSession,
  requireSession,
  requireSessionWithId,
  sessionCookieName,
  setSessionCookie,
} from "./auth";

const secure = { sessionCookieSecure: true };
const plain = { sessionCookieSecure: false };

const store = { set: vi.fn(), get: vi.fn() };

beforeEach(() => {
  store.set.mockReset();
  store.get.mockReset();
  cookies.mockResolvedValue(store);
  withRequestScope.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("session cookie", () => {
  it("uses the __Host- prefix only when Secure", () => {
    expect(sessionCookieName(secure)).toBe("__Host-gomoku_session");
    expect(sessionCookieName(plain)).toBe("gomoku_session");
  });

  it("lives one hour longer than the session", () => {
    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBe(2595600);
  });

  it("sets an httpOnly, lax, host-only cookie in production mode", async () => {
    await setSessionCookie(secure, "tok");
    expect(store.set).toHaveBeenCalledWith("__Host-gomoku_session", "tok", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2595600,
    });
  });

  it("drops Secure and the prefix when configured so", async () => {
    await setSessionCookie(plain, "tok");
    expect(store.set).toHaveBeenCalledWith(
      "gomoku_session",
      "tok",
      expect.objectContaining({ secure: false }),
    );
  });

  it("clears the cookie with matching attributes", async () => {
    await clearSessionCookie(secure);
    expect(store.set).toHaveBeenCalledWith("__Host-gomoku_session", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});

describe("getCurrentUser", () => {
  function scope(findValid: unknown) {
    withRequestScope.mockImplementation(
      async (fn: (s: unknown) => Promise<unknown>) =>
        fn({
          cradle: {
            serverConfig: plain,
            sessionService: { findValid },
          },
        }),
    );
  }

  it("returns null without a cookie", async () => {
    scope(vi.fn());
    store.get.mockReturnValue(undefined);
    expect(await getCurrentUser()).toBeNull();
    expect(store.get).toHaveBeenCalledWith("gomoku_session");
  });

  it("returns null for an unknown or expired session", async () => {
    scope(vi.fn(async () => null));
    store.get.mockReturnValue({ value: "tok" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the session's user", async () => {
    const findValid = vi.fn(async () => ({
      user: {
        id: "u1",
        displayName: "Ala",
        email: "ala@example.com",
        emailVerifiedAt: undefined,
      },
    }));
    scope(findValid);
    store.get.mockReturnValue({ value: "tok" });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      displayName: "Ala",
      email: "ala@example.com",
      emailVerifiedAt: null,
    });
    expect(findValid).toHaveBeenCalledWith("tok");
  });

  it("reads extra data for the user in the same request scope", async () => {
    scope(
      vi.fn(async () => ({
        user: { id: "u1", displayName: "Ala", email: "a@b.c" },
      })),
    );
    store.get.mockReturnValue({ value: "tok" });
    const read = vi.fn(async () => "extra");
    expect(await getCurrentUserWith(read)).toMatchObject({
      user: { id: "u1" },
      data: "extra",
    });
    expect(withRequestScope).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      expect.anything(),
      expect.objectContaining({ id: undefined }),
    );
  });

  it("does not read extra data without a session", async () => {
    scope(vi.fn(async () => null));
    store.get.mockReturnValue({ value: "tok" });
    const read = vi.fn();
    expect(await getCurrentUserWith(read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps a verification date", async () => {
    const at = new Date();
    scope(
      vi.fn(async () => ({
        user: { id: "u1", displayName: "Ala", emailVerifiedAt: at },
      })),
    );
    store.get.mockReturnValue({ value: "tok" });
    expect((await getCurrentUser())?.emailVerifiedAt).toBe(at);
  });

  it("fails closed to null on any error", async () => {
    const error = new Error("select ... 'ala@example.com'");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    withRequestScope.mockRejectedValue(error);
    expect(await getCurrentUser()).toBeNull();
    expect(log).toHaveBeenCalledWith("Session lookup failed", {
      name: "Error",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("ala@example.com");
    log.mockRestore();
  });
});

describe("session guards", () => {
  function signedIn(signed: boolean) {
    withRequestScope.mockImplementation(
      async (fn: (s: unknown) => Promise<unknown>) =>
        fn({
          cradle: {
            serverConfig: plain,
            sessionService: {
              findValid: async () =>
                signed
                  ? {
                      id: "s1",
                      user: {
                        id: "u1",
                        displayName: "Ala",
                        email: "ala@example.com",
                      },
                    }
                  : null,
            },
          },
        }),
    );
    store.get.mockReturnValue({ value: "tok" });
  }

  beforeEach(() => {
    redirect.mockReset();
    redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT ${url}`);
    });
  });

  it("requireSession returns the user", async () => {
    signedIn(true);
    expect(await requireSession()).toMatchObject({ id: "u1" });
  });

  it("requireSessionWithId returns the user and the current session id", async () => {
    signedIn(true);
    expect(await requireSessionWithId()).toMatchObject({
      user: { id: "u1" },
      sessionId: "s1",
    });
  });

  it("requireSessionWithId rejects with a 401 without a session", async () => {
    signedIn(false);
    await expect(requireSessionWithId()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("requireSession rejects with a 401 without a session", async () => {
    signedIn(false);
    await expect(requireSession()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("requirePageSession returns the user", async () => {
    signedIn(true);
    expect(await requirePageSession("/account")).toMatchObject({ id: "u1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("requirePageSession redirects to the login with an encoded next", async () => {
    signedIn(false);
    await expect(requirePageSession("/account?a=b&c")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2Faccount%3Fa%3Db%26c",
    );
  });

  it("requirePageSession never redirects to an unsafe next (open redirect guard)", async () => {
    signedIn(false);
    await expect(requirePageSession("//evil.com")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2F",
    );
    await expect(requirePageSession("https://evil.com")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2F",
    );
  });

  it("requirePageSession redirects when the session lookup fails (fail closed)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    withRequestScope.mockRejectedValue(new Error("db down"));
    await expect(requirePageSession("/account")).rejects.toThrow(
      "NEXT_REDIRECT /login?next=%2Faccount",
    );
    log.mockRestore();
  });
});
