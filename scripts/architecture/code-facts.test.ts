import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CONTAINER_FILE, ENTITIES_FILE, entityNames, readCodeFacts, readPackages, registrationKeys } from "./code-facts.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "arch-facts-"));
  dirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("registrationKeys", () => {
  it("collects the keys of every register({...}) call, shorthand and quoted keys included", () => {
    const source = `
      const container = createAppContainer();
      container.register({ orm: asValue(orm), "gameService": asClass(GameService).scoped(), clock });
      export function scoped() { scope.register({ em: asValue(em) }); }
      other.call({ notThis: 1 });
    `;
    expect(registrationKeys(source)).toEqual({ keys: ["orm", "gameService", "clock", "em"], problems: [] });
  });

  it("reports shapes it does not recognize instead of skipping them", () => {
    const source = `container.register({ ...shared, [dynamic]: asValue(1), ok: asValue(2) });\ncontainer.register(registrations);\ncontainer.register();`;
    expect(registrationKeys(source, "c.ts")).toEqual({
      keys: ["ok"],
      problems: [
        "c.ts:1: nierozpoznana rejestracja (spread albo klucz wyliczany) — zapisz ją jako zwykłą właściwość.",
        "c.ts:1: nierozpoznana rejestracja (spread albo klucz wyliczany) — zapisz ją jako zwykłą właściwość.",
        "c.ts:2: register() bez literału obiektu — test zgodności nie rozpozna rejestracji, zapisz je jako register({ nazwa: … }).",
        "c.ts:3: register() bez literału obiektu — test zgodności nie rozpozna rejestracji, zapisz je jako register({ nazwa: … }).",
      ],
    });
  });

  it("reports a file without any register() call", () => {
    expect(registrationKeys("export const x = 1;")).toEqual({
      keys: [],
      problems: [`${CONTAINER_FILE}: brak wywołań register({...}) — test zgodności nie znalazł rejestracji DI.`],
    });
  });
});

describe("entityNames", () => {
  it("reads the identifiers of the entities array, through `as const`, `satisfies` and parentheses", () => {
    expect(entityNames("export const entities = [User, Session] as const;")).toEqual({ names: ["User", "Session"], problems: [] });
    expect(entityNames("export const entities = ([Game] satisfies unknown[]);")).toEqual({ names: ["Game"], problems: [] });
  });

  it("reports an array element or an initializer it does not recognize", () => {
    expect(entityNames("export const entities = [User, ...more, other.Game];", "e.ts")).toEqual({
      names: ["User"],
      problems: [
        "e.ts:1: nierozpoznany element tablicy `entities` — wpisz samą nazwę encji.",
        "e.ts:1: nierozpoznany element tablicy `entities` — wpisz samą nazwę encji.",
      ],
    });
    expect(entityNames("export const entities = load();\nlet entities;", "e.ts").problems).toEqual([
      "e.ts:1: `entities` nie jest literałem tablicy — test zgodności nie rozpozna encji.",
      "e.ts:2: `entities` nie jest literałem tablicy — test zgodności nie rozpozna encji.",
    ]);
  });

  it("reports a file without the entities array, ignoring other declarations", () => {
    expect(entityNames("const [a] = [1]; export const others = [User];")).toEqual({
      names: [],
      problems: [`${ENTITIES_FILE}: brak tablicy \`entities\`.`],
    });
  });
});

describe("readCodeFacts", () => {
  it("reads the packages, registrations and entities of a repository", () => {
    const root = repo({
      "packages/app/package.json": JSON.stringify({ name: "@gomoku/app" }),
      "packages/core/package.json": JSON.stringify({ name: "@gomoku/core" }),
      "packages/db/package.json": JSON.stringify({ name: "@gomoku/db" }),
      "packages/README.md": "not a package",
      [CONTAINER_FILE]: "container.register({ orm: asValue(orm), spread: x, ...rest });",
      [ENTITIES_FILE]: "export const entities = [User] as const;",
    });
    const packages = [
      { dir: "app", name: "@gomoku/app" },
      { dir: "core", name: "@gomoku/core" },
      { dir: "db", name: "@gomoku/db" },
    ];
    expect(readPackages(root)).toEqual(packages);
    expect(readCodeFacts(root)).toEqual({
      packages,
      registrations: ["orm", "spread"],
      entities: ["User"],
      problems: [`${CONTAINER_FILE}:1: nierozpoznana rejestracja (spread albo klucz wyliczany) — zapisz ją jako zwykłą właściwość.`],
    });
  });

  it("reads the real repository: the model check depends on these shapes", () => {
    const facts = readCodeFacts(process.cwd());
    expect(facts.problems).toEqual([]);
    expect(facts.packages.map((pkg) => pkg.name)).toContain("@gomoku/app");
    expect(facts.registrations).toEqual(expect.arrayContaining(["orm", "em", "gameMoveService"]));
    expect(facts.entities).toEqual(expect.arrayContaining(["User", "Game"]));
  });
});
