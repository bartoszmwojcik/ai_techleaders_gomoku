import { resolve } from "node:path";

import { Migrator } from "@mikro-orm/migrations";

import type { OrmConfig } from "./config";

/** Migration settings shared by the MikroORM CLI and `npm run db:status`. */
export const migrationsConfig = {
  extensions: [Migrator],
  migrations: {
    path: resolve(import.meta.dirname, "migrations"),
    glob: "!(*.d).{js,ts}",
    emit: "ts",
    transactional: true,
    allOrNothing: true,
  },
} satisfies Partial<OrmConfig>;
