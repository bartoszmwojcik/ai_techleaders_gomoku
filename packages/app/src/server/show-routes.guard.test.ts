// Guard (show-mode B1, B3, "Security"): every entry point of the show - the pages `app/(frontend)/show/**` and the
// routes `app/api/show/**` - calls the administrator's gate, so a new page or route cannot ship without it. A page,
// a layout and a server action call `requireAdmin()`; a route handler passes `gate: requireAdminApi` to `apiHandler`
// (the gate runs before CSRF and the route, so anybody else gets the 404 of a missing game).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "app");
const PAGES = join(APP, "(frontend)", "show");
const ROUTES = join(APP, "api", "show");

const entries = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? entries(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const isTest = (name: string) => /\.test\.tsx?$/.test(name);
const isRoute = (name: string) => /(^|\/)route\.ts$/.test(name);
const isAction = (text: string) => /^\s*["']use server["']/m.test(text);
const isPage = (name: string) => /(^|\/)(page|layout)\.tsx?$/.test(name);

/** Entry points (relative names) that do not call the gate their kind needs. */
export function findUnguarded(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name]) => /\.(ts|tsx)$/.test(name) && !isTest(name))
    .filter(([name, text]) => {
      const code = stripComments(text);
      if (isRoute(name)) {
        // Every handler of the file: the number of `apiHandler(` equals the number of gates passed to it, and every
        // exported HTTP method has its own gated handler (a bare `export async function DELETE` would bypass it).
        const handlers = code.match(/\bapiHandler\(/g)?.length ?? 0;
        const gates = code.match(/\bgate:\s*requireAdminApi\b/g)?.length ?? 0;
        const methods = code.match(/\bexport\s+(?:async\s+)?(?:function\s+|const\s+)(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)?.length ?? 0;
        return handlers === 0 || gates !== handlers || methods > gates;
      }
      if (isPage(name) || isAction(text)) return !/\brequireAdmin\(\)/.test(code);
      return false;
    })
    .map(([name]) => name);
}

const read = (root: string) => Object.fromEntries(entries(root).map((file) => [relative(APP, file), readFileSync(file, "utf8")]));

describe("the findUnguarded helper", () => {
  it("fails an entry point without its gate and ignores a mention in a comment", () => {
    expect(findUnguarded({ "show/page.tsx": "export default function Page() {}" })).toEqual(["show/page.tsx"]);
    expect(findUnguarded({ "show/page.tsx": "// requireAdmin()\n/* requireAdmin() */ export default 1" })).toEqual(["show/page.tsx"]);
    expect(findUnguarded({ "show/layout.tsx": "await requireAdminApi();" })).toEqual(["show/layout.tsx"]);
    expect(findUnguarded({ "show/actions.ts": '"use server"\nexport async function go() {}' })).toEqual(["show/actions.ts"]);
    expect(findUnguarded({ "api/show/route.ts": "export async function GET() {}" })).toEqual(["api/show/route.ts"]);
    expect(findUnguarded({ "api/show/route.ts": "const a = apiHandler(async () => x);" })).toEqual(["api/show/route.ts"]);
    // Two handlers in one file need two gates (lesson 2026-10-31: the guard counts statements, not files).
    expect(
      findUnguarded({ "api/show/route.ts": "apiHandler(f, { gate: requireAdminApi }); apiHandler(g);" }),
    ).toEqual(["api/show/route.ts"]);
    expect(findUnguarded({ "api/show/route.ts": "apiHandler(f, { gate: requireAdmin });" })).toEqual(["api/show/route.ts"]);
    // A second method exported without its own gated handler (review of #304).
    expect(
      findUnguarded({
        "api/show/route.ts":
          "const a = apiHandler(f, { gate: requireAdminApi });\nexport async function GET(r) { return a(r); }\nexport async function DELETE() { return new Response(); }",
      }),
    ).toEqual(["api/show/route.ts"]);
  });

  it("accepts guarded entry points and skips other files", () => {
    expect(
      findUnguarded({
        "show/page.tsx": "await requireAdmin();",
        "api/show/route.ts": "apiHandler(f, { gate: requireAdminApi }); apiHandler(g, {\n  gate: requireAdminApi,\n});",
        "show/show-room.tsx": "export function ShowRoom() {}",
        "show/page.test.tsx": "x",
      }),
    ).toEqual([]);
  });
});

describe("the show's pages and routes", () => {
  const files = { ...read(PAGES), ...read(ROUTES) };

  it("finds the entry points", () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        join("(frontend)", "show", "page.tsx"),
        join("(frontend)", "show", "[gameId]", "page.tsx"),
        join("api", "show", "route.ts"),
        join("api", "show", "preflight", "route.ts"),
        join("api", "show", "[id]", "route.ts"),
        join("api", "show", "[id]", "end", "route.ts"),
      ]),
    );
  });

  it("calls the administrator's gate in every page, layout, route handler and server action", () => {
    expect(findUnguarded(files)).toEqual([]);
  });
});
