// Issue 328: an address that matches no route gets our localized 404 (`app/global-not-found.tsx`), rendered per request,
// so every script carries the proxy's nonce and the page loads without a Content Security Policy violation. Next's
// default 404 was prerendered at build time, without a nonce, and the policy blocked its scripts.
import { resolve } from "node:path";

import { afterAll, describe, expect, inject, it } from "vitest";

import { Browser } from "./browser";

const baseUrl = inject("baseUrl");
const MISSING = "/nie-ma-takiej-strony";

function nonceOf(response: Response): string {
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(policy)?.[1];
  expect(nonce, policy).toBeDefined();
  return nonce!;
}

describe("global 404 over HTTP", () => {
  it("answers 404 with a fresh nonce on every script", async () => {
    const first = await fetch(`${baseUrl}${MISSING}`);
    expect(first.status).toBe(404);
    const nonce = nonceOf(first);
    const html = await first.text();
    expect(html).toContain('<html lang="pl"');
    expect(html).toContain("Nie ma takiej strony");
    expect(html).toContain('<meta name="robots" content="noindex"/>');
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, tag).toContain(`nonce="${nonce}"`);

    const second = await fetch(`${baseUrl}${MISSING}`);
    expect(nonceOf(second)).not.toBe(nonce);
  });

  it("speaks the language of the cookie", async () => {
    const response = await fetch(`${baseUrl}/no/such/page`, { headers: { cookie: "gomoku_lang=en" } });
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("Page not found");
  });
});

describe("global 404 in the browser", () => {
  const browser = new Browser(`${inject("browserSession")}-404`, {
    initScript: resolve(import.meta.dirname, "fixtures/record-csp-violations.js"),
  });
  afterAll(() => browser.close());

  it("hydrates without a CSP violation and leads home", async () => {
    await browser.open(`${baseUrl}${MISSING}`);
    expect(await browser.count('[data-testid="global-not-found"]')).toBe(1);
    // The theme switch is a client component: it is there once the nonce-carrying scripts ran.
    expect(await browser.count('[data-testid="theme-switch"]')).toBe(1);
    expect(await browser.evaluate<string[]>("window.__loadCspViolations")).toEqual([]);
    expect(await browser.count('[data-testid="global-not-found"] a[href="/"]')).toBe(1);
  });
});
