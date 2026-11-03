// The paper and pencil variant (E11) over HTTP against the built app and a real PostgreSQL: creating
// the game with its clock, joining, the rules of the sheet (first stone in the middle, at most 3 cells
// from another), points for fives, the loss on time of the player who trails, the phase of the automat
// (the leader's stones put by the server), a draw, a resignation of the leader, and the classic game
// unchanged next to it. Time is moved by writing `turn_started_at` straight into the database.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

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
const nextAddress = () => `198.20.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": nextAddress(),
  };
  if (cookie) headers.cookie = cookie;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `paper-${n}@example.com`,
    displayName: `Paper_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Game = { gameId: string; black: string; white: string; blackSeat: 1 | 2; whiteSeat: 1 | 2 };
type Side = "black" | "white";

/** A started game (both players opened it, the clock runs) in the given variant. */
async function startedGame(body: object): Promise<Game> {
  const creator = await signedUp();
  const joiner = await signedUp();
  const created = await call("POST", "/api/games", body, creator);
  expect(created.status).toBe(201);
  const { data } = await json(created);
  const joined = await call("POST", `/api/invitations/${data.invitation.code}/accept`, { as: "user" }, joiner);
  expect(joined.status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [data.gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  expect((await call("GET", `/api/games/${data.gameId}`, undefined, creator)).status).toBe(200);
  return {
    gameId: data.gameId,
    blackSeat,
    whiteSeat: blackSeat === 1 ? 2 : 1,
    black: blackSeat === 1 ? creator : joiner,
    white: blackSeat === 1 ? joiner : creator,
  };
}
const paperGame = (timeControlMs = 60_000) => startedGame({ variant: "paper", timeControlMs });

const state = async (game: Game, side: Side) => {
  const response = await call("GET", `/api/games/${game.gameId}`, undefined, game[side]);
  return { status: response.status, ...(await json(response)) };
};
const move = (game: Game, side: Side, x: number, y: number, moveNumber: number) =>
  call("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber }, game[side]);
const play = async (game: Game, side: Side, x: number, y: number, moveNumber: number) => {
  const response = await move(game, side, x, y, moveNumber);
  expect(response.status, `move ${moveNumber} at ${x},${y}`).toBe(200);
  return (await json(response)).data;
};
const resign = (game: Game, side: Side) => call("POST", `/api/games/${game.gameId}/resign`, undefined, game[side]);
const gameRow = async (game: Game) =>
  (await run(
    `select status, end_reason, winner_seat, move_count, clock_ms_1, clock_ms_2,
       (select count(*)::int from game_players where game_id = games.id and is_active) as active_slots
     from games where id = ?`,
    [game.gameId],
  ))[0]!;
const sheetRow = async (game: Game) =>
  (await run(`select move_count, score_1, score_2, auto_seat, pending_auto_at from paper_game_states where game_id = ?`, [game.gameId]))[0]!;
/** Pretends the current turn began `seconds` ago. */
const turnBegan = (game: Game, seconds: number) =>
  run(`update games set turn_started_at = now() - make_interval(secs => ?) where id = ?`, [seconds, game.gameId]);

const ROW_Y = 50;
const OTHER_Y = 52;
/**
 * Black five on y=50 (x 50..54) against white four on y=52 (x 50..53): 9 moves, white on turn,
 * black leads 1 : 0. Returns the number of the next move.
 */
async function blackLeads(game: Game): Promise<number> {
  let n = 1;
  for (let i = 0; i < 4; i += 1) {
    await play(game, "black", 50 + i, ROW_Y, n++);
    await play(game, "white", 50 + i, OTHER_Y, n++);
  }
  await play(game, "black", 54, ROW_Y, n++);
  return n;
}
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe("creating and joining a paper game", () => {
  it("stores the variant, the clock of each player and an empty sheet, and serves them", async () => {
    const creator = await signedUp();
    const created = await call("POST", "/api/games", { variant: "paper", timeControlMs: 120_000 }, creator);
    expect(created.status).toBe(201);
    const { gameId } = (await json(created)).data;

    const [row] = await run(`select variant, time_control_ms, clock_ms_1, clock_ms_2 from games where id = ?`, [gameId]);
    expect(row).toEqual({ variant: "paper", time_control_ms: 120_000, clock_ms_1: 120_000, clock_ms_2: 120_000 });
    const [sheet] = await run(`select move_count, score_1, score_2, auto_seat from paper_game_states where game_id = ?`, [gameId]);
    expect(sheet).toEqual({ move_count: 0, score_1: 0, score_2: 0, auto_seat: null });

    const view = (await json(await call("GET", `/api/games/${gameId}`, undefined, creator))).data;
    expect(view).toMatchObject({
      status: "waiting",
      variant: "paper",
      timeControlMs: 120_000,
      clock: { remainingMs: [120_000, 120_000], running: null },
      paper: { moveCount: 0, moves: [], scores: [0, 0], fives: [], autoSeat: null, autoMoveAt: null },
    });
  });

  it("gives the paper game three minutes by default and keeps the classic game at ten, without a sheet", async () => {
    const paper = await signedUp();
    const { gameId } = (await json(await call("POST", "/api/games", { variant: "paper" }, paper))).data;
    expect((await run(`select time_control_ms from games where id = ?`, [gameId]))[0]).toEqual({ time_control_ms: 180_000 });

    const classic = await signedUp();
    const made = (await json(await call("POST", "/api/games", {}, classic))).data;
    const [row] = await run(`select variant, time_control_ms from games where id = ?`, [made.gameId]);
    expect(row).toEqual({ variant: "classic", time_control_ms: 600_000 });
    expect(await run(`select 1 from paper_game_states where game_id = ?`, [made.gameId])).toEqual([]);
    const view = (await json(await call("GET", `/api/games/${made.gameId}`, undefined, classic))).data;
    expect(view).toMatchObject({ variant: "classic", timeControlMs: 600_000 });
    expect(view).not.toHaveProperty("paper");
  });

  it.each([
    ["a clock for the classic game", { timeControlMs: 60_000 }],
    ["an unknown clock", { variant: "paper", timeControlMs: 90_000 }],
    ["an unknown variant", { variant: "renju" }],
  ])("answers 400 to %s and creates nothing", async (_name, body) => {
    const creator = await signedUp();
    expect((await call("POST", "/api/games", body, creator)).status).toBe(400);
  });
});

describe("the rules of the sheet", () => {
  it("wants the first stone in the middle, at most 3 cells from another after that, and judges the turn", async () => {
    const game = await paperGame();
    const refused = async (response: Response, status: number, code?: string) => {
      expect(response.status).toBe(status);
      if (code) expect((await json(response)).error.code).toBe(code);
    };

    await refused(await move(game, "black", 10, 10, 1), 400, "FIRST_MOVE_CENTER");
    await refused(await move(game, "white", 50, 50, 1), 409, "NOT_YOUR_TURN");
    const first = await play(game, "black", 50, 50, 1);
    expect(first.paper.moves).toEqual([expect.objectContaining({ n: 1, x: 50, y: 50, seat: game.blackSeat, auto: false })]);

    // A retry of the same move is answered with the state, not refused.
    const again = await move(game, "black", 50, 50, 1);
    expect(again.status).toBe(200);
    expect((await json(again)).data.paper.moveCount).toBe(1);

    await refused(await move(game, "black", 51, 50, 2), 409, "NOT_YOUR_TURN");
    await refused(await move(game, "white", 50, 50, 2), 409, "CELL_OCCUPIED");
    await refused(await move(game, "white", 55, 50, 2), 400, "MOVE_TOO_FAR");
    await refused(await move(game, "white", 51, 50, 3), 409, "STALE_MOVE");
    await refused(await move(game, "white", 101, 50, 2), 400);
    expect((await sheetRow(game)).move_count).toBe(1);

    const second = await play(game, "white", 53, 50, 2);
    expect(second.paper.moveCount).toBe(2);
    expect(second.moveCount).toBe(2);
    expect(second.turnSeat).toBe(game.blackSeat);
    // The stone of the sheet is stored in paper_moves, none in the bitboards of the classic game.
    expect(await run(`select move_number, x, y, seat, is_auto from paper_moves where game_id = ? order by move_number`, [game.gameId])).toEqual([
      { move_number: 1, x: 50, y: 50, seat: game.blackSeat, is_auto: false },
      { move_number: 2, x: 53, y: 50, seat: game.whiteSeat, is_auto: false },
    ]);
  });

  it("scores a five as a point, goes on, and charges the clock of the player who moved", async () => {
    const game = await paperGame();
    await turnBegan(game, 5);
    await play(game, "black", 50, 50, 1);
    const [afterFirst] = await run(`select clock_ms_1, clock_ms_2 from games where id = ?`, [game.gameId]);
    const spent = (game.blackSeat === 1 ? afterFirst!.clock_ms_1 : afterFirst!.clock_ms_2) as number;
    expect(spent).toBeLessThanOrEqual(55_500);
    expect(spent).toBeGreaterThan(54_000);

    let n = 2;
    await play(game, "white", 50, OTHER_Y, n++);
    for (let i = 1; i < 4; i += 1) {
      await play(game, "black", 50 + i, ROW_Y, n++);
      await play(game, "white", 50 + i, OTHER_Y, n++);
    }
    const scored = await play(game, "black", 54, ROW_Y, n);
    const expected = game.blackSeat === 1 ? [1, 0] : [0, 1];
    expect(scored.status).toBe("active");
    expect(scored.paper.scores).toEqual(expected);
    expect(scored.paper.fives).toHaveLength(1);
    const sheet = await sheetRow(game);
    expect([sheet.score_1, sheet.score_2, sheet.move_count]).toEqual([...expected, 9]);
  });
});

describe("the end by time", () => {
  it("ends the game for the player who runs out of time while trailing; the leader wins on points", async () => {
    const game = await paperGame();
    await blackLeads(game);

    await turnBegan(game, 61);
    const seen = await state(game, "black");

    expect(seen.status).toBe(200);
    expect(seen.data).toMatchObject({
      status: "finished",
      result: { winnerSeat: game.blackSeat, reason: "points" },
      paper: { autoSeat: null },
    });
    expect(await gameRow(game)).toMatchObject({ status: "finished", end_reason: "points", winner_seat: game.blackSeat, active_slots: 0 });
    // A move after the end is refused and writes nothing.
    const late = await move(game, "white", 50, 54, 10);
    expect(late.status).toBe(409);
    expect((await json(late)).error.code).toBe("GAME_FINISHED");
    expect((await sheetRow(game)).move_count).toBe(9);
  });

  it("is a draw when the scores are level", async () => {
    const game = await paperGame();
    await play(game, "black", 50, 50, 1);
    await play(game, "white", 51, 50, 2);

    await turnBegan(game, 61);
    const seen = await state(game, "white");

    expect(seen.data).toMatchObject({ status: "finished", result: { winnerSeat: null, reason: "points" } });
    expect(await gameRow(game)).toMatchObject({ status: "finished", end_reason: "points", winner_seat: null, active_slots: 0 });
  });
});

describe("the phase of the automat", () => {
  it("puts the leader's stones next to the opponent's last one, runs the opponent's clock without a break and ends by points", async () => {
    const game = await paperGame();
    let n = await blackLeads(game);
    await play(game, "white", 50, 54, n++);

    // The leader (black, on turn) runs out of time: the automat plays for it at that moment.
    await turnBegan(game, 61);
    const taken = (await state(game, "white")).data;
    expect(taken.status).toBe("active");
    expect(taken.paper.autoSeat).toBe(game.blackSeat);
    expect(taken.paper.moveCount).toBe(n);
    const autoStone = taken.paper.moves.at(-1);
    expect(autoStone).toMatchObject({ n, seat: game.blackSeat, auto: true });
    // The nearest ring around the opponent's last stone (50,54).
    expect(chebyshev(autoStone, { x: 50, y: 54 })).toBe(1);
    expect(taken.paper.scores).toEqual(game.blackSeat === 1 ? [1, 0] : [0, 1]);
    expect(taken.clock.running).toBe(game.whiteSeat);
    const spentClock = (await gameRow(game))[`clock_ms_${game.blackSeat}`];
    expect(spentClock).toBe(0);

    // The opponent is on turn, so the leader's seat gets the ordinary refusal.
    const early = await move(game, "black", 51, 54, n + 1);
    expect(early.status).toBe(409);
    expect((await json(early)).error).toMatchObject({ code: "NOT_YOUR_TURN", message: "Teraz ruch przeciwnika." });

    // The opponent plays on (its clock keeps running); the automat answers two seconds later.
    const reply = await play(game, "white", 52, 54, n + 1);
    expect(reply.paper.autoMoveAt).not.toBeNull();
    expect((await sheetRow(game)).pending_auto_at).not.toBeNull();
    // Meanwhile it is the automat's turn: the leader's own move is refused with its message.
    const refused = await move(game, "black", 51, 54, n + 2);
    expect(refused.status).toBe(409);
    expect((await json(refused)).error).toMatchObject({ code: "NOT_YOUR_TURN", message: "Automat stawia kamień." });
    await sleep(2500);
    const answered = (await state(game, "white")).data;
    expect(answered.paper.moveCount).toBe(n + 2);
    const second = answered.paper.moves.at(-1);
    expect(second).toMatchObject({ n: n + 2, seat: game.blackSeat, auto: true });
    expect(chebyshev(second, { x: 52, y: 54 })).toBe(1);
    expect(answered.paper.autoMoveAt).toBeNull();

    // The clock of the opponent ends the game, and the winner is decided by points.
    await turnBegan(game, 61);
    const over = (await state(game, "black")).data;
    expect(over).toMatchObject({ status: "finished", result: { winnerSeat: game.blackSeat, reason: "points" } });
    expect(await gameRow(game)).toMatchObject({ status: "finished", end_reason: "points", winner_seat: game.blackSeat, active_slots: 0 });
  });
});

describe("resigning", () => {
  it("loses the game for the resigning player whatever the points, also the leader", async () => {
    const game = await paperGame();
    await blackLeads(game);

    const response = await resign(game, "black");

    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({
      status: "finished",
      result: { winnerSeat: game.whiteSeat, reason: "resignation" },
    });
    expect(await gameRow(game)).toMatchObject({ end_reason: "resignation", winner_seat: game.whiteSeat, active_slots: 0 });
  });
});

describe("the classic game next to it", () => {
  it("keeps its 15×15 board and its bounds", async () => {
    const game = await startedGame({});
    const off = await move(game, "black", 15, 0, 1);
    expect(off.status).toBe(400);
    const ok = await play(game, "black", 7, 7, 1);
    expect(ok).toMatchObject({ variant: "classic", timeControlMs: 600_000, moveCount: 1, moves: [expect.any(Number)] });
    expect(ok).not.toHaveProperty("paper");
    expect((await gameRow(game)).move_count).toBe(1);
  });
});
