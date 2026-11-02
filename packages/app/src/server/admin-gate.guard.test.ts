// Guard (E08-S02, BR-37): every entry point of the `(backend)` group calls `requireAdmin()`, and the
// panel stays read only - no route handler and no server action may appear in it without a decision.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "app", "(backend)");

const entries = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? entries(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const isEntryPoint = (name: string, text: string) =>
  /\.(ts|tsx)$/.test(name) &&
  !/\.test\.tsx?$/.test(name) &&
  (/(^|\/)(page|layout|route)\.tsx?$/.test(name) || /^\s*["']use server["']/m.test(text));

/** Entry points (relative names) whose code does not call `requireAdmin()`. */
export function findUnguarded(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name, text]) => isEntryPoint(name, text))
    .filter(([, text]) => !/\brequireAdmin\(\)/.test(stripComments(text)))
    .map(([name]) => name);
}

/** Files that change data: route handlers and server actions. */
export function findWriters(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name, text]) => /(^|\/)route\.tsx?$/.test(name) || /^\s*["']use server["']/m.test(text))
    .map(([name]) => name);
}

describe("the findUnguarded helper", () => {
  it("fails a page without the call and ignores a mention in a comment", () => {
    expect(findUnguarded({ "backend/page.tsx": "export default function Page() {}" })).toEqual(["backend/page.tsx"]);
    expect(findUnguarded({ "a/page.tsx": "// requireAdmin()\n/* requireAdmin() */ export default 1" })).toEqual(["a/page.tsx"]);
    expect(findUnguarded({ "a/route.ts": "export async function GET() {}" })).toEqual(["a/route.ts"]);
    expect(findUnguarded({ "a/actions.ts": '"use server"\nexport async function go() {}' })).toEqual(["a/actions.ts"]);
  });

  it("accepts guarded entry points and skips other files", () => {
    expect(findUnguarded({ "a/page.tsx": "await requireAdmin();", "a/labels.ts": "export const x = 1", "a/page.test.tsx": "x" })).toEqual([]);
  });
});

describe("the (backend) route group", () => {
  const files = Object.fromEntries(entries(ROOT).map((file) => [relative(ROOT, file), readFileSync(file, "utf8")]));

  it("finds the panel entry points", () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["layout.tsx", "backend/page.tsx"]));
  });

  it("calls requireAdmin() in every page, layout, route handler and server action", () => {
    expect(findUnguarded(files)).toEqual([]);
  });

  it("is read only: no route handler and no server action", () => {
    expect(findWriters({ "a/route.ts": "x", "b/c.ts": '"use server"', "d/page.tsx": "x" })).toEqual(["a/route.ts", "b/c.ts"]);
    expect(findWriters(files)).toEqual([]);
  });
});
