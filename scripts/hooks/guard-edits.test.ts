import { describe, expect, it } from "vitest";

import { checkEdit } from "./guard-edits.mjs";

const cwd = "/repo";
const migration = "/repo/packages/db/src/migrations/Migration20261101000000.ts";
const exists = () => true;
const missing = () => false;
const ignoreComment = "// v8 ignore next";

describe("migrations", () => {
  it("blocks Edit and MultiEdit of a migration", () => {
    expect(checkEdit({ toolName: "Edit", toolInput: { file_path: migration, new_string: "x" }, fileExists: exists, cwd })).toMatch(/existing migration/);
    expect(checkEdit({ toolName: "MultiEdit", toolInput: { file_path: migration, edits: [] }, fileExists: exists, cwd })).toMatch(/db:migration:create/);
  });

  it("blocks overwriting an existing migration with Write, also by relative path", () => {
    const toolInput = { file_path: "packages/db/src/migrations/Migration1.ts", content: "x" };
    expect(checkEdit({ toolName: "Write", toolInput, fileExists: exists, cwd })).toMatch(/Migration1\.ts/);
  });

  it("allows creating a new migration with Write", () => {
    expect(checkEdit({ toolName: "Write", toolInput: { file_path: migration, content: "x" }, fileExists: missing, cwd })).toBeNull();
  });

  it("ignores other files in the migrations directory and elsewhere", () => {
    for (const file_path of ["/repo/packages/db/src/migrations/.snapshot-gomoku.json", "/repo/packages/db/src/entities/Migration1.ts"]) {
      expect(checkEdit({ toolName: "Edit", toolInput: { file_path, new_string: "x" }, fileExists: exists, cwd })).toBeNull();
    }
  });
});

describe("ignore comments", () => {
  it("blocks them in Write content, Edit new_string and MultiEdit edits", () => {
    const file_path = "/repo/packages/core/src/a.ts";
    expect(checkEdit({ toolName: "Write", toolInput: { file_path, content: ignoreComment }, fileExists: missing, cwd })).toMatch(/a\.ts/);
    expect(checkEdit({ toolName: "Edit", toolInput: { file_path, new_string: "/* istanbul ignore next */" }, fileExists: exists, cwd })).toMatch(/ignore/);
    const edits = [{ new_string: "ok" }, { new_string: ignoreComment }];
    expect(checkEdit({ toolName: "MultiEdit", toolInput: { file_path, edits }, fileExists: exists, cwd })).toMatch(/ignore/);
  });

  it("allows clean content and tolerates missing fields", () => {
    const file_path = "/repo/a.ts";
    expect(checkEdit({ toolName: "Write", toolInput: { file_path, content: "const a = 1;" }, fileExists: missing, cwd })).toBeNull();
    expect(checkEdit({ toolName: "Edit", toolInput: { file_path }, fileExists: exists, cwd })).toBeNull();
    expect(checkEdit({ toolName: "MultiEdit", toolInput: { file_path }, fileExists: exists, cwd })).toBeNull();
  });

  it("names the generic target when there is no path, and defaults the input and cwd", () => {
    expect(checkEdit({ toolName: "Edit", toolInput: { new_string: ignoreComment }, fileExists: exists })).toMatch(/in code/);
    expect(checkEdit({ toolName: "Write", fileExists: missing })).toBeNull();
  });
});

it("ignores other tools", () => {
  expect(checkEdit({ toolName: "Bash", toolInput: { file_path: migration, content: ignoreComment }, fileExists: exists, cwd })).toBeNull();
});
