// Entry point of `npm run db:cleanup` (see ../cleanup/run-cleanup.ts).
import { resolve } from "node:path";

import { normalizeEmail } from "@gomoku/core";
import nextEnv from "@next/env";

import { runCleanup } from "../cleanup/run-cleanup";

// The same .env files as `npm run dev`; forceReload because @next/env caches a previous
// load for another directory (lesson 2026-10-28-next-env-root-env-not-loaded-in-dev).
// Process variables win, so `docker exec` sees the container's DATABASE_URL.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true, console, true);

// The installation administrator's account is never swept (E08-S01); the value is only a
// protected address here, so an unset or odd ADMIN_EMAIL simply protects nothing.
const adminEmail = process.env.ADMIN_EMAIL?.trim();

process.exitCode = await runCleanup({ protectedEmail: adminEmail ? normalizeEmail(adminEmail) : undefined });
