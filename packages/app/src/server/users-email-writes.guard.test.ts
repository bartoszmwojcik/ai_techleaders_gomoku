// Guard (E08-S01, Q8): the installation administrator's e-mail must never change through the app
// (the role follows `ADMIN_EMAIL`, BR-35). Today nothing writes `users.email` except the places on the
// list below; a new path has to be added to the list on purpose and handle the administrator rule
// (refuse or re-check `isInstallationAdmin`). A heuristic: it may raise a false alarm, so lifting it is cheap.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");
const ALLOWED = ["server/services/auth/user-service.ts", "server/services/auth/admin-account-service.ts"];

const WRITE_PATTERNS = [
  /update\s+users\s+set[^`"';]*\bemail\s*=/i,
  /nativeUpdate\(\s*User\s*,[^)]*\{[^}]*\bemail\s*:/s,
  /\buser\.email\s*=[^=]/,
  /\bassign\(\s*user\s*,\s*\{[^}]*\bemail\s*:/s,
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Files (relative to `src`) whose text writes `users.email`, minus the allowed ones. */
export function findEmailWrites(files: Record<string, string>, allowed: readonly string[]): string[] {
  return Object.entries(files)
    .filter(([name]) => !allowed.includes(name))
    .filter(([, text]) => WRITE_PATTERNS.some((pattern) => pattern.test(text)))
    .map(([name]) => name);
}

describe("writes to users.email", () => {
  it("find the forbidden shapes", () => {
    expect(findEmailWrites({ "a.ts": "update users set email = ? where id = ?" }, [])).toEqual(["a.ts"]);
    expect(findEmailWrites({ "a.ts": "update users set password_hash = ?, email = ?" }, [])).toEqual(["a.ts"]);
    expect(findEmailWrites({ "a.ts": "tx.nativeUpdate(User, { id }, { email: next })" }, [])).toEqual(["a.ts"]);
    expect(findEmailWrites({ "a.ts": "user.email = next;" }, [])).toEqual(["a.ts"]);
    expect(findEmailWrites({ "a.ts": "em.assign(user, { email: next })" }, [])).toEqual(["a.ts"]);
  });

  it("ignore reads, other columns and allowed files", () => {
    expect(findEmailWrites({ "a.ts": "if (user.email === x) {} update users set password_hash = ?" }, [])).toEqual([]);
    expect(findEmailWrites({ "a.ts": "update users set email = ?" }, ["a.ts"])).toEqual([]);
  });

  it("are absent from the application source apart from the allowed files", () => {
    const files = Object.fromEntries(sources(SRC).map((path) => [relative(SRC, path), readFileSync(path, "utf8")]));
    expect(Object.keys(files).length).toBeGreaterThan(100);
    expect(findEmailWrites(files, ALLOWED)).toEqual([]);
  });
});
