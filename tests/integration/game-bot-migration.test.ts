// Migration `bot_participant` (hosted-bot spec, E13-S02-T01) on a real PostgreSQL, in a scratch database of the
// test container: `up` adds the bot's columns, CHECKs and index; `down` refuses while a game with the bot exists
// and otherwise removes them and restores the old CHECKs; `up` again works.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261106071117_bot_participant";
const PREVIOUS = "Migration20261103063827_paper_variant";
const SCRATCH = "e13_bot_migration";

let admin: Orm;
let scratch: Orm;
const url = (database: string) => {
  const parsed = new URL(inject("databaseUrl"));
  parsed.pathname = `/${database}`;
  return parsed.toString();
};
const run = (text: string, params: unknown[] = []) =>
  scratch.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
const count = async (text: string) => (await run(text))[0]!.n as number;
const botColumns = () =>
  count(`select count(*)::int as n from information_schema.columns where table_name = 'game_players' and column_name like 'bot\\_%'`);
const definition = async (name: string) =>
  (await run(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = ?`, [name]))[0]?.def as string | undefined;
const indexExists = async () => (await count(`select count(*)::int as n from pg_indexes where indexname = 'game_players_bot_active_index'`)) === 1;

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

describe("migration bot_participant", () => {
  it("adds the bot's columns, CHECKs and index to a database with games in it", async () => {
    await scratch.migrator.up({ to: PREVIOUS });
    await run(`insert into games (origin, status) values ('invite', 'waiting')`);
    expect(await botColumns()).toBe(0);

    await scratch.migrator.up();

    expect(await botColumns()).toBe(3);
    expect(await indexExists()).toBe(true);
    expect(await definition("game_players_kind_check")).toContain("'bot'");
    expect(await definition("games_origin_check")).toContain("'bot'");
    expect(await definition("game_players_bot_seat_check")).toBeDefined();
  });

  it("refuses to go down while a game with the bot exists, and changes nothing", async () => {
    const [game] = await run(`insert into games (origin, status) values ('bot', 'waiting') returning id`);
    await run(`insert into game_players (game_id, seat, kind, bot_level) values (?, 2, 'bot', 1)`, [game!.id]);

    await expect(scratch.migrator.down({ to: PREVIOUS })).rejects.toThrow("games with the bot exist");

    expect(await botColumns()).toBe(3);
    expect(await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).toHaveLength(1);

    // A game with the bot's origin alone (its seat gone) still blocks the old origin CHECK.
    await run(`delete from game_players where kind = 'bot'`);
    await expect(scratch.migrator.down({ to: PREVIOUS })).rejects.toThrow("games with the bot exist");
    await run(`delete from games where origin = 'bot'`);
  });

  it("goes down without the bot, keeps the other games, restores the old CHECKs and goes up again", async () => {
    await scratch.migrator.down({ to: PREVIOUS });

    expect(await botColumns()).toBe(0);
    expect(await indexExists()).toBe(false);
    expect(await definition("game_players_kind_check")).not.toContain("'bot'");
    expect(await definition("games_origin_check")).not.toContain("'bot'");
    expect(await count(`select count(*)::int as n from games`)).toBe(1);

    await scratch.migrator.up();
    expect(await botColumns()).toBe(3);
  });
});
