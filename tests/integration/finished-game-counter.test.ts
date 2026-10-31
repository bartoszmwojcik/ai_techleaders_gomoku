// The durable counter of finished games per pair of participant kinds (E06-S03, #129) against
// the built app and a real PostgreSQL: every way a game can end (a five, a draw, resignation,
// a loss on time found by a read, a move, a resignation or BR-13) for every pair (account-account,
// account-guest, account-agent, guest-guest, agent-guest) raises exactly one counter by exactly
// one; plus races, retries, rollback, `db:cleanup`, account deletion, the Europe/Warsaw day, the
// read model and the `npm run stats:games` command. Files run one after another, so the counters
// change only through the game the test plays; each check compares the counters before and after.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { cleanupExpired, createOrm, readFinishedGameStats, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { recordFinishedGame } from "../../packages/app/src/server/services/games/finished-game-counter";

const baseUrl = inject("baseUrl");
const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Limits are per client address: every call has an own address (X-Forwarded-For, one trusted hop).
let addressCounter = 0;
const nextAddress = () => `198.80.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

function rest(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const guestCookieOf = (response: Response) =>
  (response.headers.getSetCookie?.() ?? []).find((line) => line.startsWith("gomoku_guest="))!.split(";")[0]!;

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "integration-test", version: "1" },
};
type ToolResult = { isError?: boolean; structuredContent: Json };
async function tool(name: string, args: Json): Promise<ToolResult> {
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": nextAddress(),
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": name,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args, _meta: META } }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: ToolResult }).result;
}

type Kind = "account" | "guest" | "agent";
type Player = {
  kind: Kind;
  seat: 1 | 2;
  /** Whether the move was accepted. */
  move(gameId: string, x: number, y: number, moveNumber: number): Promise<boolean>;
  read(gameId: string): Promise<void>;
  /** Humans only (an agent has no resignation tool). */
  resign?(gameId: string): Promise<void>;
  /** Humans only: starting a new game runs the BR-13 settlement of the player's expired game. */
  newGame?(): Promise<void>;
};

function human(kind: "account" | "guest", seat: 1 | 2, cookie: string): Player {
  return {
    kind,
    seat,
    async move(gameId, x, y, moveNumber) {
      return (await rest("POST", `/api/games/${gameId}/moves`, { x, y, moveNumber }, cookie)).status === 200;
    },
    async read(gameId) {
      expect((await rest("GET", `/api/games/${gameId}`, undefined, cookie)).status).toBeLessThan(500);
    },
    async resign(gameId) {
      expect((await rest("POST", `/api/games/${gameId}/resign`, undefined, cookie)).status).toBeLessThan(500);
    },
    async newGame() {
      const body = kind === "guest" ? { acknowledgedGuestWarning: true } : {};
      expect((await rest("POST", "/api/games", body, cookie)).status).toBeLessThan(500);
    },
  };
}

function agent(token: string): Player {
  return {
    kind: "agent",
    seat: 2,
    async move(_gameId, x, y, moveNumber) {
      return (await tool("play_move", { token, x, y, moveNumber })).isError !== true;
    },
    async read() {
      expect((await tool("get_state", { token })).structuredContent).toBeDefined();
    },
  };
}

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await rest("POST", "/api/auth/register", {
    email: `fgc-${n}@example.com`,
    displayName: `Fgc_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Pair = "account-account" | "account-guest" | "account-agent" | "guest-guest" | "agent-guest";
const PAIRS: Pair[] = ["account-account", "account-guest", "account-agent", "guest-guest", "agent-guest"];
// Creator (seat 1) and joiner (seat 2) of each pair.
const ROLES: Record<Pair, [Exclude<Kind, "agent">, Kind]> = {
  "account-account": ["account", "account"],
  "account-guest": ["account", "guest"],
  "account-agent": ["account", "agent"],
  "guest-guest": ["guest", "guest"],
  "agent-guest": ["guest", "agent"],
};

type Game = { id: string; a: Player; b: Player };

/** A running game of the pair: joined and with the clock started. */
async function startedGame(pair: Pair): Promise<Game> {
  const [creatorKind, joinerKind] = ROLES[pair];
  let creatorCookie: string;
  let created: Response;
  if (creatorKind === "account") {
    creatorCookie = await signedUp();
    created = await rest("POST", "/api/games", {}, creatorCookie);
  } else {
    created = await rest("POST", "/api/games", { acknowledgedGuestWarning: true });
    creatorCookie = cookieOf(created);
  }
  expect(created.status).toBe(201);
  const { data } = await json(created);
  const gameId = data.gameId as string;
  const code = data.invitation.code as string;
  const a = human(creatorKind, 1, creatorCookie);

  let b: Player;
  if (joinerKind === "agent") {
    const joined = await tool("join", { code, agentName: "counter probe" });
    expect(joined.isError).toBeUndefined();
    b = agent(joined.structuredContent.token as string);
  } else if (joinerKind === "guest") {
    const joined = await rest("POST", `/api/invitations/${code}/accept`, { as: "guest", acknowledgedGuestWarning: true });
    expect(joined.status).toBe(200);
    b = human("guest", 2, guestCookieOf(joined));
  } else {
    const cookie = await signedUp();
    expect((await rest("POST", `/api/invitations/${code}/accept`, { as: "user" }, cookie)).status).toBe(200);
    b = human("account", 2, cookie);
  }
  await a.read(gameId);
  return { id: gameId, a, b };
}

const withBlack = (game: Game, black: Player) =>
  run(`update games set black_seat = ? where id = ?`, [black.seat, game.id]);
const gameRow = async (id: string) =>
  (await run(`select status, end_reason, winner_seat, move_count from games where id = ?`, [id]))[0]!;
/** Moves the start of the running turn into the past: the side on turn is out of time. */
const expireClock = (game: Game) =>
  run(`update games set turn_started_at = now() - make_interval(secs => 700) where id = ?`, [game.id]);

async function counters(): Promise<Record<string, number>> {
  const rows = await run(`select kind_a || '-' || kind_b as pair, sum(finished_count)::int as n from game_pair_counters group by 1`);
  return Object.fromEntries(rows.map((row) => [row.pair as string, row.n as number]));
}
const pairOf = (game: Game) => [game.a.kind, game.b.kind].sort().join("-");

/** Runs `action` and expects exactly one more finished game, in the pair of `game`, and nothing else changed. */
async function expectOneMore(game: Game, action: () => Promise<unknown>) {
  const before = await counters();
  await action();
  const after = await counters();
  const changed = Object.fromEntries(
    Object.keys({ ...before, ...after })
      .map((pair) => [pair, (after[pair] ?? 0) - (before[pair] ?? 0)] as const)
      .filter(([, delta]) => delta !== 0),
  );
  expect(changed).toEqual({ [pairOf(game)]: 1 });
}

const FIVE = { black: [[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]], white: [[0, 0], [1, 0], [2, 0], [3, 0]] } as const;
async function playFive(game: Game, black: Player, white: Player) {
  let moveNumber = 1;
  for (let index = 0; index < FIVE.black.length; index++) {
    const [bx, by] = FIVE.black[index]!;
    expect(await black.move(game.id, bx, by, moveNumber++), `black move ${moveNumber - 1}`).toBe(true);
    const next = FIVE.white[index];
    if (next) expect(await white.move(game.id, next[0], next[1], moveNumber++), `white move ${moveNumber - 1}`).toBe(true);
  }
}

const bits = (cells: number[]) => Array.from({ length: 225 }, (_, c) => (cells.includes(c) ? "1" : "0")).join("");
async function setBoard(game: Game, black: number[], white: number[], moves: number[]) {
  await run(
    `update games set stones_black = ?::bit(225), stones_white = ?::bit(225), moves = ?::bytea, move_count = ? where id = ?`,
    [bits(black), bits(white), Buffer.from(moves), moves.length, game.id],
  );
}
const drawLayout = () => {
  const cells = Array.from({ length: 225 }, (_, c) => c);
  const black = cells.filter((c) => (Math.floor((c % 15) / 2) + Math.floor(c / 15)) % 2 === 0);
  return { black, white: cells.filter((c) => !black.includes(c)) };
};
const interleave = (black: number[], white: number[]) => black.flatMap((c, i) => (i < white.length ? [c, white[i]!] : [c]));
const cellOf = (x: number, y: number) => y * 15 + x;

/** Black has four in a row on the board, white four elsewhere, black to play the fifth. */
async function nearFive(game: Game) {
  const black = FIVE.black.slice(0, 4).map(([x, y]) => cellOf(x, y));
  const white = FIVE.white.map(([x, y]) => cellOf(x, y));
  await setBoard(game, black, white, interleave(black, white));
}

describe.each(PAIRS)("pair %s", (pair) => {
  const orders = [false, true];

  it.each(orders)("a five in a row counts once (swapped colours: %s)", async (swap) => {
    const game = await startedGame(pair);
    const [black, white] = swap ? [game.b, game.a] : [game.a, game.b];
    await withBlack(game, black);
    await expectOneMore(game, () => playFive(game, black, white));
    expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "five_in_row" });
    // A retry of the final move and a read of the finished game count nothing more.
    await expectNone(game, async () => {
      await black.move(game.id, 7, 7, 9);
      await black.read(game.id);
      await white.read(game.id);
    });
  });

  it.each(orders)("a draw on the 225th stone counts once (swapped colours: %s)", async (swap) => {
    const game = await startedGame(pair);
    const [black] = swap ? [game.b] : [game.a];
    await withBlack(game, black);
    const { black: blackCells, white: whiteCells } = drawLayout();
    const last = blackCells.at(-1)!;
    await setBoard(game, blackCells.slice(0, -1), whiteCells, interleave(blackCells.slice(0, -1), whiteCells));
    await expectOneMore(game, async () => {
      expect(await black.move(game.id, last % 15, Math.floor(last / 15), 225)).toBe(true);
    });
    expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "draw", winner_seat: null });
  });

  it.each(["a", "b"] as const)("a resignation by player %s counts once, also when repeated", async (who) => {
    const game = await startedGame(pair);
    const resigner = game[who];
    if (!resigner.resign) return; // an agent cannot resign: the human of the pair covers the path
    const other = who === "a" ? game.b : game.a;
    await expectOneMore(game, async () => {
      await resigner.resign!(game.id);
      await resigner.resign!(game.id);
      await other.resign?.(game.id);
    });
    expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "resignation" });
  });

  describe.each(orders)("a loss on time (swapped colours: %s)", (swap) => {
    const sides = (game: Game) => (swap ? { loser: game.b, winner: game.a } : { loser: game.a, winner: game.b });

    it("is settled by a read of the opponent", async () => {
      const game = await startedGame(pair);
      const { loser, winner } = sides(game);
      await withBlack(game, loser);
      await expireClock(game);
      await expectOneMore(game, async () => {
        await winner.read(game.id);
        await winner.read(game.id);
      });
      expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "timeout" });
    });

    it("is settled by the move of the player who ran out of time", async () => {
      const game = await startedGame(pair);
      const { loser } = sides(game);
      await withBlack(game, loser);
      await expireClock(game);
      await expectOneMore(game, async () => {
        expect(await loser.move(game.id, 7, 7, 1)).toBe(false);
      });
      expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "timeout", move_count: 0 });
    });

    it("is settled by a resignation of the opponent, who loses the race to the clock", async () => {
      const game = await startedGame(pair);
      const { loser, winner } = sides(game);
      if (!winner.resign) return;
      await withBlack(game, loser);
      await expireClock(game);
      await expectOneMore(game, () => winner.resign!(game.id));
      expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "timeout" });
    });

    it("is settled lazily when the player who ran out of time starts a new game (BR-13)", async () => {
      const game = await startedGame(pair);
      const { loser } = sides(game);
      if (!loser.newGame) return;
      await withBlack(game, loser);
      await expireClock(game);
      await expectOneMore(game, () => loser.newGame!());
      expect(await gameRow(game.id)).toMatchObject({ status: "finished", end_reason: "timeout" });
    });
  });
});

async function expectNone(_game: Game, action: () => Promise<unknown>) {
  const before = await counters();
  await action();
  expect(await counters()).toEqual(before);
}

describe("races and retries", () => {
  it("counts a winning move, a resignation and a read that race for the end of one game once", async () => {
    for (let round = 0; round < 3; round++) {
      const game = await startedGame("account-account");
      await withBlack(game, game.a);
      await nearFive(game);
      await expectOneMore(game, () =>
        Promise.all([
          game.a.move(game.id, 7, 7, 9),
          game.b.resign!(game.id),
          game.b.move(game.id, 0, 1, 9),
          game.b.read(game.id),
          game.a.resign!(game.id),
        ]),
      );
      expect((await gameRow(game.id)).status).toBe("finished");
    }
  });

  it("counts a loss on time that a move, a resignation, a read and a new game find at once exactly once", async () => {
    for (let round = 0; round < 3; round++) {
      const game = await startedGame("account-guest");
      await withBlack(game, game.a);
      await expireClock(game);
      await expectOneMore(game, () =>
        Promise.all([
          game.a.move(game.id, 7, 7, 1),
          game.b.resign!(game.id),
          game.b.read(game.id),
          game.a.newGame!(),
          game.a.read(game.id),
        ]),
      );
      expect((await gameRow(game.id)).status).toBe("finished");
    }
  });
});

describe("games that are not finished", () => {
  it("do not change the counters: waiting, cancelled and running", async () => {
    const waitingResponse = await rest("POST", "/api/games", { acknowledgedGuestWarning: true });
    const cookie = cookieOf(waitingResponse);
    const waiting = await json(waitingResponse);
    const running = await startedGame("account-guest");
    await running.a.move(running.id, 7, 7, 1);
    await expectNone(running, async () => {
      // Starting another game with `cancelOwnWaitingGame` cancels the waiting one.
      const second = await rest("POST", "/api/games", { acknowledgedGuestWarning: true, cancelOwnWaitingGame: true }, cookie);
      expect(second.status).toBe(201);
      const [first] = await run(`select status from games where id = ?`, [waiting.data.gameId]);
      expect(first!.status).toBe("cancelled");
      await running.b.read(running.id);
    });
    expect((await gameRow(running.id)).status).toBe("active");
  });
});

describe("the counter in the transaction", () => {
  const finishSql = `update games set status = 'finished', winner_seat = 1, end_reason = 'resignation', finished_at = now() where id = ?`;

  it("is rolled back together with the finish, and a call on a running game counts nothing", async () => {
    const game = await startedGame("account-account");
    await expectNone(game, async () => {
      await expect(
        orm.em.fork().transactional(async (tx) => {
          await tx.execute(finishSql, [game.id], "run");
          await recordFinishedGame(tx, game.id);
          throw new Error("boom after the counter");
        }),
      ).rejects.toThrow("boom after the counter");
      await orm.em.fork().transactional((tx) => recordFinishedGame(tx, game.id));
    });
    expect((await gameRow(game.id)).status).toBe("active");

    await expectOneMore(game, () =>
      orm.em.fork().transactional(async (tx) => {
        await tx.execute(finishSql, [game.id], "run");
        await recordFinishedGame(tx, game.id);
      }),
    );
  });
});

describe("durability", () => {
  it("is not reduced by db:cleanup removing a finished guest-guest or guest-agent game", async () => {
    for (const pair of ["guest-guest", "agent-guest"] as const) {
      const game = await startedGame(pair);
      await expectOneMore(game, () => game.a.resign!(game.id));
      await run(`update games set finished_at = now() - interval '2 hours' where id = ?`, [game.id]);

      await expectNone(game, async () => {
        const result = await cleanupExpired({ em: orm.em.fork(), now: new Date() });
        expect(result.errors).toEqual([]);
        expect(result.guestOnlyFinishedGames).toBeGreaterThanOrEqual(1);
      });
      expect(await run(`select 1 from games where id = ?`, [game.id])).toEqual([]);
    }
  });

  it("is not reduced by deleting an account that played,", async () => {
    const game = await startedGame("account-account");
    await expectOneMore(game, () => game.a.resign!(game.id));
    await expectNone(game, async () => {
      await run(`delete from users where id in (select user_id from game_players where game_id = ?)`, [game.id]);
    });
    expect(await run(`select kind from game_players where game_id = ? order by seat`, [game.id])).toEqual([
      { kind: "account" },
      { kind: "account" },
    ]);
  });

  it("stores only a day, two kinds and a number: no keys to games or people", async () => {
    const columns = await run(
      `select column_name from information_schema.columns where table_name = 'game_pair_counters' order by column_name`,
    );
    expect(columns.map((row) => row.column_name)).toEqual(["day", "finished_count", "kind_a", "kind_b"]);
    const references = await run(
      `select 1 from pg_constraint where contype = 'f' and (conrelid = 'game_pair_counters'::regclass or confrelid = 'game_pair_counters'::regclass)`,
    );
    expect(references).toEqual([]);
  });
});

describe("the day in Europe/Warsaw and the read model", () => {
  const YEAR = "2001";
  afterAll(async () => {
    await run(`delete from game_pair_counters where day < '2002-01-01'`);
    await run(`delete from games where finished_at < '2002-01-01'`);
  });

  async function finishedAt(at: string, kinds: [Kind, Kind]) {
    const [row] = await run(
      `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason)
       values ('invite', 'finished', ?::timestamptz - interval '5 minutes', ?::timestamptz, 1, 1, 'resignation') returning id`,
      [at, at],
    );
    for (const [index, kind] of kinds.entries()) {
      await run(
        kind === "agent"
          ? `insert into game_players (game_id, seat, kind, join_channel, is_active) values (?, ?, 'agent', 'mcp', false)`
          : `insert into game_players (game_id, seat, kind, is_active) values (?, ?, ?, false)`,
        kind === "agent" ? [row!.id, index + 1] : [row!.id, index + 1, kind],
      );
    }
    await orm.em.fork().transactional((tx) => recordFinishedGame(tx, row!.id as string));
  }

  it("takes the day of finished_at in Warsaw time, summer and winter", async () => {
    await finishedAt(`${YEAR}-06-15T22:30:00Z`, ["guest", "guest"]); // 00:30 on the 16th (UTC+2)
    await finishedAt(`${YEAR}-06-15T21:30:00Z`, ["guest", "guest"]); // 23:30 on the 15th
    await finishedAt(`${YEAR}-12-10T23:30:00Z`, ["account", "guest"]); // 00:30 on the 11th (UTC+1)
    await finishedAt(`${YEAR}-12-10T22:30:00Z`, ["account", "guest"]); // 23:30 on the 10th
    await finishedAt(`${YEAR}-10-27T22:30:00Z`, ["account", "account"]); // 00:30 on the 28th (still UTC+2)
    await finishedAt(`${YEAR}-10-28T22:30:00Z`, ["account", "account"]); // 23:30 on the 28th (UTC+1 after the change)
    const rows = await run(
      `select day::text as day, kind_a || '-' || kind_b as pair, finished_count from game_pair_counters where day < '2002-01-01' order by day, pair`,
    );
    expect(rows).toEqual([
      { day: `${YEAR}-06-15`, pair: "guest-guest", finished_count: 1 },
      { day: `${YEAR}-06-16`, pair: "guest-guest", finished_count: 1 },
      { day: `${YEAR}-10-28`, pair: "account-account", finished_count: 2 },
      { day: `${YEAR}-12-10`, pair: "account-guest", finished_count: 1 },
      { day: `${YEAR}-12-11`, pair: "account-guest", finished_count: 1 },
    ]);
  });

  it("windows today and the last 7 days by the Warsaw day of the clock, and lists an unknown kind", async () => {
    await run(`delete from game_pair_counters where day < '2002-01-01'`);
    const seed = (day: string, a: string, b: string, n: number) =>
      run(`insert into game_pair_counters (day, kind_a, kind_b, finished_count) values (?, ?, ?, ?)`, [day, a, b, n]);
    await seed("2001-03-11", "account", "account", 2);
    await seed("2001-03-10", "account", "account", 1);
    await seed("2001-03-05", "agent", "guest", 4); // today - 6: still in the window
    await seed("2001-03-04", "agent", "guest", 8); // today - 7: out
    await seed("2001-03-12", "guest", "guest", 16); // tomorrow: not "last 7 days"
    await seed("2001-03-11", "account", "robot", 1);

    // 23:30 UTC on the 10th is already the 11th in Warsaw.
    const stats = await readFinishedGameStats(orm.em.fork(), new Date("2001-03-10T23:30:00Z"));

    const by = (pair: string) => stats.pairs.find((entry) => entry.pair === pair)!;
    // `total` is all time (the games played by the other tests count too): compare with the table.
    const totalOf = async (pair: string) =>
      (await run(`select sum(finished_count)::int as n from game_pair_counters where kind_a || '-' || kind_b = ?`, [pair]))[0]!.n;
    expect(by("account-account")).toMatchObject({ total: await totalOf("account-account"), today: 2, last7Days: 3 });
    expect(by("agent-guest")).toMatchObject({ total: await totalOf("agent-guest"), today: 0, last7Days: 4 });
    expect(by("guest-guest")).toMatchObject({ total: await totalOf("guest-guest"), today: 0, last7Days: 0 });
    expect(by("account-account").total).toBeGreaterThanOrEqual(3);
    expect(stats.pairs.map(({ pair }) => pair).slice(5)).toEqual(["account-robot"]);
    expect(stats.pairs.slice(0, 5).map(({ pair }) => pair)).toEqual([
      "account-account",
      "account-guest",
      "account-agent",
      "guest-guest",
      "agent-guest",
    ]);
    expect(stats.timeZone).toBe("Europe/Warsaw");
  });
});

describe("npm run stats:games", () => {
  const env = () => ({ ...process.env, DATABASE_URL: inject("databaseUrl") });
  const stats = async () => {
    const { stdout, stderr } = await execFileAsync("npm", ["run", "-s", "stats:games"], { cwd: repoRoot, env: env() });
    expect(stderr).toBe("");
    expect(stdout.trim().split("\n")).toHaveLength(1);
    return { text: stdout, stats: JSON.parse(stdout) as Awaited<ReturnType<typeof readFinishedGameStats>> };
  };

  it("prints one JSON line that moves by exactly the games finished meanwhile, with no personal data", async () => {
    const before = (await stats()).stats;
    const g1 = await startedGame("account-account");
    const g2 = await startedGame("account-account");
    const g3 = await startedGame("account-agent");
    await g1.a.resign!(g1.id);
    await g2.b.resign!(g2.id);
    await g3.a.resign!(g3.id);
    const { text, stats: after } = await stats();

    const delta = (pair: string, key: "total" | "today" | "last7Days") =>
      after.pairs.find((p) => p.pair === pair)![key] - before.pairs.find((p) => p.pair === pair)![key];
    expect(delta("account-account", "total")).toBe(2);
    expect(delta("account-agent", "total")).toBe(1);
    expect(delta("account-guest", "total") + delta("guest-guest", "total") + delta("agent-guest", "total")).toBe(0);
    expect(after.total - before.total).toBe(3);
    expect(delta("account-account", "last7Days")).toBe(2);
    expect(after.timeZone).toBe("Europe/Warsaw");
    // The output has no e-mails, ids or names.
    expect(text).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it("exits 1 with a masked message on stderr when the database is unreachable, and reads only", async () => {
    const failure = await execFileAsync("npm", ["run", "-s", "stats:games"], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: "postgresql://gomoku:s3cretpw@127.0.0.1:1/gomoku" },
    }).catch((error: { code: number; stdout: string; stderr: string }) => error);
    expect(failure).toMatchObject({ code: 1, stdout: "" });
    expect((failure as { stderr: string }).stderr).not.toContain("s3cretpw");
    expect(JSON.parse((failure as { stderr: string }).stderr.trim())).toMatchObject({ ok: false });
  });
});
