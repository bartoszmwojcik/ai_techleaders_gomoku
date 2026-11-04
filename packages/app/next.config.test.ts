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

    expect(config.experimental).toBeUndefined();
    expect(config.typescript).toEqual({ ignoreBuildErrors: false });
  });

  it("limits the build workers and leaves type checking to a separate step in a low-memory build", async () => {
    vi.stubEnv("NEXT_BUILD_CPUS", "1");
    vi.stubEnv("NEXT_SKIP_TYPECHECK", "1");
    const { default: config } = await import("./next.config");

    expect(config.experimental).toEqual({ cpus: 1 });
    expect(config.typescript).toEqual({ ignoreBuildErrors: true });
  });

  it("ignores a NEXT_BUILD_CPUS that is not a positive integer", async () => {
    vi.stubEnv("NEXT_BUILD_CPUS", "many");
    const { default: config } = await import("./next.config");

    expect(config.experimental).toBeUndefined();
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
    expect(Object.keys(headers)).not.toContain("Strict-Transport-Security");
    expect(Object.keys(headers)).not.toContain("Content-Security-Policy");
  });

  it("sends Referrer-Policy: no-referrer on /verify-email, /confirm-email-change and /reset-password, where the token is in the URL, after the baseline so it wins", async () => {
    const { default: config } = await import("./next.config");
    const rules = (await config.headers?.()) ?? [];

    expect(rules.map((rule) => rule.source)).toEqual([
      "/:path*",
      "/verify-email",
      "/confirm-email-change",
      "/reset-password",
    ]);
    for (const rule of rules.slice(1)) {
      expect(rule.headers).toEqual([{ key: "Referrer-Policy", value: "no-referrer" }]);
    }
  });
});
