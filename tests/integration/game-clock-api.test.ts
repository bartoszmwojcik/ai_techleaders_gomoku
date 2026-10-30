// The game clock (E02 phase 4, #23) over HTTP against the built app and a real PostgreSQL:
// the start after both `seen_at`, the countdown, losing on time found by the opponent's read,
// by a move and by BR-13, and the races between them. Time is moved by writing
// `turn_started_at` straight into the database; exact accounting uses an injected clock.
import { INITIAL_CLOCK_MS } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { systemClock, type Clock } from "../../packages/app/src/server/services/email/email-sender";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { SqlTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";

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
const nextAddress = () => `198.19.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
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

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `clock-${n}@example.com`,
    displayName: `Clock_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Game = { gameId: string; creator: string; joiner: string; black: string; white: string; blackSeat: 1 | 2 };

/** A joined game; `start` also lets the creator open the page, which starts the clock. */
async function joinedGame(start: boolean): Promise<Game> {
  const creator = await signedUp();
  const joiner = await signedUp();
  const created = await json(await call("POST", "/api/games", {}, creator));
  const gameId = created.data.gameId as string;
  const joined = await call("POST", `/api/invitations/${created.data.invitation.code}/accept`, { as: "user" }, joiner);
  expect(joined.status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  if (start) expect((await call("GET", `/api/games/${gameId}`, undefined, creator)).status).toBe(200);
  return {
    gameId,
    creator,
    joiner,
    blackSeat,
    black: blackSeat === 1 ? creator : joiner,
    white: blackSeat === 1 ? joiner : creator,
  };
}

const get = async (game: Game, cookie: string) => {
  const response = await call("GET", `/api/games/${game.gameId}`, undefined, cookie);
  return { status: response.status, ...(await json(response)) };
};
const move = (game: Game, cookie: string, x: number, y: number, moveNumber: number, extra: object = {}) =>
  call("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber, ...extra }, cookie);
const row = async (game: Game) =>
  (await run(
    `select status, end_reason, winner_seat, move_count, clock_ms_1, clock_ms_2, turn_started_at,
       finished_at, (extract(epoch from finished_at - turn_started_at) * 1000)::int as ran_ms,
       (select count(*)::int from game_players where game_id = games.id and is_active) as active_slots
     from games where id = ?`,
    [game.gameId],
  ))[0]!;
/** Pretends the current turn began `seconds` ago. */
const turnBegan = (game: Game, seconds: number) =>
  run(`update games set turn_started_at = date_trunc('milliseconds', now() - make_interval(secs => ?)) where id = ?`, [seconds, game.gameId]);

describe("starting the clock", () => {
  it("runs only after both players opened the game, and starts exactly once", async () => {
    const game = await joinedGame(false);
    expect((await row(game)).turn_started_at).toBeNull();

    // The joiner has seen the game from the moment of joining; their read starts nothing.
    const joinerView = await get(game, game.joiner);
    expect(joinerView.data.clock).toEqual({
      remainingMs: [INITIAL_CLOCK_MS, INITIAL_CLOCK_MS],
      running: null,
      now: expect.any(Number),
    });
    // The server tells its own time (epoch ms), so the client does not trust its own clock.
    expect(Math.abs(joinerView.data.clock.now - Date.now())).toBeLessThan(60_000);
    expect((await row(game)).turn_started_at).toBeNull();
    // Black cannot move before the clock runs, whoever black is.
    const early = await move(game, game.black, 7, 7, 1);
    expect(early.status).toBe(409);
    expect((await json(early)).error.code).toBe("GAME_NOT_STARTED");

    // Two concurrent first visits of the creator: the clock starts once.
    const reads = await Promise.all([get(game, game.creator), get(game, game.creator)]);
    expect(reads.map(({ status }) => status)).toEqual([200, 200]);
    const started = (await row(game)).turn_started_at;
    expect(started).not.toBeNull();
    expect(reads[0]!.data.clock.running).toBe(game.blackSeat);
    expect(reads[1]!.data.clock.running).toBe(game.blackSeat);

    await get(game, game.joiner);
    await get(game, game.creator);
    expect((await row(game)).turn_started_at).toEqual(started);
  });
});

describe("the countdown", () => {
  it("lowers only the clock of the player on turn and charges a move", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 30);

    const view = (await get(game, game.white)).data.clock;
    const mine = game.blackSeat - 1;
    expect(view.running).toBe(game.blackSeat);
    expect(view.remainingMs[mine]).toBeLessThanOrEqual(570_000);
    expect(view.remainingMs[mine]).toBeGreaterThan(560_000);
    expect(view.remainingMs[1 - mine]).toBe(INITIAL_CLOCK_MS);

    // A client-supplied time is ignored (#23 criterion 4).
    const response = await move(game, game.black, 7, 7, 1, { elapsedMs: 1 });
    expect(response.status).toBe(200);
    const after = (await json(response)).data.clock;
    expect(after.running).toBe(game.blackSeat === 1 ? 2 : 1);
    const stored = await row(game);
    const spent = stored[`clock_ms_${game.blackSeat}`] as number;
    expect(spent).toBeLessThanOrEqual(570_000);
    expect(spent).toBeGreaterThan(560_000);
    expect(stored[`clock_ms_${game.blackSeat === 1 ? 2 : 1}`]).toBe(INITIAL_CLOCK_MS);
    expect(after.remainingMs[mine]).toBe(spent);
    expect(new Date(stored.turn_started_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("losing on time", () => {
  it("is found by the opponent's read, stamped at the deadline, and frees both slots", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 11 * 60);

    const seen = await get(game, game.white);
    expect(seen.data.status).toBe("finished");
    expect(seen.data.result).toMatchObject({ reason: "timeout", winnerSeat: game.blackSeat === 1 ? 2 : 1 });
    expect(seen.data.clock.running).toBeNull();
    const stored = await row(game);
    expect(stored).toMatchObject({ status: "finished", end_reason: "timeout", active_slots: 0 });
    expect(stored[`clock_ms_${game.blackSeat}`]).toBe(0);
    // finished_at is the moment the time ran out, not the moment it was noticed.
    expect(stored.ran_ms).toBe(INITIAL_CLOCK_MS);
  });

  it("answers a move after the deadline with GAME_FINISHED and records nothing", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 601);
    const response = await move(game, game.black, 7, 7, 1);
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe("GAME_FINISHED");
    expect(await row(game)).toMatchObject({ status: "finished", end_reason: "timeout", move_count: 0, active_slots: 0 });
  });

  it("still answers a retry of a move accepted before the deadline with 200", async () => {
    const game = await joinedGame(true);
    expect((await move(game, game.black, 7, 7, 1)).status).toBe(200);
    await turnBegan(game, 700);
    expect((await move(game, game.black, 7, 7, 1)).status).toBe(200);
  });

  it("is settled by BR-13: creating a game and accepting an invitation free the slot", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 700);
    // The player on turn (black) tries to start another game: the lost game is settled first.
    const created = await call("POST", "/api/games", {}, game.black);
    expect(created.status).toBe(201);
    expect(await row(game)).toMatchObject({ status: "finished", end_reason: "timeout", active_slots: 0 });

    const other = await joinedGame(true);
    await turnBegan(other, 700);
    const host = await signedUp();
    const invitation = await json(await call("POST", "/api/games", {}, host));
    const accepted = await call("POST", `/api/invitations/${invitation.data.invitation.code}/accept`, { as: "user" }, other.black);
    expect(accepted.status).toBe(200);
    expect((await row(other)).status).toBe("finished");
  });

  it("leaves a game whose time is not up alone (BR-13 still blocks)", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 100);
    const created = await call("POST", "/api/games", {}, game.black);
    expect(created.status).toBe(409);
    expect((await json(created)).error.code).toBe("ACTIVE_GAME_EXISTS");
    expect((await row(game)).status).toBe("active");
  });
});

describe("races", () => {
  it("finishes an expired game once when two readers find it at the same time", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 700);
    const reads = await Promise.all([get(game, game.white), get(game, game.black), get(game, game.white)]);
    for (const read of reads) {
      expect(read.status).toBe(200);
      expect(read.data.result).toMatchObject({ reason: "timeout" });
    }
    expect(await row(game)).toMatchObject({ status: "finished", end_reason: "timeout", active_slots: 0 });
  });

  it("lets exactly one of a late move and the opponent's read decide: the loss on time", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 700);
    const [late, read] = await Promise.all([move(game, game.black, 7, 7, 1), get(game, game.white)]);
    expect(late.status).toBe(409);
    expect(read.status).toBe(200);
    expect(await row(game)).toMatchObject({ status: "finished", end_reason: "timeout", move_count: 0 });
  });

  it("never answers 500 when both players read and a move is played at once, in any order", async () => {
    const games = await Promise.all(Array.from({ length: 6 }, (_, i) => joinedGame(i % 2 === 0)));
    const results = await Promise.all(
      games.flatMap((game) => [
        get(game, game.creator),
        get(game, game.joiner),
        move(game, game.black, 7, 7, 1),
        get(game, game.creator),
        get(game, game.joiner),
      ]),
    );
    for (const result of results) expect(result.status).toBeLessThan(500);
    for (const game of games) {
      expect((await row(game)).turn_started_at).not.toBeNull();
    }
  });
});

describe("with an injected clock", () => {
  const T0 = new Date("2026-10-29T12:00:00.000Z");
  const at = (ms: number): Clock => ({ now: () => new Date(T0.getTime() + ms) });
  const servicesAt = (clock: Clock) => {
    const em = orm.em.fork();
    return {
      em,
      settler: new SqlTimeoutSettler({ em, clock }),
      games: new GameService({
        em,
        clock,
        rateLimiter: new RateLimiter({ em }),
        invitationCodes: new InvitationCodes(),
        timeoutSettler: new SqlTimeoutSettler({ em, clock }),
        serverConfig: { appOrigin: "https://gomoku.test" } as never,
      }),
    };
  };

  it("settles at the exact millisecond the time runs out, not before", async () => {
    const game = await joinedGame(true);
    await run(`update games set turn_started_at = ?, clock_ms_1 = 600000, clock_ms_2 = 600000 where id = ?`, [T0, game.gameId]);
    const [player] = await run(`select id from game_players where game_id = ? and seat = 1`, [game.gameId]);
    const participant = { playerId: player!.id as string };

    const justBefore = servicesAt(at(INITIAL_CLOCK_MS - 1));
    const early = await justBefore.games.getState(participant, game.gameId);
    expect(early.status).toBe("active");
    const running = early.clock.running!;
    expect(early.clock.remainingMs[running - 1]).toBe(1);

    const exact = servicesAt(at(INITIAL_CLOCK_MS));
    const late = await exact.games.getState(participant, game.gameId);
    expect(late.status).toBe("finished");
    expect(late.clock.remainingMs[running - 1]).toBe(0);
    expect((await row(game)).ran_ms).toBe(INITIAL_CLOCK_MS);
  });

  // Only proves that a throw inside the transaction undoes the settlement write. The `play`
  // regression (throwing after the commit instead) is pinned by the test "answers a move after
  // the deadline with GAME_FINISHED and records nothing".
  it("undoes the settlement write when the transaction throws", async () => {
    const game = await joinedGame(true);
    await turnBegan(game, 700);
    const { em, settler } = servicesAt(systemClock);
    await expect(
      em.transactional(async (tx) => {
        expect(await settler.settleExpired(game.gameId, tx)).toBe(true);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await row(game)).toMatchObject({ status: "active", end_reason: null, active_slots: 2 });
  });
});
