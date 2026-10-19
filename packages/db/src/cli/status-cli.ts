// Entry point of `npm run db:status` (see status.ts).
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { getDatabaseStatus } from "./status";

// The same .env files as `npm run dev` (development mode); process variables win,
// which is how the setup installer passes the exact DATABASE_URL it resolved.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true);

process.stdout.write(`${JSON.stringify(await getDatabaseStatus())}\n`);
