// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BANNER_REOPEN_MS,
  isBannerVisible,
  readClosedAt,
  rememberClosed,
  subscribeToBannerMemory,
} from "./verify-email-banner-memory";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("isBannerVisible", () => {
  const now = 1_000_000_000_000;

  it("is visible when it was never closed", () => {
    expect(isBannerVisible(null, now)).toBe(true);
  });

  it("stays hidden for 7 days", () => {
    expect(isBannerVisible(now - 1000, now)).toBe(false);
    expect(isBannerVisible(now - BANNER_REOPEN_MS + 1, now)).toBe(false);
  });

  it("returns after 7 days", () => {
    expect(isBannerVisible(now - BANNER_REOPEN_MS, now)).toBe(true);
  });

  it("is visible when the stored time lies in the future", () => {
    expect(isBannerVisible(now + 1000, now)).toBe(true);
  });
});

describe("storage", () => {
  it("remembers the closing per account and reads it back", () => {
    expect(rememberClosed("u1", 123)).toBe(true);
    expect(readClosedAt("u1")).toBe(123);
    expect(readClosedAt("u2")).toBeNull();
  });

  it("keeps no personal data in the key", () => {
    rememberClosed("u1", 123);
    expect(Object.keys(window.localStorage)).toEqual(["gomoku:verify-email-banner-closed:u1"]);
  });

  it.each(["abc", "0", "-5"])("treats the garbage value %s as never closed", (value) => {
    window.localStorage.setItem("gomoku:verify-email-banner-closed:u1", value);
    expect(readClosedAt("u1")).toBeNull();
  });

  it("treats unreadable storage as never closed", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readClosedAt("u1")).toBeNull();
  });

  it("reports a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(rememberClosed("u1", 1)).toBe(false);
  });
});

describe("subscribeToBannerMemory", () => {
  it("notifies about a closing here and in another tab until unsubscribed", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToBannerMemory(onChange);

    rememberClosed("u1", 1);
    window.dispatchEvent(new Event("storage"));
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    rememberClosed("u1", 2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
