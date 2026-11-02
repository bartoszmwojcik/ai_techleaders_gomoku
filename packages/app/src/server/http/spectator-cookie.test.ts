import { SPECTATOR_ACCESS_MS } from "@gomoku/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

import { hashOpaqueToken } from "./opaque-token";
import {
  SPECTATOR_COOKIE_MAX_AGE_SECONDS,
  readSpectatorTokenHash,
  refreshSpectatorCookie,
  setSpectatorCookie,
  spectatorCookieName,
} from "./spectator-cookie";

const secure = { sessionCookieSecure: true };
const plain = { sessionCookieSecure: false };
const store = { set: vi.fn(), get: vi.fn() };

beforeEach(() => {
  store.set.mockReset();
  store.get.mockReset();
  cookies.mockResolvedValue(store);
});

describe("spectator cookie", () => {
  it("is not the guest cookie, and takes the __Host- prefix only when Secure", () => {
    expect(spectatorCookieName(secure)).toBe("__Host-gomoku_spectator");
    expect(spectatorCookieName(plain)).toBe("gomoku_spectator");
  });

  it("lives as long as the spectator's access: an hour", () => {
    expect(SPECTATOR_COOKIE_MAX_AGE_SECONDS).toBe(SPECTATOR_ACCESS_MS / 1000);
    expect(SPECTATOR_COOKIE_MAX_AGE_SECONDS).toBe(3600);
  });

  it("is HttpOnly, SameSite=Lax and carries the max age", async () => {
    await setSpectatorCookie(secure, "token");
    expect(store.set).toHaveBeenCalledWith("__Host-gomoku_spectator", "token", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  });

  it("reads only the hash of the token", async () => {
    store.get.mockReturnValue({ value: "token" });
    expect(await readSpectatorTokenHash(plain)).toBe(hashOpaqueToken("token"));
    expect(store.get).toHaveBeenCalledWith("gomoku_spectator");
  });

  it("reads nothing without the cookie or with an empty one", async () => {
    store.get.mockReturnValue(undefined);
    expect(await readSpectatorTokenHash(plain)).toBeUndefined();
    store.get.mockReturnValue({ value: "" });
    expect(await readSpectatorTokenHash(plain)).toBeUndefined();
  });

  it("slides the cookie the browser carries and does nothing without one", async () => {
    store.get.mockReturnValue({ value: "token" });
    await refreshSpectatorCookie(plain);
    expect(store.set).toHaveBeenCalledWith("gomoku_spectator", "token", expect.objectContaining({ maxAge: 3600 }));

    store.set.mockReset();
    store.get.mockReturnValue(undefined);
    await refreshSpectatorCookie(plain);
    expect(store.set).not.toHaveBeenCalled();
  });
});
