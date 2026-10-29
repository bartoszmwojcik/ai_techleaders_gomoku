// Moves over HTTP (E02 phase 3, #22) against the built app and a real PostgreSQL: a game to
// five in a row, a draw and a five with the 225th stone (boards written straight into the
// database, they pass every CHECK), retries, races and the error codes.
import { createOrm, type Orm } from "@gomoku/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
const execFileAsync = promisify(execFile);

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});
const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

let addressCounter = 0;
const nextAddress = () => `198.18.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

type Headers = Record<string, string | null>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST", path: string, body?: unknown, headers: Headers = {}) {
  const merged: Headers = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": nextAddress(),
    ...headers,
  };
  const sent = Object.fromEntries(
    Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== null),
  );
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: sent,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const cookieOf = (response: Response): string =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `moves-${n}@example.com`,
    displayName: `Moves_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Game = { gameId: string; black: string; white: string; blackSeat: 1 | 2 };

/** A started game between two accounts; `black` / `white` are the cookies by the drawn colour. */
async function startedGame(): Promise<Game> {
  const alice = await signedUp();
  const bob = await signedUp();
  const created = await call("POST", "/api/games", {}, { cookie: alice });
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  const joined = await call("POST", `/api/invitations/${data.invitation.code}/accept`, { as: "user" }, { cookie: bob });
  expect(joined.status).toBe(200);
  const [game] = await run(`select black_seat from games where id = ?`, [data.gameId]);
  const blackSeat = game!.black_seat as 1 | 2;
  return {
    gameId: data.gameId,
    blackSeat,
    black: blackSeat === 1 ? alice : bob,
    white: blackSeat === 1 ? bob : alice,
  };
}

const cell = (x: number, y: number) => y * 15 + x;
const move = (game: string, cookie: string | undefined, x: number, y: number, moveNumber: number) =>
  call("POST", `/api/games/${game}/moves`, { x, y, moveNumber }, cookie ? { cookie } : {});
const stateOf = async (game: string, cookie: string, after?: number) => {
  const response = await call("GET", `/api/games/${game}${after === undefined ? "" : `?after=${after}`}`, undefined, { cookie });
  return { status: response.status, body: (await response.json()) as { ok: boolean; data: Json; error?: Json } };
};
const body = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const errorCode = async (response: Response) => (await body(response)).error.code;

/** Plays `moves` alternately, black first, expecting each to be accepted. */
async function playAll(game: Game, moves: [number, number][]) {
  let last: Response | undefined;
  for (const [index, [x, y]] of moves.entries()) {
    last = await move(game.gameId, index % 2 === 0 ? game.black : game.white, x, y, index + 1);
    expect(last.status, `move ${index + 1}`).toBe(200);
  }
  return last!;
}

async function setBoard(game: Game, black: number[], white: number[], moves: number[]) {
  const bits = (cells: number[]) =>
    Array.from({ length: 225 }, (_, c) => (cells.includes(c) ? "1" : "0")).join("");
  await run(
    `update games set stones_black = ?::bit(225), stones_white = ?::bit(225), moves = ?::bytea, move_count = ? where id = ?`,
    [bits(black), bits(white), Buffer.from(moves), moves.length, game.gameId],
  );
}

/**
 * The statements PostgreSQL ran while `action` was running, read from the container log
 * (`log_statement = all`, switched on without a restart). Markers (`select 'marker'`) delimit the
 * window; the files run one after another, so nothing else talks to the database in between.
 */
async function statementsDuring(action: () => Promise<unknown>): Promise<string[]> {
  const port = new URL(inject("databaseUrl")).port;
  const { stdout } = await execFileAsync("docker", ["ps", "--filter", `publish=${port}`, "--format", "{{.ID}}"]);
  const container = stdout.trim().split("\n")[0]!;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const logs = async () => (await execFileAsync("docker", ["logs", container], { maxBuffer: 1 << 28 })).stderr;
  await run(`alter system set log_statement = 'all'`);
  await run(`select pg_reload_conf()`);
  // The pooled connections of the app pick the new setting up on their next command; make sure of it.
  await new Promise((done) => setTimeout(done, 500));
  await run(`select 'start-${id}'`);
  await action();
  await run(`select 'end-${id}'`);
  let text = "";
  for (let attempt = 0; attempt < 50 && !text.includes(`end-${id}'`); attempt++) {
    text = await logs();
    if (!text.includes(`end-${id}'`)) await new Promise((done) => setTimeout(done, 100));
  }
  await run(`alter system reset log_statement`);
  await run(`select pg_reload_conf()`);
  // A log entry starts with a timestamp; a multi-line statement continues on the lines after it.
  const lines = text.split(/\n(?=\d{4}-\d\d-\d\d )/).filter((entry) => /LOG:\s+(statement|execute [^:]*):/.test(entry));
  const from = lines.findIndex((line) => line.includes(`start-${id}`));
  const to = lines.findIndex((line) => line.includes(`end-${id}`));
  expect(from, "start marker in the log").toBeGreaterThanOrEqual(0);
  expect(to, "end marker in the log").toBeGreaterThan(from);
  return lines.slice(from + 1, to).map((line) => line.replace(/^[^]*?LOG:\s+(statement|execute [^:]*):\s*/, "").replace(/'[^']*'/g, "?").replace(/= \d+/g, "= ?").replace(/\s+/g, " ").trim());
}

describe("a game to five in a row over HTTP", () => {
  it("plays alternately, serves new moves with `after`, ends with the winning line and is idempotent after the end", async () => {
    const game = await startedGame();
    const blackRow = [3, 4, 5, 6, 7].map((x) => [x, 7] as [number, number]);
    const whiteRow = [0, 1, 2, 3].map((x) => [x, 0] as [number, number]);
    const sequence = blackRow.flatMap((m, i) => (i < 4 ? [m, whiteRow[i]!] : [m]));

    const first = await move(game.gameId, game.black, 3, 7, 1);
    expect(first.status).toBe(200);
    const afterFirst = (await body(first)).data;
    expect(afterFirst).toMatchObject({
      status: "active",
      moveCount: 1,
      blackSeat: game.blackSeat,
      turnSeat: game.blackSeat === 1 ? 2 : 1,
      moves: [cell(3, 7)],
      result: null,
    });

    for (const [index, [x, y]] of sequence.slice(1).entries()) {
      const number = index + 2;
      const response = await move(game.gameId, number % 2 === 1 ? game.black : game.white, x, y, number);
      expect(response.status, `move ${number}`).toBe(200);
    }

    // The opponent polls with the number of moves it knows.
    const polled = await stateOf(game.gameId, game.white, 7);
    expect(polled.body.data.moves).toEqual([cell(3, 0), cell(7, 7)]);

    const finished = (await stateOf(game.gameId, game.white)).body.data;
    expect(finished).toMatchObject({
      status: "finished",
      moveCount: 9,
      turnSeat: null,
      result: {
        winnerSeat: game.blackSeat,
        reason: "five_in_row",
        winLine: [3, 4, 5, 6, 7].map((x) => cell(x, 7)),
      },
    });
    expect(finished.moves).toHaveLength(9);

    // Both slots were freed in the same transaction (BR-13).
    const slots = await run(`select is_active from game_players where game_id = ?`, [game.gameId]);
    expect(slots.map((row) => row.is_active)).toEqual([false, false]);
    const [row] = await run(`select status, end_reason, winner_seat, finished_at from games where id = ?`, [game.gameId]);
    expect(row).toMatchObject({ status: "finished", end_reason: "five_in_row", winner_seat: game.blackSeat });
    expect(row!.finished_at).not.toBeNull();

    // A retry of the move that ended the game is answered 200; any other move is GAME_FINISHED.
    const retry = await move(game.gameId, game.black, 7, 7, 9);
    expect(retry.status).toBe(200);
    expect((await body(retry)).data.result.reason).toBe("five_in_row");
    const late = await move(game.gameId, game.white, 9, 9, 10);
    expect(late.status).toBe(409);
    expect(await errorCode(late)).toBe("GAME_FINISHED");
    // The loser may open the finished game again.
    expect((await stateOf(game.gameId, game.white)).status).toBe(200);
  });

  it.each([
    ["vertical", [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]]],
    ["diagonal down", [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]]],
    ["diagonal up", [[3, 9], [4, 8], [5, 7], [6, 6], [7, 5]]],
  ] as const)("wins on a %s line", async (_name, line) => {
    const game = await startedGame();
    const filler: [number, number][] = [[0, 0], [2, 0], [4, 0], [6, 0]];
    const sequence = line.flatMap((m, i) => (i < 4 ? [m, filler[i]!] : [m])) as [number, number][];
    await playAll(game, sequence);
    const state = (await stateOf(game.gameId, game.black)).body.data;
    expect(state.result).toMatchObject({ reason: "five_in_row" });
    expect(state.result.winLine).toEqual(line.map(([x, y]) => cell(x, y)).sort((a, b) => a - b));
  });

  it("plays a game as a guest in seat 2", async () => {
    const alice = await signedUp();
    const created = await call("POST", "/api/games", {}, { cookie: alice });
    const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
    const joined = await call("POST", `/api/invitations/${data.invitation.code}/accept`, {
      as: "guest",
      acknowledgedGuestWarning: true,
    });
    const guest = (joined.headers.getSetCookie?.() ?? []).find((l) => l.startsWith("gomoku_guest="))!.split(";")[0]!;
    const [row] = await run(`select black_seat from games where id = ?`, [data.gameId]);
    const [black, white] = row!.black_seat === 1 ? [alice, guest] : [guest, alice];
    expect((await move(data.gameId, black, 7, 7, 1)).status).toBe(200);
    const reply = await move(data.gameId, white, 8, 7, 2);
    expect(reply.status).toBe(200);
    expect((await body(reply)).data.moves).toEqual([cell(8, 7)]);
  });
});

describe("a state read with a bad `after`", () => {
  it("answers 400 and changes nothing, and a valid read marks the page as seen", async () => {
    const game = await startedGame();
    await run(`update game_players set seen_at = null where game_id = ?`, [game.gameId]);
    for (const [index, [x, y]] of ([[7, 7], [8, 8], [7, 8]] as [number, number][]).entries()) {
      expect((await move(game.gameId, index % 2 === 0 ? game.black : game.white, x, y, index + 1)).status).toBe(200);
    }
    const seen = () => run(`select count(seen_at)::int as seen from game_players where game_id = ?`, [game.gameId]);

    const refused = await stateOf(game.gameId, game.black, 200);
    expect(refused.status).toBe(400);
    expect(refused.body.error?.code).toBe("VALIDATION");
    // A refused request has no lasting effect. (The 400 is raised before the lazy writes as an
    // optimization: no wasted writes or locks; the outcome would be the same after a rollback.)
    expect(await seen()).toEqual([{ seen: 0 }]);

    // The edge: `after` equal to the number of moves is valid and marks the page as seen.
    const edge = await stateOf(game.gameId, game.black, 3);
    expect(edge.status).toBe(200);
    expect(edge.body.data.moves).toEqual([]);
    expect(await seen()).toEqual([{ seen: 1 }]);
    expect((await stateOf(game.gameId, game.black, 200)).status).toBe(400);
    expect(await seen()).toEqual([{ seen: 1 }]);
  });
});

describe("rejected moves", () => {
  it("answers the documented codes and changes nothing", async () => {
    const game = await startedGame();

    expect(await errorCode(await move(game.gameId, game.white, 1, 1, 1))).toBe("NOT_YOUR_TURN");
    expect(await errorCode(await move(game.gameId, game.black, 1, 1, 5))).toBe("STALE_MOVE");
    expect((await move(game.gameId, game.black, 7, 7, 1)).status).toBe(200);
    expect(await errorCode(await move(game.gameId, game.white, 7, 7, 2))).toBe("CELL_OCCUPIED");
    expect(await errorCode(await move(game.gameId, game.black, 1, 1, 2))).toBe("NOT_YOUR_TURN");
    // A different cell under a number that is already taken by the same player.
    expect(await errorCode(await move(game.gameId, game.black, 9, 9, 1))).toBe("NOT_YOUR_TURN");

    const [row] = await run(`select move_count, octet_length(moves) as length from games where id = ?`, [game.gameId]);
    expect(row).toEqual({ move_count: 1, length: 1 });
  });

  it("answers 400, 403 and 404 before the rules", async () => {
    const game = await startedGame();
    const stranger = await signedUp();
    const url = `/api/games/${game.gameId}/moves`;

    expect((await call("POST", url, { x: 15, y: 0, moveNumber: 1 }, { cookie: game.black })).status).toBe(400);
    expect((await call("POST", url, { x: 1.5, y: 0, moveNumber: 1 }, { cookie: game.black })).status).toBe(400);
    expect((await call("POST", url, { x: 1, y: 0 }, { cookie: game.black })).status).toBe(400);
    expect((await call("POST", url, { x: 1, y: 0, moveNumber: 1 }, { cookie: game.black, "x-gomoku-request": null })).status).toBe(403);
    expect((await call("POST", url, { x: 1, y: 0, moveNumber: 1 }, { cookie: game.black, origin: "https://evil.example" })).status).toBe(403);
    expect((await move(game.gameId, stranger, 1, 0, 1)).status).toBe(404);
    expect((await move(game.gameId, undefined, 1, 0, 1)).status).toBe(404);
    expect((await move("not-a-uuid", game.black, 1, 0, 1)).status).toBe(404);
    expect((await stateOf(game.gameId, game.black, 99)).status).toBe(400);
    expect((await stateOf(game.gameId, game.black, -1)).status).toBe(400);
  });

  it("refuses a move in a game that is still waiting", async () => {
    const alice = await signedUp();
    const created = await call("POST", "/api/games", {}, { cookie: alice });
    const { data } = (await created.json()) as { data: { gameId: string } };
    const response = await move(data.gameId, alice, 7, 7, 1);
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("GAME_NOT_ACTIVE");
  });

  it("refuses a move in a cancelled game", async () => {
    const alice = await signedUp();
    const created = await call("POST", "/api/games", {}, { cookie: alice });
    const { data } = (await created.json()) as { data: { gameId: string } };
    expect((await call("POST", `/api/games/${data.gameId}/cancel`, {}, { cookie: alice })).status).toBe(200);
    expect(await errorCode(await move(data.gameId, alice, 7, 7, 1))).toBe("GAME_NOT_ACTIVE");
  });
});

describe("races", () => {
  it("writes a move once when the same move is sent in parallel (double click)", async () => {
    const game = await startedGame();
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => move(game.gameId, game.black, 7, 7, 1)),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));
    const [row] = await run(`select move_count, octet_length(moves) as length from games where id = ?`, [game.gameId]);
    expect(row).toEqual({ move_count: 1, length: 1 });
  });

  it("accepts exactly one of two different parallel moves by the same player", async () => {
    const game = await startedGame();
    const statuses = (
      await Promise.all([move(game.gameId, game.black, 7, 7, 1), move(game.gameId, game.black, 8, 8, 1)])
    ).map((r) => r.status);
    expect(statuses.sort()).toEqual([200, 409]);
    const [row] = await run(`select move_count from games where id = ?`, [game.gameId]);
    expect(row!.move_count).toBe(1);
  });

  it("serializes both players moving at once: black is accepted, white is told it is not their turn", async () => {
    const game = await startedGame();
    const [black, white] = await Promise.all([
      move(game.gameId, game.black, 7, 7, 1),
      move(game.gameId, game.white, 8, 8, 1),
    ]);
    expect(black.status).toBe(200);
    expect(white.status).toBe(409);
    expect(["NOT_YOUR_TURN", "STALE_MOVE"]).toContain(await errorCode(white));
  });

  it("a move waits for a concurrent ending of the game and then gets GAME_FINISHED", async () => {
    const game = await startedGame();
    expect((await move(game.gameId, game.black, 7, 7, 1)).status).toBe(200);
    let pending: Promise<Response> | undefined;
    // Stands in for the resignation of the opponent: it holds the row lock while the move arrives.
    await orm.em.fork().transactional(async (tx) => {
      await tx.execute(`select id from games where id = ? for update`, [game.gameId]);
      pending = move(game.gameId, game.white, 8, 8, 2);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await tx.execute(
        `update games set status = 'finished', winner_seat = ?, end_reason = 'resignation', finished_at = now() where id = ?`,
        [game.blackSeat, game.gameId],
      );
      await tx.execute(`update game_players set is_active = false where game_id = ?`, [game.gameId]);
    });
    const response = await pending!;
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("GAME_FINISHED");
    const state = (await stateOf(game.gameId, game.black)).body.data;
    expect(state.result).toEqual({ winnerSeat: game.blackSeat, reason: "resignation", winLine: null });
    expect(state.moveCount).toBe(1);
  });

  it("cancelling an active game is refused while moves are possible", async () => {
    const game = await startedGame();
    const alice = game.blackSeat === 1 ? game.black : game.white;
    const [cancel, played] = await Promise.all([
      call("POST", `/api/games/${game.gameId}/cancel`, {}, { cookie: alice }),
      move(game.gameId, game.black, 7, 7, 1),
    ]);
    expect(cancel.status).toBe(409);
    expect(played.status).toBe(200);
  });
});

describe("the end of the board", () => {
  /** 113 black and 112 white cells with no run of five in any line. */
  const drawLayout = () => {
    const cells = Array.from({ length: 225 }, (_, c) => c);
    const black = cells.filter((c) => (Math.floor((c % 15) / 2) + Math.floor(c / 15)) % 2 === 0);
    return { black, white: cells.filter((c) => !black.includes(c)) };
  };
  const interleave = (black: number[], white: number[]) =>
    black.flatMap((c, i) => (i < white.length ? [c, white[i]!] : [c]));

  it("ends in a draw when the 225th stone completes no five", async () => {
    const game = await startedGame();
    const { black, white } = drawLayout();
    const last = black.at(-1)!;
    await setBoard(game, black.slice(0, -1), white, interleave(black.slice(0, -1), white));

    const response = await move(game.gameId, game.black, last % 15, Math.floor(last / 15), 225);

    expect(response.status).toBe(200);
    const state = (await body(response)).data;
    expect(state).toMatchObject({
      status: "finished",
      moveCount: 225,
      turnSeat: null,
      result: { winnerSeat: null, reason: "draw", winLine: null },
    });
    expect(state.moves).toEqual([last]);
    const [row] = await run(
      `select status, end_reason, winner_seat, (bit_count(stones_black) + bit_count(stones_white))::int as stones,
        pg_column_size(games.*) as row_bytes from games where id = ?`,
      [game.gameId],
    );
    expect(row).toMatchObject({ status: "finished", end_reason: "draw", winner_seat: null, stones: 225 });
    // Whole board and history in one row: well under a kilobyte (spec: about 300 B).
    expect(row!.row_bytes).toBeLessThan(700);
    const slots = await run(`select is_active from game_players where game_id = ?`, [game.gameId]);
    expect(slots.every((r) => r.is_active === false)).toBe(true);
    // Retry of the final move, and a move on the full board.
    expect((await move(game.gameId, game.black, last % 15, Math.floor(last / 15), 225)).status).toBe(200);
    expect(await errorCode(await move(game.gameId, game.white, 0, 0, 225))).toBe("GAME_FINISHED");
  });

  it("runs the same statements for move 1 and move 100, and the whole game stays in one small row", async () => {
    const early = await startedGame();
    const late = await startedGame();
    const { black, white } = drawLayout();
    await setBoard(late, black.slice(0, 50), white.slice(0, 49), interleave(black.slice(0, 50), white.slice(0, 49)));
    const cellOf = (c: number) => [c % 15, Math.floor(c / 15)] as const;

    const first = await statementsDuring(async () => {
      expect((await move(early.gameId, early.black, 7, 7, 1)).status).toBe(200);
    });
    const [lx, ly] = cellOf(white[49]!);
    const hundredth = await statementsDuring(async () => {
      expect((await move(late.gameId, late.white, lx, ly, 100)).status).toBe(200);
    });

    // Spec #22: a hot path of a constant number of statements (lock + update + the state read), no loop over moves.
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(12);
    expect(hundredth).toEqual(first);

    // The same game played to the 225th stone: the row of a finished game, history included.
    const full = await startedGame();
    await setBoard(full, black.slice(0, -1), white, interleave(black.slice(0, -1), white));
    const last = black.at(-1)!;
    expect((await move(full.gameId, full.black, last % 15, Math.floor(last / 15), 225)).status).toBe(200);
    const [row] = await run(`select pg_column_size(games.*) as row_bytes, octet_length(moves) as moves_bytes from games where id = ?`, [full.gameId]);
    // Spec #22 estimated "about 300 B"; measured on PostgreSQL 17: 402 B for the whole row, of which
    // the 225 B of `moves` alone plus 2 x 33 B of bitboards already make 291 B, and the rest are
    // ids, timestamps and status fields. The bound keeps ~10% headroom over the measurement.
    expect(row!.moves_bytes).toBe(225);
    expect(row!.row_bytes).toBeLessThan(450);
  });

  it("a five with the 225th stone wins instead of a draw", async () => {
    const game = await startedGame();
    const { black: layoutBlack, white: layoutWhite } = drawLayout();
    // Row 0 gets black at x = 2, 3; two other black stones turn white to keep 113 / 112.
    const black = new Set([...layoutBlack, cell(2, 0), cell(3, 0)]);
    const white = new Set(layoutWhite);
    white.delete(cell(2, 0));
    white.delete(cell(3, 0));
    for (const c of [cell(0, 2), cell(1, 2)]) {
      black.delete(c);
      white.add(c);
    }
    const last = cell(2, 0);
    black.delete(last);
    await setBoard(game, [...black], [...white], interleave([...black], [...white]));

    const response = await move(game.gameId, game.black, 2, 0, 225);

    expect(response.status).toBe(200);
    expect((await body(response)).data.result).toEqual({
      winnerSeat: game.blackSeat,
      reason: "five_in_row",
      winLine: [0, 1, 2, 3, 4, 5],
    });
  });

  it("the database refuses a stone on an occupied cell even if the code were wrong", async () => {
    const game = await startedGame();
    expect((await move(game.gameId, game.black, 7, 7, 1)).status).toBe(200);
    await expect(
      run(
        `update games set stones_white = stones_black, moves = moves || ?::bytea, move_count = move_count + 1 where id = ?`,
        [Buffer.from([cell(7, 7)]), game.gameId],
      ),
    ).rejects.toThrow(/games_board_disjoint_check/);
  });
});
