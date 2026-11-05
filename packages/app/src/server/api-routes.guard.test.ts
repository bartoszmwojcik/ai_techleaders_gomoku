// Guard (API9:2023): every route handler under /api answers through `apiHandler` (CSRF for state-changing
// methods, the one error envelope, `Cache-Control: private, no-store`), so that a new route cannot ship
// without them. A route that really differs goes to ALLOWLIST with the reason.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "app", "api");

/** Route files (relative name) -> why they do not use `apiHandler`. */
const ALLOWLIST: Record<string, string> = {
  "health/route.ts":
    "Liveness probe for Docker/CI: a plain GET with its own tiny body, no session, no CSRF; reports no infrastructure details.",
  "mcp/route.ts":
    "MCP transport (JSON-RPC, not the REST envelope): its own Origin check, per-address limit, 8 KB body limit and error shape (`handleMcpPost`).",
};

const entries = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? entries(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Route handlers (relative names) that do not call `apiHandler(` and are not allowlisted. */
export function findWithoutApiHandler(files: Record<string, string>, allowlist: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name]) => /(^|\/)route\.ts$/.test(name) && !(name in allowlist))
    .filter(([, text]) => !/\bapiHandler\(/.test(stripComments(text)))
    .map(([name]) => name);
}

describe("the findWithoutApiHandler helper", () => {
  it("fails a route without apiHandler and ignores a mention in a comment", () => {
    expect(findWithoutApiHandler({ "a/route.ts": "export async function GET() {}" }, {})).toEqual(["a/route.ts"]);
    expect(findWithoutApiHandler({ "a/route.ts": "// apiHandler(x)\n/* apiHandler(y) */" }, {})).toEqual(["a/route.ts"]);
  });

  it("accepts apiHandler, an allowlisted route and non-route files", () => {
    expect(
      findWithoutApiHandler(
        { "a/route.ts": "const x = apiHandler(async () => {})", "b/route.ts": "x", "c/helper.ts": "x", "d/route.test.ts": "x" },
        { "b/route.ts": "reason" },
      ),
    ).toEqual([]);
  });
});

describe("the /api routes", () => {
  const files = Object.fromEntries(entries(ROOT).map((file) => [relative(ROOT, file), readFileSync(file, "utf8")]));

  it("finds the route handlers", () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["health/route.ts", "mcp/route.ts", "auth/login/route.ts"]));
  });

  it("all use apiHandler except the allowlisted ones", () => {
    expect(findWithoutApiHandler(files, ALLOWLIST)).toEqual([]);
  });

  it("keeps a reason for every allowlisted route and no stale entries", () => {
    for (const [name, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length).toBeGreaterThan(10);
      expect(Object.keys(files)).toContain(name);
    }
  });
});
