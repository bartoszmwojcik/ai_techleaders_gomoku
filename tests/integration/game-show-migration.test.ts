// Migration `show_origin` (show-mode spec, E14-S01-T01) on a real PostgreSQL, in a scratch database of the
// test container: `up` lets a game have `origin = 'show'` and the bot sit in seat 1; `down` refuses while a
// show game or a bot in seat 1 exists and otherwise restores the old CHECKs; `up` again works.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261110190343_show_origin";
const PREVIOUS = "Migration20261106071117_bot_participant";
const SCRATCH = "e14_show_migration";

let admin: Orm;
let scratch: Orm;
const url = (database: string) => {
  const parsed = new URL(inject("databaseUrl"));
  parsed.pathname = `/${database}`;
  return parsed.toString();
};
const run = (text: string, params: unknown[] = []) =>
  scratch.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
const definition = async (name: string) =>
  (await run(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = ?`, [name]))[0]?.def as string | undefined;
const applied = async () => (await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).length === 1;
const game = async (origin: string) => (await run(`insert into games (origin, status) values (?, 'waiting') returning id`, [origin]))[0]!.id as string;
const bot = (gameId: string, seat: 1 | 2) =>
  run(`insert into game_players (game_id, seat, kind, bot_level) values (?, ?, 'bot', 1)`, [gameId, seat]);
const violation = (statement: Promise<unknown>, constraint: string) => expect(statement).rejects.toThrow(constraint);

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

describe("migration show_origin", () => {
  it("before it, a show game and a bot in seat 1 are refused", async () => {
    await scratch.migrator.up({ to: PREVIOUS });

    await violation(game("show"), "games_origin_check");
    await violation(bot(await game("bot"), 1), "game_players_bot_seat_check");
    await run(`delete from games`);
  });

  it("allows a show game with two bots, the first in seat 1, on a database with games in it", async () => {
    const invite = await game("invite");
    await bot(await game("bot"), 2);

    await scratch.migrator.up();

    expect(await definition("games_origin_check")).toContain("'show'");
    expect(await definition("game_players_bot_seat_check")).toBeUndefined();
    const show = await game("show");
    await bot(show, 1);
    await bot(show, 2);
    expect(await run(`select seat from game_players where game_id = ? order by seat`, [show])).toEqual([{ seat: 1 }, { seat: 2 }]);
    // The other bot rules stay: no bot without a level, even in a show.
    const empty = await game("show");
    await violation(run(`insert into game_players (game_id, seat, kind) values (?, 1, 'bot')`, [empty]), "game_players_bot_kind_check");
    await run(`delete from games where id = ?`, [empty]);
    expect(await run(`select 1 from games where id = ?`, [invite])).toHaveLength(1);
  });

  it("refuses to go down while a show game or a bot in seat 1 exists, and changes nothing", async () => {
    await expect(scratch.migrator.down({ to: PREVIOUS })).rejects.toThrow("show games exist");
    expect(await applied()).toBe(true);
    expect(await definition("games_origin_check")).toContain("'show'");

    // A show game without its seats still blocks the old origin CHECK.
    await run(`delete from game_players where game_id in (select id from games where origin = 'show')`);
    await expect(scratch.migrator.down({ to: PREVIOUS })).rejects.toThrow("show games exist");

    // A bot in seat 1 of a game of another origin still blocks the old seat CHECK.
    await run(`delete from games where origin = 'show'`);
    const [seat1] = await run(`insert into game_players (game_id, seat, kind, bot_level) values (?, 1, 'bot', 1) returning id`, [await game("bot")]);
    await expect(scratch.migrator.down({ to: PREVIOUS })).rejects.toThrow("show games exist");
    expect(await applied()).toBe(true);
    await run(`delete from game_players where id = ?`, [seat1!.id]);
  });

  it("goes down without a show, keeps the other games, restores the old CHECKs and goes up again", async () => {
    const before = (await run(`select count(*)::int as n from games`))[0]!.n as number;

    await scratch.migrator.down({ to: PREVIOUS });

    expect(await applied()).toBe(false);
    expect(await definition("games_origin_check")).not.toContain("'show'");
    expect(await definition("game_players_bot_seat_check")).toContain("seat = 2");
    expect((await run(`select count(*)::int as n from games`))[0]!.n).toBe(before);

    await scratch.migrator.up();
    expect(await applied()).toBe(true);
    expect(await definition("game_players_bot_seat_check")).toBeUndefined();
  });
});
