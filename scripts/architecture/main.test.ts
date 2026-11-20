import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "./main.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function root({ installed = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "arch-main-"));
  dirs.push(dir);
  mkdirSync(join(dir, "docs/architektura", installed ? "node_modules/likec4" : ""), { recursive: true });
  return dir;
}

const facts = { packages: [{ dir: "app", name: "@gomoku/app" }], registrations: ["orm"], entities: ["User"], problems: [] as string[] };
const elements = [
  { id: "gomoku.app", kind: "container", metadata: { package: "@gomoku/app" } },
  { id: "gomoku.app.di", kind: "component", metadata: { di: "orm" } },
  { id: "gomoku.postgres.user", kind: "entity", metadata: { entity: "User" } },
];

function run(argv: string[], { dir = root(), model = { errors: [] as string[], elements }, codeFacts = facts } = {}) {
  const deps = {
    root: dir,
    loadModel: vi.fn(async () => model),
    readCodeFacts: vi.fn(() => codeFacts),
    log: vi.fn(),
    error: vi.fn(),
  };
  return main(argv, deps).then((code) => ({ code, ...deps }));
}

describe("main", () => {
  it("prints usage for an unknown command", async () => {
    const { code, error } = await run(["nope"]);
    expect(code).toBe(2);
    expect(error).toHaveBeenCalledWith("Usage: cli.mjs check|ensure");
  });

  it.each(["check", "ensure"])("%s tells how to install the tooling package when it is missing", async (command) => {
    const { code, error, loadModel } = await run([command], { dir: root({ installed: false }) });
    expect(code).toBe(2);
    expect(error).toHaveBeenCalledWith("Brak pakietu likec4 w docs/architektura — uruchom `npm ci --prefix docs/architektura`.");
    expect(loadModel).not.toHaveBeenCalled();
  });

  it("ensure passes when the tooling package is installed", async () => {
    const { code, loadModel } = await run(["ensure"]);
    expect(code).toBe(0);
    expect(loadModel).not.toHaveBeenCalled();
  });

  it("check passes for a compliant model and summarizes what it compared", async () => {
    const dir = root();
    const { code, log, error, loadModel, readCodeFacts } = await run(["check"], { dir });
    expect(code).toBe(0);
    expect(loadModel).toHaveBeenCalledWith({ workspace: join(dir, "docs/architektura") });
    expect(readCodeFacts).toHaveBeenCalledWith(dir);
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Model architektury jest zgodny z kodem (pakiety: 1, rejestracje DI: 1, encje: 1).");
  });

  it("check fails on compliance problems", async () => {
    const { code, error } = await run(["check"], { codeFacts: { ...facts, registrations: ["orm", "fooService"] } });
    expect(code).toBe(1);
    expect(error.mock.calls).toEqual([
      ['packages/app/src/server/container.ts: rejestracja "fooService" nie jest przypisana do żadnego elementu — dopisz ją do metadata.di w docs/architektura/model.c4.'],
      ["Model architektury nie zgadza się z kodem (1). Podgląd: npm run docs:arch."],
    ]);
  });

  it("check reports model errors and unparsed code, without compliance noise", async () => {
    const { code, error } = await run(["check"], {
      model: { errors: ["model.c4:3:1 Could not resolve reference"], elements: [] },
      codeFacts: { ...facts, problems: ["container.ts: brak wywołań register({...})"] },
    });
    expect(code).toBe(1);
    expect(error.mock.calls).toEqual([
      ["docs/architektura/model.c4:3:1 Could not resolve reference"],
      ["container.ts: brak wywołań register({...})"],
      ["Model architektury nie zgadza się z kodem (2). Podgląd: npm run docs:arch."],
    ]);
  });
});
