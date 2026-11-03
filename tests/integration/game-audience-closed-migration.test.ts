// Migration `audience_closed` (E10-S05) on a real PostgreSQL, in a scratch database of the test container:
// `up` adds the nullable `games.audience_closed_at` and every existing game has it unset; `down` drops the
// column without touching the games; `up` again works.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261102221540_audience_closed";
const PREVIOUS = "Migration20261102212952_spectator_chat";
const SCRATCH = "e10s05_migration";

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
  (await run(`select count(*)::int as n from information_schema.columns where table_name = 'games' and column_name = 'audience_closed_at'`))[0]!
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

describe("migration audience_closed", () => {
  it("adds the nullable column and leaves existing games unset", async () => {
    await scratch.migrator.up({ to: PREVIOUS });
    expect(await columnExists()).toBe(false);
    await run(`insert into games (origin, status) values ('invite', 'waiting'), ('lobby', 'cancelled')`);

    await scratch.migrator.up();

    expect(await columnExists()).toBe(true);
    expect(await run(`select audience_closed_at from games`)).toEqual([{ audience_closed_at: null }, { audience_closed_at: null }]);
  });

  it("goes down without losing games and up again", async () => {
    await scratch.migrator.down({ to: PREVIOUS });
    expect(await columnExists()).toBe(false);
    expect((await run(`select count(*)::int as n from games`))[0]!.n).toBe(2);

    await scratch.migrator.up();
    expect(await columnExists()).toBe(true);
    expect(await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).toHaveLength(1);
  });
});
