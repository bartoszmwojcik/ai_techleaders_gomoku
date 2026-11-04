// T-08: the baseline security headers of next.config.ts on a built app, and the exceptions that must keep
// winning over it (token pages: no-referrer; the QR image: its own nosniff and CSP).
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

const BASELINE = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};
const PERMISSIONS = ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()"];

function expectBaseline(response: Response, overrides: Record<string, string> = {}) {
  for (const [name, value] of Object.entries({ ...BASELINE, ...overrides })) {
    expect(response.headers.get(name), name).toBe(value);
  }
  const permissions = response.headers.get("permissions-policy") ?? "";
  for (const feature of PERMISSIONS) expect(permissions).toContain(feature);
  expect(response.headers.get("strict-transport-security")).toBeNull();
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
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expectBaseline(response);
  });
});
