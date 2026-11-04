// Guard (T-03): every route handler under /api/games/[id] resolves who is asking (`resolveParticipant` or
// `resolveSpectator`) before it touches the game, so that a new route cannot ship without an ownership check.
// A route that really needs no check goes to ALLOWLIST with the reason.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "app", "api", "games", "[id]");

/** Route files (relative name) -> why they need no participant/spectator check. */
const ALLOWLIST: Record<string, string> = {};

const entries = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? entries(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Route handlers (relative names) that call neither resolver and are not allowlisted. */
export function findUnguarded(files: Record<string, string>, allowlist: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name]) => /(^|\/)route\.ts$/.test(name) && !(name in allowlist))
    .filter(([, text]) => !/\bresolve(Participant|Spectator)\(/.test(stripComments(text)))
    .map(([name]) => name);
}

describe("the findUnguarded helper", () => {
  it("fails a route without a resolver and ignores a mention in a comment", () => {
    expect(findUnguarded({ "a/route.ts": "export async function GET() {}" }, {})).toEqual(["a/route.ts"]);
    expect(findUnguarded({ "a/route.ts": "// resolveParticipant(x)\n/* resolveSpectator(x) */" }, {})).toEqual(["a/route.ts"]);
  });

  it("accepts either resolver, an allowlisted route and non-route files", () => {
    expect(
      findUnguarded(
        { "a/route.ts": "await resolveParticipant(r)", "b/route.ts": "await resolveSpectator(r)", "c/route.ts": "x", "d/helper.ts": "x", "e/route.test.ts": "x" },
        { "c/route.ts": "reason" },
      ),
    ).toEqual([]);
  });
});

describe("the /api/games/[id] routes", () => {
  const files = Object.fromEntries(entries(ROOT).map((file) => [relative(ROOT, file), readFileSync(file, "utf8")]));

  it("finds the route handlers", () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["route.ts", "moves/route.ts", "qr/route.ts"]));
  });

  it("resolves the participant or the spectator in every one of them", () => {
    expect(findUnguarded(files, ALLOWLIST)).toEqual([]);
  });

  it("keeps the allowlist to routes that exist", () => {
    expect(Object.keys(ALLOWLIST).filter((name) => !(name in files))).toEqual([]);
  });
});
