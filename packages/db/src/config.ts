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
  return defineConfig({
    clientUrl: process.env.DATABASE_URL ?? "postgresql://gomoku:gomoku@localhost:5432/gomoku",
    pool: {
      min: intFromEnv("DATABASE_POOL_MIN", 0),
      max: intFromEnv("DATABASE_POOL_MAX", 10),
    },
    entities: [...entities],
    discovery: { warnWhenNoEntities: false },
    debug: process.env.DATABASE_DEBUG === "true",
    ...overrides,
  });
}
