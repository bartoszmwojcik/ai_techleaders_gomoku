import { GUEST_TOKEN_GRACE_MS } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

import {
  GUEST_COOKIE_MAX_AGE_SECONDS,
  guestCookieMaxAge,
  guestCookieName,
  readGuestToken,
  readGuestTokenHash,
  refreshGuestCookie,
  setGuestCookie,
} from "./guest-cookie";
import { hashOpaqueToken } from "./opaque-token";

const secure = { sessionCookieSecure: true };
const plain = { sessionCookieSecure: false };
const store = { set: vi.fn(), get: vi.fn() };

beforeEach(() => {
  store.set.mockReset();
  store.get.mockReset();
  cookies.mockResolvedValue(store);
});

describe("guest cookie", () => {
  it("uses the __Host- prefix only when Secure, like the session cookie", () => {
    expect(guestCookieName(secure)).toBe("__Host-gomoku_guest");
    expect(guestCookieName(plain)).toBe("gomoku_guest");
  });

  it("lives two hours: longer than the hour the token works after the game", () => {
    expect(GUEST_COOKIE_MAX_AGE_SECONDS).toBe(7200);
    expect(GUEST_COOKIE_MAX_AGE_SECONDS * 1000).toBeGreaterThan(GUEST_TOKEN_GRACE_MS);
  });

  it("sets an httpOnly, lax, host-only cookie", async () => {
    await setGuestCookie(secure, "tok");
    expect(store.set).toHaveBeenCalledWith("__Host-gomoku_guest", "tok", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7200,
    });
  });

  it("sets the cookie with a given lifetime", async () => {
    await setGuestCookie(secure, "tok", 90_000);
    expect(store.set).toHaveBeenCalledWith("__Host-gomoku_guest", "tok", expect.objectContaining({ maxAge: 90_000 }));
  });

  it("refreshes the cookie with a given lifetime", async () => {
    store.get.mockReturnValue({ value: "tok" });
    await refreshGuestCookie(plain, 500);
    expect(store.set).toHaveBeenCalledWith("gomoku_guest", "tok", expect.objectContaining({ maxAge: 500 }));
  });

  it("keeps a waiting game's cookie until one hour after its invitation expires (L29)", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const expiresAt = new Date(now.getTime() + 24 * 3_600_000);
    expect(guestCookieMaxAge({ status: "waiting", invitation: { expiresAt } }, now)).toBe(25 * 3600);
    // Never zero or negative, whatever the clock says.
    expect(guestCookieMaxAge({ status: "waiting", invitation: { expiresAt: new Date(0) } }, now)).toBe(1);
  });

  it("gives every other state the two hours of a joiner", () => {
    const now = new Date();
    expect(guestCookieMaxAge({ status: "active" }, now)).toBe(GUEST_COOKIE_MAX_AGE_SECONDS);
    expect(guestCookieMaxAge({ status: "waiting" }, now)).toBe(GUEST_COOKIE_MAX_AGE_SECONDS);
  });

  it("sets the cookie again with a fresh Max-Age when the browser carries one", async () => {
    store.get.mockReturnValue({ value: "tok" });
    await refreshGuestCookie(plain);
    expect(store.set).toHaveBeenCalledWith("gomoku_guest", "tok", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 7200,
    });
  });

  it("refreshes nothing without a cookie", async () => {
    store.get.mockReturnValue(undefined);
    await refreshGuestCookie(plain);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("reads the raw token for a create that keeps it", async () => {
    store.get.mockReturnValue({ value: "tok" });
    expect(await readGuestToken(plain)).toBe("tok");
    store.get.mockReturnValue({ value: "" });
    expect(await readGuestToken(plain)).toBeUndefined();
  });

  it("reads only the hash of the token", async () => {
    store.get.mockReturnValue({ value: "tok" });
    expect(await readGuestTokenHash(plain)).toBe(hashOpaqueToken("tok"));
    expect(store.get).toHaveBeenCalledWith("gomoku_guest");
  });

  it.each([undefined, { value: "" }])("reads nothing without a usable cookie (%j)", async (cookie) => {
    store.get.mockReturnValue(cookie);
    expect(await readGuestTokenHash(plain)).toBeUndefined();
  });

  it("reads the token as the cookie carries it", async () => {
    store.get.mockReturnValue({ value: "tok" });
    expect(await readGuestToken(plain)).toBe("tok");
    store.get.mockReturnValue(undefined);
    expect(await readGuestToken(plain)).toBeUndefined();
  });
});
