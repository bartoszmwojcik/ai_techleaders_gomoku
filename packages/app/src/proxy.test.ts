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
    expect(response.headers.get("location")).toBe("https://gomoku.example/show/abc?projektor=1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^gomoku_lang=fr; Path=\/; Expires=[^;]+; Max-Age=31536000; /);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it("drops lang without a cookie when the value is not supported", () => {
    for (const value of ["xx", "FR", "fr-FR", "../../x"]) {
      const response = call(`https://gomoku.example/?lang=${encodeURIComponent(value)}`);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://gomoku.example/");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("takes the first of several lang parameters and removes all of them", () => {
    const response = call("https://gomoku.example/lobby?lang=de&x=1&lang=pl");

    expect(response.headers.get("location")).toBe("https://gomoku.example/lobby?x=1");
    expect(response.headers.get("set-cookie")).toMatch(/^gomoku_lang=de;/);
  });

  it("leaves Secure out only when the session cookie is insecure too (integration tests over HTTP)", () => {
    vi.stubEnv("SESSION_COOKIE_SECURE", "false");

    expect(call("http://127.0.0.1:3000/?lang=en").headers.get("set-cookie")).not.toContain("Secure");
  });

  it("never redirects to another host", () => {
    const response = call("https://gomoku.example//evil.example/?lang=fr");

    expect(response.headers.get("location")).toBe("https://gomoku.example/evil.example/");
  });

  it("leaves lang in the admin panel alone and only sets the page's CSP there", () => {
    const response = call("https://gomoku.example/backend/users?lang=fr");

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});

describe("proxy: Content Security Policy", () => {
  // `NextResponse.next({ request: { headers } })` passes the request headers on as `x-middleware-request-*`.
  const forwarded = (response: Response, name: string) => response.headers.get(`x-middleware-request-${name}`);

  it("sends a nonce policy on a page and hands the same nonce and policy to the render", () => {
    const response = call("https://gomoku.example/login");
    const policy = response.headers.get("content-security-policy")!;
    const nonce = forwarded(response, "x-nonce")!;

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic';`);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(forwarded(response, "content-security-policy")).toBe(policy);
  });

  it("uses a new nonce for every request", () => {
    const first = forwarded(call("https://gomoku.example/"), "x-nonce");
    const second = forwarded(call("https://gomoku.example/"), "x-nonce");

    expect(first).not.toBe(second);
  });

  it("allows eval in development only, for React's error stacks", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(call("https://gomoku.example/").headers.get("content-security-policy")).toContain("'unsafe-eval'");
  });

  it("sets the policy, not a redirect, for an empty lang", () => {
    const response = call("https://gomoku.example/lobby?lang=");

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
  });
});

describe("proxy: matcher", () => {
  const matches = (url: string, headers?: Record<string, string>) =>
    unstable_doesMiddlewareMatch({ config, url, headers });
  const langRule = { config: { matcher: [config.matcher[0]!] } };
  const matchesLang = (url: string) => unstable_doesMiddlewareMatch({ ...langRule, url });

  it("runs for player pages with lang", () => {
    expect(config.matcher[0]!.has![0]!.key).toBe(LANG_QUERY_PARAM);
    expect(matches("/?lang=fr")).toBe(true);
    expect(matches("/show/abc?projektor=1&lang=fr")).toBe(true);
    expect(matches("/games/g1?lang=en")).toBe(true);
  });

  it("handles lang only on player pages: not without it, nor for the API, Next's assets, the admin panel and files", () => {
    expect(matchesLang("/")).toBe(false);
    expect(matchesLang("/lobby?language=fr")).toBe(false);
    expect(matchesLang("/api/health?lang=fr")).toBe(false);
    expect(matchesLang("/_next/static/chunk.js?lang=fr")).toBe(false);
    expect(matchesLang("/backend?lang=fr")).toBe(false);
    expect(matchesLang("/backend/users?lang=fr")).toBe(false);
    expect(matchesLang("/favicon.ico?lang=fr")).toBe(false);
  });

  it("does not handle an empty lang: Next's `has` needs a value, so the page renders as without it", () => {
    expect(matchesLang("/?lang=")).toBe(false);
    expect(matchesLang("/lobby?lang")).toBe(false);
  });

  it("runs for every page, the admin panel included, for its CSP", () => {
    for (const url of ["/", "/login", "/lobby?language=fr", "/games/g1", "/backend", "/backend/users", "/no-such-page"]) {
      expect(matches(url)).toBe(true);
    }
  });

  it("does not run for the API, Next's assets, files and prefetches", () => {
    expect(matches("/api/health")).toBe(false);
    expect(matches("/api/games/g1/qr")).toBe(false);
    expect(matches("/_next/static/chunks/a.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/login", { "next-router-prefetch": "1" })).toBe(false);
    expect(matches("/login", { purpose: "prefetch" })).toBe(false);
  });
});
