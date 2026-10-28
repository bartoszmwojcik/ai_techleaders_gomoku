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

  it("sends Referrer-Policy: no-referrer on /verify-email and /reset-password, where the token is in the URL", async () => {
    const { default: config } = await import("./next.config");

    expect(await config.headers?.()).toEqual([
      {
        source: "/verify-email",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ]);
  });
});
