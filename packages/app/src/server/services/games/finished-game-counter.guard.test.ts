// Guard (E06-S03): every production file that moves a game to `finished` in SQL must call
// `recordFinishedGame`, otherwise the durable counter silently misses that path. A new way of
// finishing a game fails here until it records the game (or this guard is consciously extended).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

type SourceFile = { path: string; content: string };

// `update games set ... status = 'finished'` (the `where` clause may mention the status too).
const FINISHES_A_GAME = /update\s+games\s+set(?:(?!\bwhere\b)[^`;])*?status\s*=\s*'finished'/is;
const RECORDS_IT = /\brecordFinishedGame\(/g;

const countOf = (pattern: RegExp, content: string) =>
  content.match(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))?.length ?? 0;

// A file needs a `recordFinishedGame(` call for every finishing statement: a second statement
// added next to a recorded one is caught too (a single call per file would hide it).
export function findUnrecordedFinishers(files: readonly SourceFile[]): string[] {
  return files
    .filter(({ content }) => countOf(FINISHES_A_GAME, content) > countOf(RECORDS_IT, content))
    .map(({ path }) => path);
}

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const SKIPPED_DIRS = new Set(["node_modules", ".next", "migrations", "coverage"]);

function sourceFiles(dir: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    if (!/\.(ts|tsx|mjs|js)$/.test(entry.name) || /\.test\.|\.d\.ts$/.test(entry.name)) return [];
    return [{ path: relative(ROOT, path), content: readFileSync(path, "utf8") }];
  });
}

describe("finished-game counter guard", () => {
  it("flags a file that finishes a game without recording it", () => {
    const sql = "`update games set stones_black = ?, status = 'finished' where id = ? and status = 'active'`";
    expect(findUnrecordedFinishers([{ path: "a.ts", content: sql }])).toEqual(["a.ts"]);
    expect(
      findUnrecordedFinishers([{ path: "b.ts", content: `${sql}; await recordFinishedGame(tx, id);` }]),
    ).toEqual([]);
  });

  it("flags a file with more finishing statements than recordings", () => {
    const sql = "`update games set status = 'finished' where id = ? and status = 'active'`";
    const record = "await recordFinishedGame(tx, id);";
    const content = `${sql}; ${record}\n${sql.replace("games set", "games set winner_seat = 1,")}; ${record}`;
    expect(findUnrecordedFinishers([{ path: "d.ts", content }])).toEqual([]);
    expect(findUnrecordedFinishers([{ path: "d.ts", content: `${content}\n${sql}` }])).toEqual(["d.ts"]);
  });

  it("does not flag reads and updates of other columns of a finished game", () => {
    const reads = [
      "select 1 from games where status = 'finished'",
      "update games set rematch_state = 'x' where id = ? and status = 'finished'",
    ].join(";\n");
    expect(findUnrecordedFinishers([{ path: "c.ts", content: reads }])).toEqual([]);
  });

  it("finds the finishing statements of the repository (so the guard cannot go blind)", () => {
    const files = [
      ...["app", "db", "core"].flatMap((name) => sourceFiles(join(ROOT, "packages", name, "src"))),
      ...sourceFiles(join(ROOT, "scripts")),
    ];
    const finishers = files.filter(({ content }) => FINISHES_A_GAME.test(content)).map(({ path }) => path);
    expect(finishers.sort()).toEqual([
      "packages/app/src/server/services/games/game-move-service.ts",
      "packages/app/src/server/services/games/timeout-settler.ts",
    ]);
    expect(findUnrecordedFinishers(files)).toEqual([]);
  });
});
