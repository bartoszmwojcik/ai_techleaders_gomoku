import { describe, expect, it } from "vitest";

import { checkCompliance, names } from "./compliance.mjs";

const packages = [
  { dir: "app", name: "@gomoku/app" },
  { dir: "core", name: "@gomoku/core" },
];

const compliant = [
  { id: "gomoku", kind: "system", metadata: {} },
  { id: "gomoku.app", kind: "container", metadata: { package: "@gomoku/app" } },
  { id: "gomoku.app.core", kind: "package", metadata: { package: "@gomoku/core" } },
  { id: "gomoku.app.di", kind: "component", metadata: { di: "orm, em" } },
  { id: "gomoku.app.games", kind: "component", metadata: { di: ["gameService", "gameMoveService, colorDraw"] } },
  { id: "gomoku.app.http", kind: "component" },
  { id: "gomoku.postgres.user", kind: "entity", metadata: { entity: "User" } },
];

const facts = { packages, registrations: ["orm", "em", "gameService", "gameMoveService", "colorDraw"], entities: ["User"] };

describe("names", () => {
  it("splits comma lists, flattens arrays and drops blanks", () => {
    expect(names(undefined)).toEqual([]);
    expect(names(" a, b ,, ")).toEqual(["a", "b"]);
    expect(names(["a", "b, c"])).toEqual(["a", "b", "c"]);
  });
});

describe("checkCompliance", () => {
  it("is clean when every fact has exactly one element and every element points at a fact", () => {
    expect(checkCompliance({ elements: compliant, ...facts })).toEqual([]);
  });

  it("names a registration, an entity and a package missing from the model, and where to add them", () => {
    const problems = checkCompliance({
      elements: compliant,
      packages: [...packages, { dir: "db", name: "@gomoku/db" }],
      registrations: [...facts.registrations, "fooService"],
      entities: ["User", "Game"],
    });
    expect(problems).toEqual([
      'packages/: pakiet "@gomoku/db" nie jest przypisany do żadnego elementu — dopisz go do metadata.package w docs/architektura/model.c4.',
      'packages/app/src/server/container.ts: rejestracja "fooService" nie jest przypisana do żadnego elementu — dopisz ją do metadata.di w docs/architektura/model.c4.',
      'packages/db/src/entities/index.ts: encja "Game" nie jest przypisana do żadnego elementu — dopisz ją do metadata.entity w docs/architektura/data.c4.',
    ]);
  });

  it("rejects model metadata that points at nothing in the code", () => {
    const problems = checkCompliance({
      elements: [
        ...compliant,
        { id: "gomoku.app.ghost", kind: "component", metadata: { di: "ghostService" } },
        { id: "gomoku.app.old", kind: "package", metadata: { package: "@gomoku/old" } },
        { id: "gomoku.postgres.move", kind: "entity", metadata: { entity: "Move" } },
      ],
      ...facts,
    });
    expect(problems).toEqual([
      'model: metadata.package "@gomoku/old" w gomoku.app.old nie istnieje w packages/ — usuń ją albo popraw nazwę.',
      'model: metadata.di "ghostService" w gomoku.app.ghost nie istnieje w packages/app/src/server/container.ts — usuń ją albo popraw nazwę.',
      'model: metadata.entity "Move" w gomoku.postgres.move nie istnieje w packages/db/src/entities/index.ts — usuń ją albo popraw nazwę.',
    ]);
  });

  it("rejects a fact assigned to several elements", () => {
    const problems = checkCompliance({
      elements: [...compliant, { id: "gomoku.app.other", kind: "component", metadata: { di: "orm" } }],
      ...facts,
    });
    expect(problems).toEqual(['model: rejestracja "orm" jest przypisana do kilku elementów (gomoku.app.di, gomoku.app.other) — zostaw ją w jednym.']);
  });

  it("rejects metadata on the wrong kind and package or entity elements without their metadata", () => {
    const problems = checkCompliance({
      elements: [
        { id: "gomoku.app", kind: "container", metadata: { package: "@gomoku/app" } },
        { id: "gomoku.app.core", kind: "component", metadata: { package: "@gomoku/core", di: "orm, em, gameService, gameMoveService, colorDraw" } },
        { id: "gomoku.app.ui", kind: "package", metadata: {} },
        { id: "gomoku.postgres.user", kind: "container", metadata: { entity: "User" } },
        { id: "gomoku.postgres.loose", kind: "entity" },
      ],
      ...facts,
    });
    expect(problems).toEqual([
      'model: element "gomoku.app.core" (rodzaj component) ma metadata.package — dozwolone tylko dla: package, container.',
      'model: element "gomoku.app.ui" (rodzaj package) nie ma metadata.package.',
      'model: element "gomoku.postgres.user" (rodzaj container) ma metadata.entity — dozwolone tylko dla: entity.',
      'model: element "gomoku.postgres.loose" (rodzaj entity) nie ma metadata.entity.',
    ]);
  });
});
