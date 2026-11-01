// Entry point of `npm run stats:games` (see ../stats/run-stats.ts). Read only.
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { runStats } from "../stats/run-stats";

// The same .env files as `npm run dev`; forceReload because @next/env caches a previous load
// for another directory (lesson 2026-10-28-next-env-root-env-not-loaded-in-dev). Process
// variables win, so `docker exec` sees the container's DATABASE_URL.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true, console, true);

process.exitCode = await runStats();
