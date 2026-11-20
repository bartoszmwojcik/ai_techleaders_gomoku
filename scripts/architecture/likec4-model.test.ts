import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { importLikeC4From, loadModel } from "./likec4-model.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function toolDir() {
  const dir = mkdtempSync(join(tmpdir(), "likec4-tool-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "tool", private: true, type: "module" }));
  return dir;
}

function fakeLikeC4({ diagnostics = [] as unknown[], elements = [] as unknown[] } = {}) {
  const dispose = vi.fn(async () => {});
  const fromWorkspace = vi.fn(async () => ({
    getErrors: () => diagnostics,
    computedModel: async () => ({ elements: () => elements.values() }),
    dispose,
  }));
  return { module: { LikeC4: { fromWorkspace } }, fromWorkspace, dispose };
}

describe("importLikeC4From", () => {
  it("tells how to install the tooling package when likec4 is missing", async () => {
    const dir = toolDir();
    await expect(importLikeC4From(dir)).rejects.toThrow(`Brak pakietu likec4 w ${dir} — uruchom \`npm ci --prefix docs/architektura\`.`);
  });

  it("imports likec4 from the tooling package's node_modules", async () => {
    const dir = toolDir();
    const pkg = join(dir, "node_modules", "likec4");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "likec4", type: "module", exports: { ".": { default: "./index.mjs" } } }));
    writeFileSync(join(pkg, "index.mjs"), "export const LikeC4 = 'fake';\n");
    await expect(importLikeC4From(dir)).resolves.toMatchObject({ LikeC4: "fake" });
  });
});

describe("loadModel", () => {
  it("returns the elements with their metadata and no errors for a valid model, then disposes it", async () => {
    const fake = fakeLikeC4({
      elements: [
        { id: "gomoku", kind: "system", getMetadata: () => ({}) },
        { id: "gomoku.app.games", kind: "component", getMetadata: () => ({ di: "gameService" }) },
      ],
    });
    const snapshot = await loadModel({ workspace: "/repo/docs/architektura", importLikeC4: async () => fake.module });
    expect(snapshot).toEqual({
      errors: [],
      elements: [
        { id: "gomoku", kind: "system", metadata: {} },
        { id: "gomoku.app.games", kind: "component", metadata: { di: "gameService" } },
      ],
    });
    expect(fake.fromWorkspace).toHaveBeenCalledWith("/repo/docs/architektura", { printErrors: false, logger: false });
    expect(fake.dispose).toHaveBeenCalledOnce();
  });

  it("formats diagnostics with a workspace-relative, 1-based location", async () => {
    const fake = fakeLikeC4({
      diagnostics: [
        { message: "Could not resolve reference", sourceFsPath: "/repo/docs/architektura/model.c4", range: { start: { line: 4, character: 2 } } },
        { message: "Duplicate view", sourceFsPath: "/repo/docs/architektura/views.c4" },
        { message: "Invalid project" },
      ],
    });
    const { errors } = await loadModel({ workspace: "/repo/docs/architektura", importLikeC4: async () => fake.module });
    expect(errors).toEqual(["model.c4:5:3 Could not resolve reference", "views.c4 Duplicate view", "(model) Invalid project"]);
  });

  it("disposes the workspace even when the model cannot be computed", async () => {
    const dispose = vi.fn(async () => {});
    const module = {
      LikeC4: {
        fromWorkspace: async () => ({
          getErrors: () => [],
          computedModel: async () => {
            throw new Error("boom");
          },
          dispose,
        }),
      },
    };
    await expect(loadModel({ workspace: "/w", importLikeC4: async () => module })).rejects.toThrow("boom");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("imports likec4 from the workspace by default", async () => {
    const dir = toolDir();
    await expect(loadModel({ workspace: dir })).rejects.toThrow("npm ci --prefix docs/architektura");
  });
});
