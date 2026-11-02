// Migration `game_spectators` (E10-S02-T02, #208) on a real PostgreSQL, in a scratch database of the
// test container: `up` adds the table of temporary spectators (an account or a token with a nickname,
// no seat) with its CHECKs, uniques and cascades; `down` drops it without touching the games; `up`
// again works. A spectator is not a row of `game_players`, so no history can list it (BR-24, BR-39).
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261102205023_game_spectators";
const PREVIOUS = "Migration20261102191800_public_games";
const SCRATCH = "e10s02_migration";

let admin: Orm;
let scratch: Orm;
const url = (database: string) => {
  const parsed = new URL(inject("databaseUrl"));
  parsed.pathname = `/${database}`;
  return parsed.toString();
};
const run = (text: string, params: unknown[] = []) =>
  scratch.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
const tableExists = async () =>
  (await run(`select count(*)::int as n from information_schema.tables where table_name = 'game_spectators'`))[0]!.n === 1;
const hash = (seed: string) => seed.repeat(64).slice(0, 64);

let gameId: string;
let userId: string;
const insert = (columns: string, values: unknown[]) =>
  run(
    `insert into game_spectators (game_id, ${columns}, expires_at) values (?, ${values.map(() => "?").join(", ")}, now() + interval '1 hour') returning id`,
    [gameId, ...values],
  );

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

describe("migration game_spectators", () => {
  it("adds the table and leaves games and players untouched", async () => {
    await scratch.migrator.up({ to: PREVIOUS });
    expect(await tableExists()).toBe(false);
    [{ id: gameId }] = (await run(`insert into games (origin, status, is_public) values ('invite', 'waiting', true) returning id`)) as [{ id: string }];
    [{ id: userId }] = (await run(
      `insert into users (email, display_name, display_name_key, password_hash) values ('s@example.com', 'Spec', 'spec', 'x') returning id`,
    )) as [{ id: string }];

    await scratch.migrator.up();

    expect(await tableExists()).toBe(true);
    expect((await run(`select count(*)::int as n from games`))[0]!.n).toBe(1);
    const columns = (await run(`select column_name from information_schema.columns where table_name = 'game_spectators'`)).map((row) => row.column_name);
    expect(columns.sort()).toEqual(["created_at", "expires_at", "game_id", "id", "last_seen_at", "nickname", "token_hash", "user_id"]);
    // No seat and no participant columns: a spectator is not in `game_players`.
    expect(columns).not.toContain("seat");
    expect((await run(`select count(*)::int as n from game_players`))[0]!.n).toBe(0);
  });

  it("takes an account or a token with an optional nickname, and defaults the timestamps", async () => {
    const [account] = await insert("user_id", [userId]);
    const [visitor] = await insert("token_hash, nickname", [hash("a"), "Zosia"]);
    const [anonymous] = await insert("token_hash", [hash("b")]);
    expect(account!.id && visitor!.id && anonymous!.id).toBeTruthy();
    const [row] = await run(`select created_at <= now() as created, last_seen_at <= now() as seen from game_spectators where id = ?`, [visitor!.id]);
    expect(row).toEqual({ created: true, seen: true });
  });

  it("refuses an identity that is both, or neither", async () => {
    await expect(insert("user_id, token_hash", [userId, hash("c")])).rejects.toThrow(/game_spectators_identity_check/);
    await expect(run(`insert into game_spectators (game_id, expires_at) values (?, now() + interval '1 hour')`, [gameId])).rejects.toThrow(
      /game_spectators_identity_check/,
    );
  });

  it("refuses a nickname next to an account, an empty one and one over 24 characters", async () => {
    await expect(insert("user_id, nickname", [userId, "Ala"])).rejects.toThrow(/game_spectators_nickname_check|game_spectators_game_id_user_id_unique/);
    await expect(insert("token_hash, nickname", [hash("d"), ""])).rejects.toThrow(/game_spectators_nickname_check/);
    await expect(insert("token_hash, nickname", [hash("e"), "x".repeat(25)])).rejects.toThrow();
  });

  it("refuses an expiry before the creation, a second row of an account in a game and a reused token", async () => {
    await expect(
      run(`insert into game_spectators (game_id, token_hash, expires_at, created_at) values (?, ?, now(), now() + interval '1 minute')`, [gameId, hash("f")]),
    ).rejects.toThrow(/game_spectators_expiry_check/);
    await expect(insert("user_id", [userId])).rejects.toThrow(/game_spectators_game_id_user_id_unique/);
    await expect(insert("token_hash", [hash("a")])).rejects.toThrow(/game_spectators_token_hash_unique/);
  });

  it("lets visitors of one game share no row, while accounts of other games are independent", async () => {
    const [other] = await run(`insert into games (origin, status, is_public) values ('invite', 'waiting', true) returning id`);
    await run(`insert into game_spectators (game_id, user_id, expires_at) values (?, ?, now() + interval '1 hour')`, [other!.id, userId]);
    expect((await run(`select count(*)::int as n from game_spectators where user_id = ?`, [userId]))[0]!.n).toBe(2);
  });

  it("goes with its game and with its account (cascade)", async () => {
    const [another] = await run(`insert into users (email, display_name, display_name_key, password_hash) values ('t@example.com', 'Tee', 'tee', 'x') returning id`);
    await run(`insert into game_spectators (game_id, user_id, expires_at) values (?, ?, now() + interval '1 hour')`, [gameId, another!.id]);
    await run(`delete from users where id = ?`, [another!.id]);
    expect((await run(`select count(*)::int as n from game_spectators where user_id = ?`, [another!.id]))[0]!.n).toBe(0);

    const before = (await run(`select count(*)::int as n from game_spectators where game_id = ?`, [gameId]))[0]!.n;
    expect(before).toBeGreaterThan(0);
    await run(`delete from games where id = ?`, [gameId]);
    expect((await run(`select count(*)::int as n from game_spectators where game_id = ?`, [gameId]))[0]!.n).toBe(0);
  });

  it("has the indexes of the presence count and of the cleanup", async () => {
    const indexes = (await run(`select indexname from pg_indexes where tablename = 'game_spectators'`)).map((row) => row.indexname);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "game_spectators_game_id_last_seen_at_index",
        "game_spectators_expires_at_index",
        "game_spectators_user_id_index",
        "game_spectators_token_hash_unique",
      ]),
    );
  });

  it("goes down without touching the games and up again", async () => {
    await run(`insert into games (origin, status) values ('invite', 'waiting')`);
    const games = (await run(`select count(*)::int as n from games`))[0]!.n;

    await scratch.migrator.down({ to: PREVIOUS });
    expect(await tableExists()).toBe(false);
    expect((await run(`select count(*)::int as n from games`))[0]!.n).toBe(games);

    await scratch.migrator.up();
    expect(await tableExists()).toBe(true);
    expect(await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).toHaveLength(1);
    expect((await run(`select count(*)::int as n from game_spectators`))[0]!.n).toBe(0);
  });
});
