// The history of finished games over HTTP (E04-S01, #27) against the built app and a real PostgreSQL:
// only the own finished games, the opponent by public name (account, deleted account, guest with and
// without a nickname), no e-mail and no account id in the answer, the cursor pages without duplicates
// or gaps (also across equal `finished_at`), a game out of time settled by the read itself, and the
// plan of the query on ~10 000 games of one account (`EXPLAIN`).
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { historySql } from "../../packages/app/src/server/services/games/game-history-service";

const baseUrl = inject("baseUrl");

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  // The bulk of the plan test and every account's games leave with the file.
  if (created.length > 0) {
    await run(`delete from games where id in (select game_id from game_players where user_id = any(?::uuid[]))`, [`{${created.join(",")}}`]);
  }
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let counter = 0;
const nextAddress = () => `198.61.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
const created: string[] = [];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST", path: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress(), ...headers },
  });
}

type Account = { cookie: string; id: string; name: string; email: string };
async function signedUp(): Promise<Account> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const name = `Hi_${n}`;
  const email = `history-${n}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl, "x-gomoku-request": "1", "x-forwarded-for": nextAddress() },
    body: JSON.stringify({ email, displayName: name, password: "secret123" }),
  });
  expect(response.status).toBe(201);
  const [row] = await run(`select id from users where display_name = ?`, [name]);
  created.push(row!.id as string);
  return { cookie: (response.headers.get("set-cookie") ?? "").split(";")[0]!, id: row!.id as string, name, email };
}

type Opponent =
  | { kind: "account"; user: Account | null }
  | { kind: "guest"; nickname: string | null };

type Seed = {
  me: Account;
  opponent: Opponent;
  /** Seat of `me`; the opponent has the other one. */
  seat?: 1 | 2;
  winnerSeat?: 1 | 2 | null;
  reason?: "five_in_row" | "draw" | "timeout" | "resignation";
  finishedAt?: string;
  status?: "waiting" | "active" | "finished" | "cancelled";
  origin?: "invite" | "lobby" | "rematch";
};

/** Writes a game with both players straight into the tables; the API under test only reads them. */
async function seed({ me, opponent, seat = 1, winnerSeat = seat, reason = "five_in_row", finishedAt, status = "finished", origin = "invite" }: Seed) {
  const finished = status === "finished";
  const [game] = await run(
    finished
      ? `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason)
         values (?, 'finished', ?::timestamptz - interval '5 minutes', ?::timestamptz, 1, ?, ?) returning id`
      : `insert into games (origin, status, started_at, black_seat) values (?, ?, ?, ?) returning id`,
    finished
      ? [origin, finishedAt ?? new Date().toISOString(), finishedAt ?? new Date().toISOString(), reason === "draw" ? null : winnerSeat, reason]
      : [origin, status, status === "active" ? new Date().toISOString() : null, status === "active" ? 1 : null],
  );
  const gameId = game!.id as string;
  const active = status === "active";
  await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, ?, 'account', ?, ?)`, [gameId, seat, me.id, active]);
  const other = seat === 1 ? 2 : 1;
  if (opponent.kind === "account") {
    await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, ?, 'account', ?, ?)`, [gameId, other, opponent.user?.id ?? null, active]);
  } else {
    await run(`insert into game_players (game_id, seat, kind, nickname, is_active) values (?, ?, 'guest', ?, ?)`, [gameId, other, opponent.nickname, active]);
  }
  return gameId;
}

const history = (who: Account | null, query = "") =>
  call("GET", `/api/history${query}`, who ? { cookie: who.cookie } : {});
async function page(who: Account, query = "") {
  const response = await history(who, query);
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { entries: Json[]; nextCursor: string | null } }).data;
}

describe("access", () => {
  it("answers 401 without a session and to a guest, who has no history (BR-24)", async () => {
    expect((await history(null)).status).toBe(401);
    expect((await call("GET", "/api/history", { cookie: "gomoku_guest=x".padEnd(50, "x") })).status).toBe(401);
  });

  it("answers 400 to a cursor that is not ours, also one built to look like SQL", async () => {
    const who = await signedUp();
    for (const cursor of ["garbage", btoa("2026-10-31T10:00:00.000000Z|1; drop table games"),
      // right shape, no such instant: PostgreSQL would refuse it, which must not become a 500
      btoa("2026-99-99T99:99:99.000000Z|0b9a6c52-7e3b-4a61-9f0e-2d3c4b5a6978"),
      "a".repeat(201)]) {
      const response = await history(who, `?cursor=${encodeURIComponent(cursor)}`);
      expect(response.status).toBe(400);
    }
  });

  it("is empty for an account without games", async () => {
    expect(await page(await signedUp())).toEqual({ entries: [], nextCursor: null });
  });
});

describe("what is on the list", () => {
  it("shows a finished game to both accounts with the result from each side, and to nobody else", async () => {
    const [alice, bob, carol] = [await signedUp(), await signedUp(), await signedUp()];
    const gameId = await seed({ me: alice, opponent: { kind: "account", user: bob }, seat: 1, winnerSeat: 1, finishedAt: "2026-10-30T10:00:00.000Z" });
    await run(`update game_players set user_id = ? where game_id = ? and seat = 2`, [bob.id, gameId]);

    const forAlice = await page(alice);
    const forBob = await page(bob);

    expect(forAlice.entries).toEqual([
      { gameId, finishedAt: "2026-10-30T10:00:00.000Z", result: "win", reason: "five_in_row", opponent: { kind: "account", name: bob.name } },
    ]);
    expect(forBob.entries).toEqual([
      { gameId, finishedAt: "2026-10-30T10:00:00.000Z", result: "loss", reason: "five_in_row", opponent: { kind: "account", name: alice.name } },
    ]);
    expect((await page(carol)).entries).toEqual([]);
  });

  it("says how each game ended and who won: five in a row, time, resignation, draw", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const base = Date.parse("2026-10-29T10:00:00.000Z");
    const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    const opponent = { kind: "account", user: bob } as const;
    await seed({ me: alice, opponent, finishedAt: at(1), reason: "timeout", winnerSeat: 2 });
    await seed({ me: alice, opponent, finishedAt: at(2), reason: "resignation", winnerSeat: 1 });
    await seed({ me: alice, opponent, finishedAt: at(3), reason: "draw", winnerSeat: null });
    await seed({ me: alice, opponent, finishedAt: at(4), reason: "five_in_row", seat: 2, winnerSeat: 2 });

    const { entries } = await page(alice);

    expect(entries.map((entry) => [entry.reason, entry.result])).toEqual([
      ["five_in_row", "win"],
      ["draw", "draw"],
      ["resignation", "win"],
      ["timeout", "loss"],
    ]);
  });

  it("leaves out games that are waiting, running or cancelled", async () => {
    const alice = await signedUp();
    const finished = await seed({ me: alice, opponent: { kind: "guest", nickname: null }, finishedAt: "2026-10-28T10:00:00.000Z" });
    await seed({ me: alice, opponent: { kind: "guest", nickname: null }, status: "cancelled" });
    // A running game has its slot occupied (BR-13), a waiting one has no opponent at all.
    await seed({ me: alice, opponent: { kind: "guest", nickname: "Ola" }, status: "active" });

    expect((await page(alice)).entries.map((entry) => entry.gameId)).toEqual([finished]);
  });

  it("lists a rematch like any other game", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const opponent = { kind: "account", user: bob } as const;
    const first = await seed({ me: alice, opponent, finishedAt: "2026-10-27T10:00:00.000Z" });
    const rematch = await seed({ me: alice, opponent, finishedAt: "2026-10-27T10:20:00.000Z", origin: "rematch", winnerSeat: 2 });

    const { entries } = await page(alice);

    expect(entries.map((entry) => [entry.gameId, entry.result])).toEqual([[rematch, "loss"], [first, "win"]]);
    expect(JSON.stringify(entries)).not.toContain("origin");
  });

  it("names the opponent: a guest by nickname or by seat, a deleted account as a kind without a name", async () => {
    const alice = await signedUp();
    const ghost = await signedUp();
    const at = (minutes: number) => new Date(Date.parse("2026-10-26T10:00:00.000Z") + minutes * 60_000).toISOString();
    await seed({ me: alice, opponent: { kind: "guest", nickname: "Kasia" }, finishedAt: at(1) });
    await seed({ me: alice, opponent: { kind: "guest", nickname: null }, finishedAt: at(2), seat: 1 });
    await seed({ me: alice, opponent: { kind: "guest", nickname: null }, finishedAt: at(3), seat: 2 });
    await seed({ me: alice, opponent: { kind: "account", user: ghost }, finishedAt: at(4) });
    // The opponent deletes the account (BR-17): the seat stays, the account id goes.
    await run(`delete from users where id = ?`, [ghost.id]);

    const { entries } = await page(alice);

    expect(entries.map((entry) => entry.opponent)).toEqual([
      { kind: "account", name: null },
      { kind: "guest", name: "Gracz 1" },
      { kind: "guest", name: "Gracz 2" },
      { kind: "guest", name: "Kasia" },
    ]);
  });

  it("does not reveal an e-mail, an account id or the cursor internals beyond the public name", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    await seed({ me: alice, opponent: { kind: "account", user: bob }, finishedAt: "2026-10-25T10:00:00.000Z" });

    const raw = JSON.stringify(await page(alice));

    for (const secret of [alice.email, bob.email, "@example.com", alice.id, bob.id, "userId", "user_id", "email", "password"]) {
      expect(raw).not.toContain(secret);
    }
  });
});

describe("paging by cursor", () => {
  it("walks 45 games in pages of 20, newest first, with no duplicate and no gap across equal finish times", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const base = Date.parse("2026-09-01T10:00:00.000Z");
    const ids: string[] = [];
    for (let i = 0; i < 45; i++) {
      // Every third game ends at the very same moment as the one before it: the id decides.
      const minute = i - (i % 3 === 2 ? 1 : 0);
      ids.push(await seed({ me: alice, opponent: { kind: "account", user: bob }, finishedAt: new Date(base + minute * 60_000).toISOString() }));
    }

    const first = await page(alice);
    const second = await page(alice, `?cursor=${encodeURIComponent(first.nextCursor!)}`);
    const third = await page(alice, `?cursor=${encodeURIComponent(second.nextCursor!)}`);

    expect([first.entries.length, second.entries.length, third.entries.length]).toEqual([20, 20, 5]);
    expect(third.nextCursor).toBeNull();
    const walked = [...first.entries, ...second.entries, ...third.entries];
    expect(new Set(walked.map((entry) => entry.gameId))).toEqual(new Set(ids));
    expect(walked).toHaveLength(45);
    const times = walked.map((entry) => Date.parse(entry.finishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("stays valid when a newer game finishes between two pages", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const base = Date.parse("2026-08-01T10:00:00.000Z");
    for (let i = 0; i < 21; i++) {
      await seed({ me: alice, opponent: { kind: "account", user: bob }, finishedAt: new Date(base + i * 60_000).toISOString() });
    }
    const first = await page(alice);

    await seed({ me: alice, opponent: { kind: "account", user: bob }, finishedAt: new Date(base + 60 * 60_000).toISOString() });
    const second = await page(alice, `?cursor=${encodeURIComponent(first.nextCursor!)}`);

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]!.finishedAt).toBe(new Date(base).toISOString());
  });
});

describe("a game out of time that nobody opened", () => {
  it("is finished by the read itself and listed as lost on time", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const [game] = await run(
      `insert into games (origin, status, started_at, black_seat, turn_started_at)
       values ('invite', 'active', now() - interval '30 minutes', 1, now() - interval '20 minutes') returning id`,
    );
    const gameId = game!.id as string;
    await run(`insert into game_players (game_id, seat, kind, user_id, is_active, seen_at) values (?, 1, 'account', ?, true, now()), (?, 2, 'account', ?, true, now())`, [gameId, alice.id, gameId, bob.id]);

    // Seat 1 (black, alice) is on turn with an empty board and has had 20 minutes of a 10-minute clock.
    const { entries } = await page(alice);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ gameId, result: "loss", reason: "timeout", opponent: { kind: "account", name: bob.name } });
    const [after] = await run(`select status, is_active from games g join game_players p on p.game_id = g.id where g.id = ? and p.seat = 1`, [gameId]);
    expect(after).toEqual({ status: "finished", is_active: false });
    expect((await page(bob)).entries[0]).toMatchObject({ gameId, result: "win", reason: "timeout" });
  });
});

describe("the plan of the query", () => {
  it("starts from game_players_user_id_index and answers in well under 200 ms for ~10 000 games of one account", async () => {
    const [heavy, noise, other] = [await signedUp(), await signedUp(), await signedUp()];
    // 10 000 games of `heavy` and 40 000 of somebody else (the realistic share), each against a guest.
    const bulk = (user: Account, count: number) =>
      run(
        `with g as (
           insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason)
           select 'invite', 'finished', now() - interval '1 day', now() - (n || ' seconds')::interval, 1, 1, 'five_in_row'
           from generate_series(1, ${count}) n returning id)
         , me as (insert into game_players (game_id, seat, kind, user_id, is_active) select id, 1, 'account', ?, false from g returning game_id)
         insert into game_players (game_id, seat, kind, nickname, is_active) select id, 2, 'guest', null, false from g`,
        [user.id],
      );
    await bulk(heavy, 10_000);
    await bulk(noise, 40_000);
    await run(`analyze games`);
    await run(`analyze game_players`);

    const explained = await run(`explain (analyze, format json) ${historySql(false)}`, [heavy.id, 21]);
    const plan = JSON.stringify(explained[0]!["QUERY PLAN"]);
    const executionMs = (explained[0]!["QUERY PLAN"] as Json[])[0]!["Execution Time"] as number;

    expect(plan).toContain("game_players_user_id_index");
    // `games` may be read whole (a hash join from 10 000 of 50 000 rows); `game_players` must not be.
    const scans = (node: Json): string[] => [
      ...(node["Node Type"] === "Seq Scan" ? [node["Relation Name"] as string] : []),
      ...((node.Plans as Json[] | undefined) ?? []).flatMap(scans),
    ];
    expect(scans((explained[0]!["QUERY PLAN"] as Json[])[0]!.Plan)).not.toContain("game_players");
    expect(executionMs).toBeLessThan(200);

    // And through the API: the first and a deep page.
    const started = Date.now();
    const first = await page(heavy);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(first.entries).toHaveLength(20);
    expect((await page(other)).entries).toEqual([]);
    // 50 000 games and 100 000 players are written first, which takes a while on a busy machine.
  }, 180_000);
});
