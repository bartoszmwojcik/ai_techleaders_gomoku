// Migration `game_pair_counters` (E06-S03) on a real PostgreSQL, in a scratch database of the
// test container: `up` creates the table and backfills the finished games, counting by pair and
// Warsaw day, never a cancelled / active / waiting game; `down` drops the table; `up` again works.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { migrationsConfig } from "../../packages/db/src/migrations-config";

const MIGRATION = "Migration20261031212354_game_pair_counters";
const SCRATCH = "s03_migration";

let admin: Orm;
let scratch: Orm;
const url = (database: string) => {
  const parsed = new URL(inject("databaseUrl"));
  parsed.pathname = `/${database}`;
  return parsed.toString();
};
const run = (text: string, params: unknown[] = []) =>
  scratch.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

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

async function game(status: string, finishedAt: string | null, kinds: ("account" | "guest" | "agent")[]) {
  const [row] = await run(
    status === "finished"
      ? `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason)
         values ('invite', 'finished', ?::timestamptz - interval '5 minutes', ?::timestamptz, 1, 1, 'resignation') returning id`
      : `insert into games (origin, status, started_at, black_seat)
         values ('invite', ?, case when ? = 'active' then now() end, case when ? = 'active' then 1 end) returning id`,
    status === "finished" ? [finishedAt, finishedAt] : [status, status, status],
  );
  for (const [index, kind] of kinds.entries()) {
    await run(
      kind === "agent"
        ? `insert into game_players (game_id, seat, kind, join_channel, is_active) values (?, ?, 'agent', 'mcp', false)`
        : `insert into game_players (game_id, seat, kind, is_active) values (?, ?, ?, false)`,
      kind === "agent" ? [row!.id, index + 1] : [row!.id, index + 1, kind],
    );
  }
}
const tableExists = async () =>
  (await run(`select to_regclass('public.game_pair_counters') is not null as present`))[0]!.present as boolean;

describe("migration game_pair_counters", () => {
  it("backfills the finished games by pair and Warsaw day, and only them", async () => {
    await scratch.migrator.up({ to: "Migration20261031175106_agent_participant" });
    expect(await tableExists()).toBe(false);

    await game("finished", "2026-10-20T10:00:00Z", ["account", "account"]);
    await game("finished", "2026-10-20T11:00:00Z", ["account", "account"]);
    await game("finished", "2026-10-20T22:30:00Z", ["account", "guest"]); // 00:30 on the 21st in Warsaw
    await game("finished", "2026-10-21T08:00:00Z", ["guest", "agent"]);
    await game("finished", "2026-10-21T09:00:00Z", ["account", "agent"]);
    await game("cancelled", null, ["account"]);
    await game("waiting", null, ["guest"]);
    await game("active", null, ["account", "guest"]);

    await scratch.migrator.up();

    expect(await tableExists()).toBe(true);
    expect(
      await run(`select day::text as day, kind_a, kind_b, finished_count from game_pair_counters order by day, kind_a, kind_b`),
    ).toEqual([
      { day: "2026-10-20", kind_a: "account", kind_b: "account", finished_count: 2 },
      { day: "2026-10-21", kind_a: "account", kind_b: "agent", finished_count: 1 },
      { day: "2026-10-21", kind_a: "account", kind_b: "guest", finished_count: 1 },
      { day: "2026-10-21", kind_a: "agent", kind_b: "guest", finished_count: 1 },
    ]);
  });

  it("guards the order of the kinds and a negative count", async () => {
    await expect(
      run(`insert into game_pair_counters (day, kind_a, kind_b, finished_count) values ('2001-01-01', 'guest', 'account', 1)`),
    ).rejects.toThrow(/game_pair_counters_kind_order_check/);
    await expect(
      run(`insert into game_pair_counters (day, kind_a, kind_b, finished_count) values ('2001-01-01', 'account', 'guest', -1)`),
    ).rejects.toThrow(/game_pair_counters_count_check/);
  });

  it("goes down to nothing and up again", async () => {
    await scratch.migrator.down({ to: "Migration20261031175106_agent_participant" });
    expect(await tableExists()).toBe(false);
    expect((await run(`select count(*)::int as n from games where status = 'finished'`))[0]!.n).toBe(5);

    await scratch.migrator.up();
    expect(await tableExists()).toBe(true);
    expect((await run(`select sum(finished_count)::int as n from game_pair_counters`))[0]!.n).toBe(5);
    const executed = await run(`select name from mikro_orm_migrations where name = ?`, [MIGRATION]);
    expect(executed).toHaveLength(1);
  });
});
