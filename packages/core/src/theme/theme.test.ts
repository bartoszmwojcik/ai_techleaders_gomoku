import { describe, expect, it } from "vitest";

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  parseTheme,
  themeCookie,
  themeInitScript,
} from "./theme";

describe("parseTheme", () => {
  it("accepts exactly dark and light", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it.each(["", "Dark", "LIGHT", " light", "system", undefined, null, 1, {}])(
    "rejects %j",
    (value) => {
      expect(parseTheme(value)).toBeNull();
    },
  );
});

describe("themeCookie", () => {
  it("encodes the cookie for one year, site-wide, SameSite=Lax", () => {
    expect(themeCookie("light", { secure: false })).toBe(
      `gomoku_theme=light; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`,
    );
    expect(THEME_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
  });

  it("adds Secure over HTTPS", () => {
    expect(themeCookie("dark", { secure: true })).toBe(
      `${THEME_COOKIE}=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  });
});

describe("themeInitScript", () => {
  function run({
    cookie,
    prefersLight,
    matchMediaThrows = false,
  }: {
    cookie: string;
    prefersLight?: boolean;
    matchMediaThrows?: boolean;
  }) {
    const attributes: Record<string, string> = {};
    const document = {
      cookie,
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    };
    const window = {
      matchMedia: (query: string) => {
        if (matchMediaThrows) throw new Error("no matchMedia");
        return {
          matches:
            query === "(prefers-color-scheme: light)" && Boolean(prefersLight),
        };
      },
    };
    new Function("document", "window", themeInitScript)(document, window);
    return attributes;
  }

  it("lets a valid cookie win over the system preference", () => {
    expect(run({ cookie: "gomoku_theme=dark", prefersLight: true })).toEqual({
      "data-theme": "dark",
    });
    expect(
      run({ cookie: "a=b; gomoku_theme=light; c=d", prefersLight: false }),
    ).toEqual({
      "data-theme": "light",
    });
  });

  it("uses a light system preference without a cookie", () => {
    expect(run({ cookie: "", prefersLight: true })).toEqual({
      "data-theme": "light",
    });
  });

  it("leaves the default dark theme when the system is not light", () => {
    expect(run({ cookie: "other=1", prefersLight: false })).toEqual({});
  });

  it("ignores an invalid cookie value and falls back to the system", () => {
    expect(run({ cookie: "gomoku_theme=blue", prefersLight: true })).toEqual({
      "data-theme": "light",
    });
    expect(run({ cookie: "xgomoku_theme=dark", prefersLight: false })).toEqual(
      {},
    );
  });

  it("does nothing when matchMedia throws", () => {
    expect(run({ cookie: "", matchMediaThrows: true })).toEqual({});
  });
});
