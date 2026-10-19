// Configuration for the MikroORM CLI (migrations). Not imported by the app.
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { createOrmConfig } from "./config";
import { migrationsConfig } from "./migrations-config";

// Same .env files as the Next.js app: they live in the monorepo root.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../.."));

export default createOrmConfig(migrationsConfig);
