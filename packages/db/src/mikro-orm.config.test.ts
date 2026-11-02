import { resolve } from "node:path";

import { Migrator } from "@mikro-orm/migrations";
import { afterEach, describe, expect, it, vi } from "vitest";

const { loadEnvConfig } = vi.hoisted(() => ({ loadEnvConfig: vi.fn() }));
vi.mock("@next/env", () => ({ default: { loadEnvConfig } }));

const packageRoot = resolve(import.meta.dirname, "..");

describe("MikroORM CLI configuration", () => {
  afterEach(() => {
    loadEnvConfig.mockClear();
    vi.resetModules();
  });

  it("loads the .env files from the monorepo root and configures migrations", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { default: config } = await import("./mikro-orm.config");

    expect(loadEnvConfig).toHaveBeenCalledWith(
      resolve(packageRoot, "../.."),
      true,
    );
    expect(config.extensions).toEqual([Migrator]);
    expect(config.migrations).toEqual({
      path: resolve(packageRoot, "src/migrations"),
      glob: "!(*.d).{js,ts}",
      emit: "ts",
      transactional: true,
      allOrNothing: true,
    });
  });

  it("loads the production .env files when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await import("./mikro-orm.config");

    expect(loadEnvConfig).toHaveBeenCalledWith(
      resolve(packageRoot, "../.."),
      false,
    );
  });
});
