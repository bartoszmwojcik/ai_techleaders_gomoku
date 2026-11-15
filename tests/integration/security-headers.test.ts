// T-08: the baseline security headers of next.config.ts on a built app, and the exceptions that must keep
// winning over it (token pages: no-referrer; the QR image: its own nosniff and CSP). Completed after the Qualys scan
// of 2026-11-10 (`.ai/docs/2026-11-15-security-scan-triage.md`): HSTS, COOP, CORP, no X-Powered-By, and a CSP on
// every page (nonce from `src/proxy.ts`) and on the API and Next's assets (fixed, from next.config.ts).
import { afterAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");

const BASELINE = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};
const RESOURCE_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";
const PERMISSIONS = ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"];

function expectBaseline(response: Response, overrides: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...BASELINE, ...overrides })) {
    expect(response.headers.get(name), name).toBe(value);
  }
  const permissions = response.headers.get("permissions-policy") ?? "";
  for (const feature of PERMISSIONS) expect(permissions).toContain(feature);
  expect(response.headers.get("x-powered-by")).toBeNull();
  expect(response.headers.get("cross-origin-embedder-policy")).toBeNull();
}

/** The page's nonce, after checking the policy around it. */
function expectPagePolicy(response: Response): string {
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)?.[1];
  expect(nonce, policy).toBeDefined();
  expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic';`);
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  return nonce!;
}

describe("baseline security headers", () => {
  it("are sent on a page", async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expectBaseline(response);
  });

  it("are sent on an API response", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expectBaseline(response);
  });

  it.each(["/verify-email", "/confirm-email-change", "/reset-password"])(
    "keep Referrer-Policy: no-referrer on the token page %s",
    async (path) => {
      const response = await fetch(`${baseUrl}${path}?token=whatever`);
      expect(response.status).toBe(200);
      expectBaseline(response, { "referrer-policy": "no-referrer" });
    },
  );

  it("do not displace the own headers of the QR image", async () => {
    let n = 0;
    const call = (path: string, body: unknown, cookie?: string) =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": `198.74.0.${++n}`, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    const suffix = Date.now().toString(36);
    const registered = await call("/api/auth/register", { email: `hdr-${suffix}@example.com`, displayName: `Hdr_${suffix}`, password: "secret123" });
    expect(registered.status).toBe(201);
    const cookie = (registered.headers.get("set-cookie") ?? "").split(";")[0]!;
    const created = await call("/api/games", { isPublic: false }, cookie);
    const { data } = (await created.json()) as { data: { gameId: string } };

    const response = await fetch(`${baseUrl}/api/games/${data.gameId}/qr`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    // next.config.ts replaces the route's own `default-src 'none'; sandbox` with the API policy, which contains it.
    expect(response.headers.get("content-security-policy")).toBe(RESOURCE_CSP);
    expectBaseline(response);
  });
});

describe("Content Security Policy", () => {
  it.each(["/", "/login", "/register", "/forgot-password", "/play", "/join", "/lobby"])(
    "%s gets a fresh nonce and every script on the page carries it",
    async (path) => {
      const first = await fetch(`${baseUrl}${path}`);
      expect(first.status).toBe(200);
      const nonce = expectPagePolicy(first);
      const html = await first.text();
      const scripts = html.match(/<script\b[^>]*>/g) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const tag of scripts) expect(tag, tag).toContain(`nonce="${nonce}"`);

      const second = await fetch(`${baseUrl}${path}`);
      expect(expectPagePolicy(second)).not.toBe(nonce);
    },
  );

  it("is sent on the admin panel too (a 404 for a visitor without the admin role)", async () => {
    const response = await fetch(`${baseUrl}/backend`);
    expect(response.status).toBe(404);
    expectPagePolicy(response);
    expectBaseline(response);
  });

  it("allows nothing on API responses and Next's assets", async () => {
    for (const path of ["/api/health", "/api/no-such-route", "/_next/static/no-such-chunk.js"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.headers.get("content-security-policy"), path).toBe(RESOURCE_CSP);
      expectBaseline(response);
    }
  });
});

describe("Content Security Policy in the browser", () => {
  const browser = new Browser(`${inject("browserSession")}-csp`);
  afterAll(() => browser.close());

  it("runs the page's own scripts and blocks an injected inline handler", async () => {
    await browser.open(`${baseUrl}/login`);
    // The page hydrated: its nonce-carrying scripts ran (the theme switch is a client component).
    expect(await browser.count('[data-testid="theme-switch"]')).toBe(1);

    await browser.evaluate(`(() => {
      window.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(event.violatedDirective));
      document.body.insertAdjacentHTML("beforeend", '<img src="/no-such-image.png" onerror="window.__injected = true">');
    })()`);
    await expect.poll(() => browser.evaluate<string[]>("window.__cspViolations")).toContain("script-src-attr");
    expect(await browser.evaluate<boolean | null>("window.__injected ?? null")).toBeNull();
  });
});

describe("Cache-Control of the JSON API", () => {
  it("is private, no-store on authenticated reads and on errors", async () => {
    let n = 0;
    const headers = (cookie?: string) => ({
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": `198.75.0.${++n}`,
      ...(cookie ? { cookie } : {}),
    });
    const suffix = Date.now().toString(36);
    const registered = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email: `cc-${suffix}@example.com`, displayName: `Cc_${suffix}`, password: "secret123" }),
    });
    expect(registered.status).toBe(201);
    expect(registered.headers.get("cache-control")).toBe("private, no-store");
    const cookie = (registered.headers.get("set-cookie") ?? "").split(";")[0]!;

    for (const path of ["/api/history", "/api/lobby", "/api/games/00000000-0000-4000-8000-000000000000"]) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
      expect(response.headers.get("cache-control"), path).toBe("private, no-store");
    }
    const anonymous = await fetch(`${baseUrl}/api/history`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
  });
});
