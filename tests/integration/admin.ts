// Installation administrator of the integration environment (E08): ADMIN_EMAIL of `next start`
// (global-setup.ts) and the real `npm run admin:create` against the Testcontainers database.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { inject } from "vitest";

export const ADMIN_EMAIL = "admin@gomoku.test";

const repoRoot = resolve(import.meta.dirname, "../..");

/** The real command; the password goes through stdin. Only the Testcontainers database, never another. */
export function adminCreate(password: string, args: string[]) {
  const child = promisify(execFile)("npm", ["run", "-s", "admin:create", "--", ...args], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: inject("databaseUrl"), ADMIN_EMAIL, PASSWORD_HASH_COST: "4" },
  });
  child.child.stdin?.end(`${password}\n`);
  return child;
}
