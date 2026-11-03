// Migration `paper_variant` (E11) on a real PostgreSQL, in a scratch database of the test container:
// `up` gives every existing game and seeker the classic variant and the 10-minute clock; `down` refuses while
// a paper game exists and otherwise removes the new tables and columns and restores the old CHECKs; `up` again works.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261103063827_paper_variant";
const PREVIOUS = "Migration20261102221540_audience_closed";
const SCRATCH = "e11_migration";

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
const tableExists = async (name: string) =>
  (await count(`select count(*)::int as n from information_schema.tables where table_name = '${name}'`)) === 1;
const columnExists = async (table: string, column: string) =>
  (await count(
    `select count(*)::int as n from information_schema.columns where table_name = '${table}' and column_name = '${column}'`,
  )) === 1;

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

describe("migration paper_variant", () => {
  it("gives existing games and seekers the classic variant and the 10-minute clock", async () => {
    await scratch.migrator.up({ to: PREVIOUS });
    expect(await columnExists("games", "variant")).toBe(false);
    await run(`insert into games (origin, status) values ('invite', 'waiting'), ('lobby', 'cancelled')`);
    await run(`insert into users (email, display_name, display_name_key, password_hash) values ('m@example.com', 'M', 'm', ?)`, [
      "x".repeat(60),
    ]);
    await run(`insert into lobby_seekers (user_id, expires_at) select id, now() + interval '5 minutes' from users`);

    await scratch.migrator.up();

    expect(await run(`select variant, time_control_ms from games`)).toEqual([
      { variant: "classic", time_control_ms: 600000 },
      { variant: "classic", time_control_ms: 600000 },
    ]);
    expect(await run(`select variant, time_control_ms from lobby_seekers`)).toEqual([
      { variant: "classic", time_control_ms: 600000 },
    ]);
    expect(await tableExists("paper_game_states")).toBe(true);
    expect(await tableExists("paper_moves")).toBe(true);
  });

  it("refuses to go down while a paper game exists, and changes nothing", async () => {
    const [row] = await run(
      `insert into games (origin, status, variant, time_control_ms, clock_ms_1, clock_ms_2)
       values ('invite', 'waiting', 'paper', 60000, 60000, 60000) returning id`,
    );
    const id = row!.id;
    await run(`insert into paper_moves (game_id, move_number, x, y, seat, played_at) values (?, 1, 50, 50, 1, now())`, [id]);

    await expect(scratch.migrator.down({ to: PREVIOUS })).rejects.toThrow("paper games exist");

    expect(await columnExists("games", "variant")).toBe(true);
    expect(await count(`select count(*)::int as n from paper_moves`)).toBe(1);
    expect(await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).toHaveLength(1);
  });

  it("goes down without the paper games, keeps the classic ones and restores the old CHECKs", async () => {
    await run(`delete from games where variant = 'paper'`);

    await scratch.migrator.down({ to: PREVIOUS });

    expect(await columnExists("games", "variant")).toBe(false);
    expect(await columnExists("games", "time_control_ms")).toBe(false);
    expect(await columnExists("lobby_seekers", "variant")).toBe(false);
    expect(await tableExists("paper_game_states")).toBe(false);
    expect(await tableExists("paper_moves")).toBe(false);
    expect(await count(`select count(*)::int as n from games`)).toBe(2);
    // The old CHECKs are back: `points` is unknown, a clock above 10 minutes is refused again.
    await expect(
      run(`insert into games (origin, status, started_at, finished_at, black_seat, end_reason, winner_seat)
           values ('invite', 'finished', now(), now(), 1, 'points', 1)`),
    ).rejects.toThrow("games_end_reason_check");
    await expect(run(`insert into games (origin, status, clock_ms_1) values ('invite', 'waiting', 600001)`)).rejects.toThrow(
      "games_clock_ms_check",
    );
    await expect(
      run(`insert into games (origin, status, started_at, finished_at, black_seat, end_reason)
           values ('invite', 'finished', now(), now(), 1, 'timeout')`),
    ).rejects.toThrow("games_winner_required_check");
  });

  it("goes up again", async () => {
    await scratch.migrator.up();
    expect(await columnExists("games", "variant")).toBe(true);
    expect(await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION])).toHaveLength(1);
  });
});
