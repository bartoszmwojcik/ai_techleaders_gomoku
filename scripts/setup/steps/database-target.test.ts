import { describe, expect, it, vi } from "vitest";

import { fakeContext } from "../test-helpers";
import { databaseTarget } from "./database-target.mjs";

function contextWith(env: NodeJS.ProcessEnv, files: Record<string, string>, dbFromEnv = false) {
  const loadEnvConfig = vi.fn(() => ({
    loadedEnvFiles: Object.entries(files).map(([path, url]) => ({ path, contents: "", env: { DATABASE_URL: url } })),
  }));
  return fakeContext({ env, options: { dbFromEnv }, deps: { loadNextEnv: vi.fn().mockResolvedValue({ loadEnvConfig }) } }).ctx;
}

describe("database-target step", () => {
  it("prints the masked target and its source and stores it for the next steps", async () => {
    const ctx = contextWith({}, { ".env.local": "postgresql://gomoku:pw@localhost:5432/gomoku" });

    await expect(databaseTarget.run(ctx)).resolves.toEqual({
      status: "info",
      detail: "postgresql://gomoku:***@localhost:5432/gomoku (.env.local)",
    });
    expect(ctx.state.databaseUrl).toBe("postgresql://gomoku:pw@localhost:5432/gomoku");
  });

  it("refuses a different DATABASE_URL from the environment without --db-from-env", async () => {
    const ctx = contextWith({ DATABASE_URL: "postgresql://u:x@sandbox:5432/open-mercato" }, { ".env.local": "postgresql://gomoku:pw@localhost:5432/gomoku" });

    const result = await databaseTarget.run(ctx);

    expect(result).toMatchObject({
      status: "failed",
      detail:
        "DATABASE_URL z otoczenia (postgresql://u:***@sandbox:5432/open-mercato) różni się od .env.local (postgresql://gomoku:***@localhost:5432/gomoku)",
    });
    expect(result.hint).toContain("npm run setup -- --db-from-env");
    expect(ctx.state.databaseUrl).toBeUndefined();
  });

  it("uses the environment value when --db-from-env confirms it", async () => {
    const ctx = contextWith({ DATABASE_URL: "postgresql://u:x@sandbox:5432/db" }, {}, true);

    await expect(databaseTarget.run(ctx)).resolves.toEqual({
      status: "info",
      detail: "postgresql://u:***@sandbox:5432/db (zmienna środowiskowa, --db-from-env)",
    });
    expect(ctx.state.databaseUrl).toBe("postgresql://u:x@sandbox:5432/db");
  });
});
