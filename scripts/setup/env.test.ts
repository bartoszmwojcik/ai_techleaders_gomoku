import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadEnvConfig } from "@next/env";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOrmConfig } from "../../packages/db/src/config";
import { DEFAULT_DATABASE_URL, DEFAULT_SOURCE, maskSecrets, resolveDatabaseTarget } from "./env.mjs";

type LoadEnvConfig = typeof loadEnvConfig;

/** A fake @next/env returning the given files (in precedence order). */
function filesLoader(files: Record<string, Record<string, string>>) {
  return vi.fn(() => ({
    loadedEnvFiles: Object.entries(files).map(([path, env]) => ({ path, env, contents: "" })),
  })) as unknown as LoadEnvConfig;
}

describe("resolveDatabaseTarget", () => {
  it("takes the first file that defines DATABASE_URL, in @next/env development order", () => {
    const env: NodeJS.ProcessEnv = {};
    const loader = filesLoader({ ".env.local": { DATABASE_URL: "postgresql://a" }, ".env": { DATABASE_URL: "postgresql://b" } });

    expect(resolveDatabaseTarget({ root: "/repo", env, loadEnvConfig: loader })).toEqual({
      url: "postgresql://a",
      source: ".env.local",
    });
    expect(loader).toHaveBeenCalledWith("/repo", true, expect.anything(), true);
    expect(env).toEqual({});
  });

  it("silences the @next/env log output", () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const loader = vi.fn((_root: string, _dev: boolean, logger: { info: (m: string) => void; error: (m: string) => void }) => {
      logger.info("Loaded env from .env.local");
      logger.error("Failed to load env from .env");
      return { loadedEnvFiles: [] };
    }) as unknown as LoadEnvConfig;

    resolveDatabaseTarget({ root: "/r", env: {}, loadEnvConfig: loader });

    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("falls back to the default of packages/db/src/config.ts", () => {
    const target = resolveDatabaseTarget({ root: "/repo", env: {}, loadEnvConfig: filesLoader({ ".env": { OTHER: "1" } }) });

    expect(target).toEqual({ url: DEFAULT_DATABASE_URL, source: DEFAULT_SOURCE });
  });

  it("accepts a process value equal to the files", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "postgresql://a" };

    const target = resolveDatabaseTarget({ root: "/r", env, loadEnvConfig: filesLoader({ ".env.local": { DATABASE_URL: "postgresql://a" } }) });

    expect(target).toEqual({ url: "postgresql://a", source: "zmienna środowiskowa, zgodna z .env.local" });
    expect(env.DATABASE_URL).toBe("postgresql://a");
  });

  it("reports a conflict when the process environment points elsewhere, and restores it", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "postgresql://sandbox/open-mercato" };
    const loader = vi.fn(() => {
      // While the files are read, the process value is hidden and the mode is development.
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.NODE_ENV).toBe("development");
      return { loadedEnvFiles: [] };
    }) as unknown as LoadEnvConfig;

    expect(resolveDatabaseTarget({ root: "/r", env, loadEnvConfig: loader })).toEqual({
      url: "postgresql://sandbox/open-mercato",
      source: "zmienna środowiskowa",
      conflict: { url: DEFAULT_DATABASE_URL, source: DEFAULT_SOURCE },
    });
    expect(env).toEqual({ DATABASE_URL: "postgresql://sandbox/open-mercato" });
  });

  it("restores NODE_ENV", () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };

    resolveDatabaseTarget({ root: "/r", env, loadEnvConfig: filesLoader({}) });

    expect(env).toEqual({ NODE_ENV: "test" });
  });

  it("restores the environment even when loading fails", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "postgresql://x" };
    const loader = vi.fn(() => {
      throw new Error("unreadable .env");
    }) as unknown as LoadEnvConfig;

    expect(() => resolveDatabaseTarget({ root: "/r", env, loadEnvConfig: loader })).toThrow("unreadable .env");
    expect(env.DATABASE_URL).toBe("postgresql://x");
  });

  describe("with the real @next/env", () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it("prefers .env.development.local, then .env.local, over .env — even under NODE_ENV=test", () => {
      vi.stubEnv("DATABASE_URL", undefined);
      vi.stubEnv("NODE_ENV", "test");
      dir = mkdtempSync(join(tmpdir(), "gomoku-setup-"));
      writeFileSync(join(dir, ".env"), "DATABASE_URL=postgresql://from-env\n");
      writeFileSync(join(dir, ".env.local"), "DATABASE_URL=postgresql://from-local\n");

      expect(resolveDatabaseTarget({ root: dir, env: process.env, loadEnvConfig })).toEqual({
        url: "postgresql://from-local",
        source: ".env.local",
      });

      writeFileSync(join(dir, ".env.development.local"), "DATABASE_URL=postgresql://from-dev-local\n");
      expect(resolveDatabaseTarget({ root: dir, env: process.env, loadEnvConfig }).url).toBe("postgresql://from-dev-local");
    });
  });
});

describe("DEFAULT_DATABASE_URL", () => {
  it("matches the fallback of packages/db/src/config.ts", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(createOrmConfig().clientUrl).toBe(DEFAULT_DATABASE_URL);
  });
});

describe("maskSecrets", () => {
  it("hides passwords in connection URLs", () => {
    expect(maskSecrets("postgresql://gomoku:gomoku@localhost:5432/gomoku")).toBe("postgresql://gomoku:***@localhost:5432/gomoku");
    expect(maskSecrets("postgresql://localhost/gomoku")).toBe("postgresql://localhost/gomoku");
  });
});
