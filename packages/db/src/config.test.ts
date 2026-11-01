import { describe, expect, it, vi } from "vitest";

import { createOrmConfig } from "./config";
import { entities } from "./entities";

describe("createOrmConfig", () => {
  it("falls back to the local development database and default pool", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("DATABASE_POOL_MIN", undefined);
    vi.stubEnv("DATABASE_POOL_MAX", "");
    vi.stubEnv("DATABASE_DEBUG", undefined);

    expect(createOrmConfig()).toMatchObject({
      clientUrl: "postgresql://gomoku:gomoku@localhost:5432/gomoku",
      pool: { min: 0, max: 10 },
      entities: [...entities],
      discovery: { warnWhenNoEntities: false },
      debug: false,
      ensureDatabase: false,
    });
  });

  it("reads the connection, pool and debug settings from the environment", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@db:5433/app");
    vi.stubEnv("DATABASE_POOL_MIN", "2");
    vi.stubEnv("DATABASE_POOL_MAX", "20");
    vi.stubEnv("DATABASE_DEBUG", "true");

    expect(createOrmConfig()).toMatchObject({
      clientUrl: "postgresql://user:secret@db:5433/app",
      pool: { min: 2, max: 20 },
      debug: true,
    });
  });

  it("refuses query logging in production, where it would print the text of chat messages", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_DEBUG", "true");
    expect(() => createOrmConfig()).toThrow("DATABASE_DEBUG=true is not allowed in production");

    vi.stubEnv("DATABASE_DEBUG", "false");
    expect(createOrmConfig()).toMatchObject({ debug: false });
  });

  it("rejects a pool size that is not an integer", () => {
    vi.stubEnv("DATABASE_POOL_MAX", "many");

    expect(() => createOrmConfig()).toThrow('DATABASE_POOL_MAX must be an integer, got "many"');
  });

  it("lets callers override any option", () => {
    expect(createOrmConfig({ debug: true, dbName: "other", ensureDatabase: true })).toMatchObject({
      debug: true,
      dbName: "other",
      ensureDatabase: true,
    });
  });
});
