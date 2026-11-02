// Migration `public_games` (E10-S01-T01) on a real PostgreSQL, in a scratch database of the test
// container: `up` adds `games.is_public` (NOT NULL, default false) and every existing game stays
// private; `down` drops the column without touching the games; `up` again works.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261102191800_public_games";
const PREVIOUS = "Migration20261102101500_email_name_change";
const SCRATCH = "e10s01_migration";

let admin: Orm;
let scratch: Orm;
const url = (database: string) => {
  const parsed = new URL(inject("databaseUrl"));
  parsed.pathname = `/${database}`;
  return parsed.toString();
};
const run = (text: string, params: unknown[] = []) =>
  scratch.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
const columnExists = async () =>
  (await run(`select count(*)::int as n from information_schema.columns where table_name = 'games' and column_name = 'is_public'`))[0]!
    .n === 1;

beforeAll(async () => {
  admin = await createOrm({ clientUrl: inject("databaseUrl") });
  await admin.em.fork().execute(`drop database if exists ${SCRATCH}`, [], "run");
  await admin.em.fork().execute(`create database ${SCRATCH}`, [], "run");
  scratch = await createOrm({ ...migrationsConfig, clientUrl: url(SCRATCH), ensureDatabase: false });
});
afterAll(async () => {
  await scratch.close();
  await admin.em.fork().execute(`drop database if exists ${SCRATCH}`, [], "run");
  await admin.close();
});

describe("migration public_games", () => {
  it("adds the flag and leaves existing games private", async () => {
    await scratch.migrator.up({ to: PREVIOUS });
    expect(await columnExists()).toBe(false);
    await run(`insert into games (origin, status) values ('invite', 'waiting'), ('lobby', 'cancelled')`);

    await scratch.migrator.up();

    expect(await columnExists()).toBe(true);
    expect(await run(`select is_public from games`)).toEqual([{ is_public: false }, { is_public: false }]);
    const [column] = await run(
      `select is_nullable, column_default from information_schema.columns where table_name = 'games' and column_name = 'is_public'`,
    );
    expect(column).toEqual({ is_nullable: "NO", column_default: "false" });
  });

  it("keeps a lobby game private whatever else is inserted (BR-40 default)", async () => {
    const [row] = await run(`insert into games (origin, status) values ('lobby', 'waiting') returning is_public`);
    expect(row!.is_public).toBe(false);
  });

  it("goes down without losing games and up again", async () => {
    await scratch.migrator.down({ to: PREVIOUS });
    expect(await columnExists()).toBe(false);
    expect((await run(`select count(*)::int as n from games`))[0]!.n).toBe(3);

    await scratch.migrator.up();
    expect(await columnExists()).toBe(true);
    expect(await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).toHaveLength(1);
    expect((await run(`select count(*)::int as n from games where is_public`))[0]!.n).toBe(0);
  });
});
