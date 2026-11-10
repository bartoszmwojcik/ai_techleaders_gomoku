import { describe, expect, it } from "vitest";

import {
  ACCEPT_LANGUAGE_MAX_ENTRIES,
  DEFAULT_LOCALE,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE_SECONDS,
  LOCALE_NAMES,
  LOCALES,
  SWITCHER_LOCALES,
  fallbackChain,
  isLocale,
  langCookieAttributes,
  langSwitchHref,
  parseAcceptLanguage,
  resolveLocale,
} from "./locales";

describe("locales", () => {
  it("lists Polish first as the default, with German hidden from the switch", () => {
    expect(LOCALES).toEqual(["pl", "en", "fr", "de"]);
    expect(DEFAULT_LOCALE).toBe("pl");
    expect(SWITCHER_LOCALES).toEqual(["pl", "en", "fr"]);
    expect(LOCALE_NAMES).toEqual({ pl: "Polski", en: "English", fr: "Français", de: "Deutsch" });
    expect(LANG_COOKIE).toBe("gomoku_lang");
    expect(LANG_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
  });

  it.each([
    ["pl", true],
    ["fr", true],
    ["de", true],
    ["PL", false],
    ["fr-FR", false],
    ["", false],
    ["../../x", false],
    [undefined, false],
    [null, false],
    [1, false],
  ])("isLocale(%j) is %s", (value, expected) => {
    expect(isLocale(value)).toBe(expected);
  });

  it("falls back through English to Polish", () => {
    expect(fallbackChain("pl")).toEqual(["pl"]);
    expect(fallbackChain("en")).toEqual(["en", "pl"]);
    expect(fallbackChain("fr")).toEqual(["fr", "en", "pl"]);
    expect(fallbackChain("de")).toEqual(["de", "en", "pl"]);
  });
});

describe("parseAcceptLanguage", () => {
  it.each([
    [undefined, []],
    [null, []],
    ["", []],
    ["fr-CA,fr;q=0.9,en;q=0.8", ["fr", "en"]],
    ["pl-PL", ["pl"]],
    ["en-US,en;q=0.9", ["en"]],
    ["zh-CN,zh;q=0.9", []],
    ["*", []],
    ["*;q=0.5,de", ["de"]],
    ["en;q=0.5, fr;q=0.8, pl", ["pl", "fr", "en"]],
    ["en;q=0.5,fr;q=0.5", ["en", "fr"]],
    ["fr;q=0,en", ["en"]],
    ["fr;q=1.0,en;q=0.999", ["fr", "en"]],
    ["fr;q=2,en", ["en"]],
    ["fr;q=abc,en", ["en"]],
    ["fr;q=0.1234,en", ["en"]],
    ["FR-ca", ["fr"]],
    [" de ; q=0.7 , pl ; q=0.6 ", ["de", "pl"]],
    ["fr;level=1,en", ["en"]],
  ])("%j → %j", (header, expected) => {
    expect(parseAcceptLanguage(header)).toEqual(expected);
  });

  it("reads at most 256 characters", () => {
    const filler = `${"x".repeat(250)},`;
    expect(parseAcceptLanguage(`${filler}fr`)).toEqual(["fr"]);
    expect(parseAcceptLanguage(`${filler}xxxxx,fr`)).toEqual([]);
  });

  it("reads at most 20 entries", () => {
    const unknown = Array.from({ length: ACCEPT_LANGUAGE_MAX_ENTRIES - 1 }, () => "zz");
    expect(parseAcceptLanguage([...unknown, "fr"].join(","))).toEqual(["fr"]);
    expect(parseAcceptLanguage([...unknown, "zz", "fr"].join(","))).toEqual([]);
  });
});

describe("resolveLocale", () => {
  it("prefers a valid cookie over the browser's languages", () => {
    expect(resolveLocale({ cookie: "en", acceptLanguage: "fr" })).toBe("en");
  });

  it.each(["../../x", "PL", "", undefined, null])("ignores the cookie %j and asks the browser", (cookie) => {
    expect(resolveLocale({ cookie, acceptLanguage: "fr-CA,fr;q=0.9" })).toBe("fr");
  });

  it("falls back to Polish without a supported language", () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: "zh-CN" })).toBe("pl");
    expect(resolveLocale({ cookie: null, acceptLanguage: null })).toBe("pl");
  });
});

describe("langCookieAttributes", () => {
  it("keeps only the code for a year, unreadable by scripts, Secure on request", () => {
    expect(langCookieAttributes({ secure: true })).toEqual({
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
      httpOnly: true,
      secure: true,
    });
    expect(langCookieAttributes({ secure: false }).secure).toBe(false);
  });
});

describe("langSwitchHref", () => {
  it("keeps the path and the other parameters and sets lang once", () => {
    expect(langSwitchHref("/show/abc", "?projektor=1", "fr")).toBe("/show/abc?projektor=1&lang=fr");
    expect(langSwitchHref("/", "", "en")).toBe("/?lang=en");
    expect(langSwitchHref("/lobby", "lang=de&lang=pl&x=1", "pl")).toBe("/lobby?x=1&lang=pl");
  });
});
