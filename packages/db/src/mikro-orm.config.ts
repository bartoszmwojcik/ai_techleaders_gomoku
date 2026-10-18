// Configuration for the MikroORM CLI (migrations). Not imported by the app.
import { resolve } from "node:path";

import { Migrator } from "@mikro-orm/migrations";
import nextEnv from "@next/env";

import { createOrmConfig } from "./config";

const packageRoot = resolve(import.meta.dirname, "..");

// Same .env files as the Next.js app: they live in the monorepo root.
nextEnv.loadEnvConfig(resolve(packageRoot, "../.."));

export default createOrmConfig({
  extensions: [Migrator],
  migrations: {
    path: resolve(packageRoot, "src/migrations"),
    glob: "!(*.d).{js,ts}",
    emit: "ts",
    transactional: true,
    allOrNothing: true,
  },
});
