// The docs name it unstable_doesProxyMatch; Next 16.4 still exports it under the middleware name.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { LANG_QUERY_PARAM } from "@gomoku/core/i18n/locales";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { config, proxy } from "./proxy";

function call(url: string) {
  return proxy(new NextRequest(url));
}

describe("proxy: ?lang=", () => {
  it("stores a supported language and redirects 307 to the same address without lang, keeping the rest", () => {
    const response = call("https://gomoku.example/show/abc?lang=fr&projektor=1");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/show/abc?projektor=1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^gomoku_lang=fr; Path=\/; Expires=[^;]+; Max-Age=31536000; /);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("drops lang without a cookie when the value is not supported", () => {
    for (const value of ["xx", "FR", "fr-FR", "", "../../x"]) {
      const response = call(`https://gomoku.example/?lang=${encodeURIComponent(value)}`);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("/");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("takes the first of several lang parameters and removes all of them", () => {
    const response = call("https://gomoku.example/lobby?lang=de&x=1&lang=pl");

    expect(response.headers.get("location")).toBe("/lobby?x=1");
    expect(response.headers.get("set-cookie")).toMatch(/^gomoku_lang=de;/);
  });

  it("leaves Secure out only when the session cookie is insecure too (integration tests over HTTP)", () => {
    vi.stubEnv("SESSION_COOKIE_SECURE", "false");

    expect(call("http://127.0.0.1:3000/?lang=en").headers.get("set-cookie")).not.toContain("Secure");
  });

  it("never redirects to another host", () => {
    const response = call("https://gomoku.example//evil.example/?lang=fr");

    expect(response.headers.get("location")).toBe("/evil.example/");
  });
});

describe("proxy: matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("runs for player pages with lang", () => {
    expect(config.matcher[0]!.has[0]!.key).toBe(LANG_QUERY_PARAM);
    expect(matches("/?lang=fr")).toBe(true);
    expect(matches("/show/abc?projektor=1&lang=fr")).toBe(true);
    expect(matches("/games/g1?lang=en")).toBe(true);
  });

  it("does not run without lang, nor for the API, Next's assets, the admin panel and files", () => {
    expect(matches("/")).toBe(false);
    expect(matches("/lobby?language=fr")).toBe(false);
    expect(matches("/api/health?lang=fr")).toBe(false);
    expect(matches("/_next/static/chunk.js?lang=fr")).toBe(false);
    expect(matches("/backend?lang=fr")).toBe(false);
    expect(matches("/backend/users?lang=fr")).toBe(false);
    expect(matches("/favicon.ico?lang=fr")).toBe(false);
  });
});
