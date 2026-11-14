import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { main } from "./main.mjs";

let root: string;
let out: string[];
let err: string[];
const run = (...argv: string[]) => main(argv, { root, log: (line: string) => out.push(line), error: (line: string) => err.push(line) });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-main-"));
  out = [];
  err = [];
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "r", version: "1.2.3", workspaces: [] }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": { version: "1.2.3" } } }));
  writeFileSync(join(root, "CHANGELOG.md"), "# 1.3.0 (2026-12-01)\n\n## ✨ Features\n- ✨ Nowe. (#1)\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("release cli", () => {
  it("prints the current version", () => {
    expect(run("current")).toBe(0);
    expect(out).toEqual(["1.2.3"]);
  });

  it("prints the next version for a bump and for a custom number", () => {
    expect(run("next", "minor")).toBe(0);
    expect(run("next", "custom", "4.0.0")).toBe(0);
    expect(out).toEqual(["1.3.0", "4.0.0"]);
  });

  it("prints the release notes of a version", () => {
    expect(run("notes", "1.3.0")).toBe(0);
    expect(out).toEqual(["## ✨ Features\n- ✨ Nowe. (#1)"]);
  });

  it("bumps the manifests and lists what it changed", () => {
    expect(run("bump", "1.3.0")).toBe(0);
    expect(out).toEqual(["updated package.json", "updated package-lock.json"]);
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("1.3.0");
  });

  it("reports a problem with exit code 1", () => {
    expect(run("next", "custom", "0.0.1")).toBe(1);
    expect(run("notes", "9.9.9")).toBe(1);
    expect(run("bump", "latest")).toBe(1);
    expect(run("notes")).toBe(1);
    expect(err).toHaveLength(4);
    expect(err[0]).toMatch(/lower than the current/);
  });

  it("prints the usage with exit code 2 for an unknown command", () => {
    expect(run("publish")).toBe(2);
    expect(run()).toBe(2);
    expect(err[0]).toMatch(/Usage:/);
  });
});
