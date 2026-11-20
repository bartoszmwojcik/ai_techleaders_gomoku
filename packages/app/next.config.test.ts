import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadEnvConfig } = vi.hoisted(() => ({ loadEnvConfig: vi.fn() }));
vi.mock("@next/env", () => ({ loadEnvConfig }));

const monorepoRoot = resolve(import.meta.dirname, "../..");

beforeEach(() => {
  vi.resetModules();
  loadEnvConfig.mockReset();
});

describe("next.config", () => {
  it("loads the development .env files from the monorepo root outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await import("./next.config");

    expect(loadEnvConfig).toHaveBeenCalledWith(monorepoRoot, true, console, true);
  });

  it("loads the production .env files in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await import("./next.config");

    expect(loadEnvConfig).toHaveBeenCalledWith(monorepoRoot, false, console, true);
  });

  it("keeps MikroORM v7 out of the server bundle", async () => {
    const { default: config } = await import("./next.config");

    expect(config.serverExternalPackages).toEqual([
      "@mikro-orm/core",
      "@mikro-orm/sql",
      "@mikro-orm/postgresql",
      "kysely",
    ]);
  });

  it("builds with Next's defaults unless a low-memory build asks for less", async () => {
    const { default: config } = await import("./next.config");

    // Only the app-wide localized 404 (issue 328) is switched on.
    expect(config.experimental).toEqual({ globalNotFound: true });
    expect(config.typescript).toEqual({ ignoreBuildErrors: false });
  });

  it("limits the build workers and leaves type checking to a separate step in a low-memory build", async () => {
    vi.stubEnv("NEXT_BUILD_CPUS", "1");
    vi.stubEnv("NEXT_SKIP_TYPECHECK", "1");
    const { default: config } = await import("./next.config");

    expect(config.experimental).toEqual({ globalNotFound: true, cpus: 1 });
    expect(config.typescript).toEqual({ ignoreBuildErrors: true });
  });

  it("ignores a NEXT_BUILD_CPUS that is not a positive integer", async () => {
    vi.stubEnv("NEXT_BUILD_CPUS", "many");
    const { default: config } = await import("./next.config");

    expect(config.experimental).toEqual({ globalNotFound: true });
  });

  it("sends the baseline security headers on every path", async () => {
    const { default: config } = await import("./next.config");
    const rules = (await config.headers?.()) ?? [];
    const baseline = rules.find((rule) => rule.source === "/:path*");
    const headers = Object.fromEntries((baseline?.headers ?? []).map(({ key, value }) => [key, value]));

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe(
      "accelerometer=(), bluetooth=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), serial=(), usb=()",
    );
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    // Pages get their policy (with a nonce) from the proxy; a second one here would be enforced on top of it.
    expect(Object.keys(headers)).not.toContain("Content-Security-Policy");
    expect(Object.keys(headers)).not.toContain("Cross-Origin-Embedder-Policy");
  });

  it("does not announce the framework in X-Powered-By", async () => {
    const { default: config } = await import("./next.config");

    expect(config.poweredByHeader).toBe(false);
  });

  it("sends a policy that allows nothing on the API and Next's assets, which are never pages", async () => {
    const { default: config } = await import("./next.config");
    const rules = (await config.headers?.()) ?? [];

    for (const source of ["/api/:path*", "/_next/:path*"]) {
      expect(rules.find((rule) => rule.source === source)?.headers).toEqual([
        {
          key: "Content-Security-Policy",
          value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox",
        },
      ]);
    }
  });

  it("sends Referrer-Policy: no-referrer on /verify-email, /confirm-email-change and /reset-password, where the token is in the URL, after the baseline so it wins", async () => {
    const { default: config } = await import("./next.config");
    const rules = (await config.headers?.()) ?? [];

    expect(rules.map((rule) => rule.source)).toEqual([
      "/:path*",
      "/api/:path*",
      "/_next/:path*",
      "/verify-email",
      "/confirm-email-change",
      "/reset-password",
    ]);
    for (const rule of rules.slice(3)) {
      expect(rule.headers).toEqual([{ key: "Referrer-Policy", value: "no-referrer" }]);
    }
  });
});
