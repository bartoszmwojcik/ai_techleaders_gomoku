// Entry point of `npm run db:cleanup` (see ../cleanup/run-cleanup.ts).
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { runCleanup } from "../cleanup/run-cleanup";

// The same .env files as `npm run dev`; forceReload because @next/env caches a previous
// load for another directory (lesson 2026-10-28-next-env-root-env-not-loaded-in-dev).
// Process variables win, so `docker exec` sees the container's DATABASE_URL.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true, console, true);

process.exitCode = await runCleanup();
