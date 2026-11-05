// A09:2025 (T-01, T-09): failed logins and refusals leave one `security.` line each in the server log,
// and never an e-mail, a password or an address. The body limit (API4:2023) refuses an oversized POST with 413.
import { readFileSync } from "node:fs";

import { describe, expect, inject, it } from "vitest";

import { SERVER_LOG } from "./global-setup";

const baseUrl = inject("baseUrl");

let n = 0;
const address = () => `203.0.${Math.floor(++n / 250)}.${(n % 250) + 1}`;

function post(path: string, body: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": address(),
      ...headers,
    },
    body,
  });
}

const securityLines = () =>
  readFileSync(SERVER_LOG, "utf8")
    .split("\n")
    .filter((line) => line.includes('"event":"security.'));

async function waitForLine(predicate: (line: string) => boolean): Promise<string[]> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const found = securityLines().filter(predicate);
    if (found.length > 0) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

describe("security event log", () => {
  it("records repeated bad logins without the e-mail or the password", async () => {
    const email = `nobody-${Date.now().toString(36)}@example.com`;
    const password = "NieistniejaceHaslo-987";
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await post("/api/auth/login", JSON.stringify({ email, password }));
      expect(response.status).toBe(401);
    }

    const lines = await waitForLine((line) => line.includes('"event":"security.login_failed"'));

    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: "security.login_failed" });
    const log = readFileSync(SERVER_LOG, "utf8");
    expect(log).not.toContain(email);
    expect(log).not.toContain(password);
  });

  it("records a rejected cross-origin request without the foreign origin", async () => {
    const response = await post("/api/auth/login", "{}", { origin: "https://evil-origin.example" });
    expect(response.status).toBe(403);

    const lines = await waitForLine((line) => line.includes('"event":"security.csrf_rejected"'));

    expect(lines.length).toBeGreaterThan(0);
    expect(readFileSync(SERVER_LOG, "utf8")).not.toContain("evil-origin.example");
  });

  it("records the first 429 of a window, not every one, with the pool name", async () => {
    const scopeLines = () => securityLines().filter((line) => line.includes('"scope":"login:email-ip"')).length;
    const before = scopeLines();
    const from = address();
    const email = `flood-${Date.now().toString(36)}@example.com`;
    let limited = 0;
    // 10 failures per e-mail and address, the 11th on is refused (LOGIN_EMAIL_IP_LIMIT); 28 stays below the 30 per address.
    for (let attempt = 0; attempt < 28; attempt++) {
      const response = await post("/api/auth/login", JSON.stringify({ email, password: "zle-haslo-1234" }), {
        "x-forwarded-for": from,
      });
      if (response.status === 429) limited++;
    }
    expect(limited).toBe(18);

    await waitForLine(() => scopeLines() > before);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 18 refusals, but one line per window: far fewer lines than refusals (tests running in parallel may add a few of their own).
    const added = scopeLines() - before;
    expect(added).toBeGreaterThanOrEqual(1);
    expect(added).toBeLessThan(9);
    const last = securityLines().filter((line) => line.includes('"scope":"login:email-ip"')).at(-1)!;
    expect(JSON.parse(last)).toMatchObject({ event: "security.rate_limited", scope: "login:email-ip" });
    expect(readFileSync(SERVER_LOG, "utf8")).not.toContain(email);
  });
});

describe("request body limit", () => {
  it("refuses an oversized body with 413 before parsing, and still serves normal requests", async () => {
    const big = JSON.stringify({ email: "a@example.com", password: "x".repeat(70 * 1024) });

    const response = await post("/api/auth/login", big);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "PAYLOAD_TOO_LARGE" } });

    const normal = await post("/api/auth/login", JSON.stringify({ email: "a@example.com", password: "x" }));
    expect(normal.status).toBe(401);
  });

  it("refuses a body over the limit sent in chunks without a Content-Length", async () => {
    const chunk = "x".repeat(32 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('{"email":"a@example.com","password":"'));
        for (let i = 0; i < 3; i++) controller.enqueue(encoder.encode(chunk));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": address() },
      body: stream,
      duplex: "half",
    } as RequestInit);

    expect(response.status).toBe(413);
  });
});
