import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bumpVersion, workspaceDirs } from "./bump.mjs";

let root: string;
const write = (path: string, value: unknown) => {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
};
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

function repo(version: string, lockVersion = version) {
  write("package.json", { name: "root", version, workspaces: ["packages/*", "tools"] });
  write("packages/a/package.json", { name: "@x/a", version, dependencies: { "@x/b": "*" } });
  write("packages/b/package.json", { name: "@x/b", version });
  write("tools/package.json", { name: "tools", version });
  writeFileSync(join(root, "packages", "README.md"), "not a package\n");
  write("package-lock.json", {
    lockfileVersion: 3,
    packages: {
      "": { name: "root", version: lockVersion },
      "packages/a": { name: "@x/a", version: lockVersion },
      "packages/b": { name: "@x/b", version: lockVersion },
      tools: { name: "tools", version: lockVersion },
      "node_modules/left-pad": { version: "1.0.0" },
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "release-bump-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("workspaceDirs", () => {
  it("expands dir/* to its sub-directories (not files) and keeps plain entries", () => {
    repo("1.0.0");
    expect(workspaceDirs(root)).toEqual(["packages/a", "packages/b", "tools"]);
  });
});

describe("bumpVersion", () => {
  it("writes the version into every manifest and the lockfile, leaving the rest untouched", () => {
    repo("1.0.0");
    expect(bumpVersion(root, "1.1.0")).toEqual([
      "package.json",
      "packages/a/package.json",
      "packages/b/package.json",
      "tools/package.json",
      "package-lock.json",
    ]);
    for (const path of ["package.json", "packages/a/package.json", "packages/b/package.json", "tools/package.json"]) {
      expect(read(path).version).toBe("1.1.0");
    }
    expect(read("packages/a/package.json").dependencies).toEqual({ "@x/b": "*" });
    const lock = read("package-lock.json");
    expect(["", "packages/a", "packages/b", "tools"].map((key) => lock.packages[key].version)).toEqual(["1.1.0", "1.1.0", "1.1.0", "1.1.0"]);
    expect(lock.packages["node_modules/left-pad"].version).toBe("1.0.0");
    expect(readFileSync(join(root, "package.json"), "utf8").endsWith("}\n")).toBe(true);
  });

  it("changes nothing when everything already carries the version", () => {
    repo("1.0.0");
    expect(bumpVersion(root, "1.0.0")).toEqual([]);
  });

  it("brings only the lockfile along when the manifests are already at the version", () => {
    repo("1.0.0", "0.9.0");
    expect(bumpVersion(root, "1.0.0")).toEqual(["package-lock.json"]);
    expect(read("package-lock.json").packages["tools"].version).toBe("1.0.0");
  });

  it("leaves the lockfile alone when only the manifests differ", () => {
    repo("0.9.0", "1.0.0");
    expect(bumpVersion(root, "1.0.0")).toHaveLength(4);
  });

  it("fails when the lockfile lacks a workspace entry", () => {
    repo("1.0.0");
    write("package-lock.json", { lockfileVersion: 3, packages: { "": { version: "1.0.0" } } });
    expect(() => bumpVersion(root, "1.1.0")).toThrow(/no entry for "packages\/a"/);
  });
});
