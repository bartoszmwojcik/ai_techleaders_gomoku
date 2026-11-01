import { defineConfig, type Options } from "@mikro-orm/postgresql";

import { entities } from "./entities";

export type OrmConfig = Options;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

/**
 * Base ORM configuration shared by the application runtime and the CLI.
 * Connection and pool settings come from the environment.
 */
export function createOrmConfig(overrides: Partial<OrmConfig> = {}): OrmConfig {
  const debug = process.env.DATABASE_DEBUG === "true";
  // Query logging prints the bound parameters, i.e. the text of every chat message (BR-34): never in production.
  if (debug && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_DEBUG=true is not allowed in production: it logs query parameters.");
  }
  return defineConfig({
    clientUrl: process.env.DATABASE_URL ?? "postgresql://gomoku:gomoku@localhost:5432/gomoku",
    pool: {
      min: intFromEnv("DATABASE_POOL_MIN", 0),
      max: intFromEnv("DATABASE_POOL_MAX", 10),
    },
    entities: [...entities],
    discovery: { warnWhenNoEntities: false },
    debug,
    // MikroORM 7 defaults to true and would run CREATE DATABASE on the first connection
    // when DATABASE_URL names a missing database (a typo gives a new, empty database
    // instead of an error). Databases come from compose.yaml / Testcontainers; note the
    // Migrator (migration CLI) still calls ensureDatabase() and will create a missing one.
    ensureDatabase: false,
    ...overrides,
  });
}
