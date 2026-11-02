// Entry point of `npm run admin:create` (see ./admin-create.ts).
import { resolve } from "node:path";

import nextEnv from "@next/env";

import { runAdminCreate } from "./admin-create";
import { createPrompter } from "./terminal-input";

// The same .env files as `npm run dev`; forceReload because @next/env caches a previous load for
// another directory (lesson 2026-10-28-next-env-root-env-not-loaded-in-dev). Process variables
// win, so `docker exec` sees the container's DATABASE_URL and ADMIN_EMAIL.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../../../.."), true, console, true);

process.exitCode = await runAdminCreate({
  env: process.env,
  argv: process.argv.slice(2),
  prompter: createPrompter(process.stdin, process.stderr),
  stdout: process.stdout,
  stderr: process.stderr,
});
