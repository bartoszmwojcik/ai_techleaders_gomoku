// Resignation (E02 phase 5, E02-S05, #87) over HTTP against the built app and a real
// PostgreSQL: both players, a guest, a repeat, the error codes, the races with a move and with
// the clock, BR-13 after the resignation, and the all-or-nothing write.
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { GameMoveService } from "../../packages/app/src/server/services/games/game-move-service";
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
const nextAddress = () => `198.20.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string, headers: Record<string, string | null> = {}) {
  const merged: Record<string, string | null> = {
    "content-type": "application/json",
    origin: baseUrl,
    "x-gomoku-request": "1",
    "x-forwarded-for": nextAddress(),
    ...headers,
  };
  if (cookie) merged.cookie = cookie;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null)),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `resign-${n}@example.com`,
    displayName: `Resign_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Game = { gameId: string; creator: string; joiner: string; creatorSeat: 1; joinerSeat: 2; black: string; white: string };

/** A joined game between two players (the joiner may be a guest); `start` runs the clock. */
async function joinedGame(options: { start?: boolean; guest?: boolean } = {}): Promise<Game> {
  const { start = true, guest = false } = options;
  const creator = await signedUp();
  const created = await json(await call("POST", "/api/games", {}, creator));
  const gameId = created.data.gameId as string;
  const code = created.data.invitation.code as string;
  let joiner: string;
  if (guest) {
    const joined = await call("POST", `/api/invitations/${code}/accept`, { as: "guest", acknowledgedGuestWarning: true });
    expect(joined.status).toBe(200);
    joiner = (joined.headers.getSetCookie?.() ?? []).find((l) => l.startsWith("gomoku_guest="))!.split(";")[0]!;
  } else {
    joiner = await signedUp();
    expect((await call("POST", `/api/invitations/${code}/accept`, { as: "user" }, joiner)).status).toBe(200);
  }
  if (start) expect((await call("GET", `/api/games/${gameId}`, undefined, creator)).status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  return {
    gameId,
    creator,
    joiner,
    creatorSeat: 1,
    joinerSeat: 2,
    black: blackSeat === 1 ? creator : joiner,
    white: blackSeat === 1 ? joiner : creator,
  };
}

const resign = (game: Game, cookie: string | undefined) =>
  call("POST", `/api/games/${game.gameId}/resign`, undefined, cookie);
const get = async (game: Game, cookie: string) => {
  const response = await call("GET", `/api/games/${game.gameId}`, undefined, cookie);
  return { status: response.status, ...(await json(response)) };
};
const move = (game: Game, cookie: string, x: number, y: number, moveNumber: number) =>
  call("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber }, cookie);
const row = async (game: Game) =>
  (await run(
    `select status, end_reason, winner_seat, move_count, finished_at,
       (select count(*)::int from game_players where game_id = games.id and is_active) as active_slots
     from games where id = ?`,
    [game.gameId],
  ))[0]!;

describe("resigning a game", () => {
  it("ends the game for the opponent, shows the result to both, frees both slots (BR-13)", async () => {
    const game = await joinedGame();
    await move(game, game.black, 7, 7, 1);

    // Resigning out of turn: black just moved, white is on turn - black resigns anyway.
    const response = await resign(game, game.black);
    expect(response.status).toBe(200);
    const body = await json(response);
    const whiteSeat = game.white === game.creator ? 1 : 2;
    expect(body.data).toMatchObject({
      status: "finished",
      moveCount: 1,
      turnSeat: null,
      result: { winnerSeat: whiteSeat, reason: "resignation", winLine: null },
    });
    expect(body.data.clock.running).toBeNull();

    const opponent = await get(game, game.white);
    expect(opponent.status).toBe(200);
    expect(opponent.data).toMatchObject({ status: "finished", result: { winnerSeat: whiteSeat, reason: "resignation" } });
    expect(await row(game)).toMatchObject({ status: "finished", end_reason: "resignation", winner_seat: whiteSeat, active_slots: 0 });
    expect((await row(game)).finished_at).not.toBeNull();

    // A new game is possible for both at once.
    expect((await call("POST", "/api/games", {}, game.black)).status).toBe(201);
    expect((await call("POST", "/api/games", {}, game.white)).status).toBe(201);
  });

  it("works before the first move, with the clock not yet started, and for the creator", async () => {
    const game = await joinedGame({ start: false });
    const response = await resign(game, game.creator);
    expect(response.status).toBe(200);
    expect((await json(response)).data.result).toMatchObject({ winnerSeat: 2, reason: "resignation" });
    expect(await row(game)).toMatchObject({ move_count: 0, active_slots: 0 });
  });

  it("is idempotent for the player who resigned and a conflict for the winner", async () => {
    const game = await joinedGame();
    const first = await json(await resign(game, game.white));
    const again = await resign(game, game.white);
    expect(again.status).toBe(200);
    expect((await json(again)).data.result).toEqual(first.data.result);
    const parallel = await Promise.all(Array.from({ length: 4 }, () => resign(game, game.white)));
    expect(parallel.map((r) => r.status)).toEqual([200, 200, 200, 200]);

    const winner = await resign(game, game.black);
    expect(winner.status).toBe(409);
    expect((await json(winner)).error.code).toBe("GAME_FINISHED");
    expect(await row(game)).toMatchObject({ end_reason: "resignation", active_slots: 0 });
  });

  it("lets a guest resign with the token, and the account win", async () => {
    const game = await joinedGame({ guest: true });
    const response = await resign(game, game.joiner);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.data).toMatchObject({ status: "finished", you: { seat: 2, kind: "guest" }, result: { winnerSeat: 1, reason: "resignation" } });
    expect(await row(game)).toMatchObject({ end_reason: "resignation", winner_seat: 1, active_slots: 0 });
    expect((await get(game, game.creator)).data.result).toMatchObject({ reason: "resignation", winnerSeat: 1 });
  });

  it("lets an account resign against a guest", async () => {
    const game = await joinedGame({ guest: true });
    expect((await resign(game, game.creator)).status).toBe(200);
    expect(await row(game)).toMatchObject({ end_reason: "resignation", winner_seat: 2, active_slots: 0 });
  });
});

describe("rejected resignations", () => {
  it("answers 403, 404 and 409 with the documented codes and changes nothing", async () => {
    const game = await joinedGame();
    const stranger = await signedUp();

    expect((await call("POST", `/api/games/${game.gameId}/resign`, undefined, game.black, { "x-gomoku-request": null })).status).toBe(403);
    expect((await call("POST", `/api/games/${game.gameId}/resign`, undefined, game.black, { origin: "https://evil.example" })).status).toBe(403);
    expect((await resign(game, stranger)).status).toBe(404);
    expect((await resign(game, undefined)).status).toBe(404);
    expect((await call("POST", "/api/games/not-a-uuid/resign", undefined, game.black)).status).toBe(404);
    expect(await row(game)).toMatchObject({ status: "active", active_slots: 2 });

    // Finished another way.
    await run(`update games set status = 'finished', end_reason = 'draw', finished_at = now() where id = ?`, [game.gameId]);
    const finished = await resign(game, game.black);
    expect(finished.status).toBe(409);
    expect((await json(finished)).error.code).toBe("GAME_FINISHED");
    expect((await row(game)).end_reason).toBe("draw");
  });

  it("refuses a waiting and a cancelled game", async () => {
    const creator = await signedUp();
    const created = await json(await call("POST", "/api/games", {}, creator));
    const waiting = { gameId: created.data.gameId } as Game;
    const refused = await resign(waiting, creator);
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe("GAME_NOT_ACTIVE");

    expect((await call("POST", `/api/games/${waiting.gameId}/cancel`, {}, creator)).status).toBe(200);
    expect((await json(await resign(waiting, creator))).error.code).toBe("GAME_NOT_ACTIVE");
  });
});

describe("races", () => {
  it("lets exactly one of a resignation and a five-completing move end the game", async () => {
    const game = await joinedGame();
    const blackSeat = game.black === game.creator ? 1 : 2;
    const cell = (x: number, y: number) => y * 15 + x;
    const blackCells = [3, 4, 5, 6].map((x) => cell(x, 7));
    const whiteCells = [0, 1, 2, 3].map((x) => cell(x, 0));
    const bits = (cells: number[]) => Array.from({ length: 225 }, (_, c) => (cells.includes(c) ? "1" : "0")).join("");
    const moves = blackCells.flatMap((c, i) => [c, whiteCells[i]!]);
    await run(
      `update games set stones_black = ?::bit(225), stones_white = ?::bit(225), moves = ?::bytea, move_count = ? where id = ?`,
      [bits(blackCells), bits(whiteCells), Buffer.from(moves), moves.length, game.gameId],
    );

    const [played, resigned] = await Promise.all([move(game, game.black, 7, 7, 9), resign(game, game.white)]);
    const stored = await row(game);
    expect(stored).toMatchObject({ status: "finished", winner_seat: blackSeat, active_slots: 0 });
    // The winner is black either way; exactly one event wrote the end.
    if (stored.end_reason === "five_in_row") {
      expect([played.status, resigned.status]).toEqual([200, 409]);
      expect(stored.move_count).toBe(9);
    } else {
      expect(stored.end_reason).toBe("resignation");
      expect([played.status, resigned.status]).toEqual([409, 200]);
      expect(stored.move_count).toBe(8);
    }
  });

  it("lets the loss on time win over a late resignation", async () => {
    const game = await joinedGame();
    await run(`update games set turn_started_at = now() - interval '700 seconds' where id = ?`, [game.gameId]);
    const late = await resign(game, game.white);
    expect(late.status).toBe(409);
    expect((await json(late)).error.code).toBe("GAME_FINISHED");
    // The settlement was committed, not rolled back with the refusal.
    expect(await row(game)).toMatchObject({ status: "finished", end_reason: "timeout", active_slots: 0 });
    // The player who lost on time cannot "resign" afterwards either.
    expect((await resign(game, game.black)).status).toBe(409);
  });

  it("never answers 500 when both players resign at once; the first writer decides", async () => {
    const games = await Promise.all(Array.from({ length: 4 }, () => joinedGame()));
    const results = await Promise.all(games.flatMap((game) => [resign(game, game.creator), resign(game, game.joiner)]));
    for (const result of results) expect([200, 409]).toContain(result.status);
    for (const [index, game] of games.entries()) {
      expect([results[index * 2]!.status, results[index * 2 + 1]!.status].sort()).toEqual([200, 409]);
      expect(await row(game)).toMatchObject({ status: "finished", end_reason: "resignation", active_slots: 0 });
    }
  });
});

describe("the write is all or nothing", () => {
  it("undoes the finish and the freed slots when the transaction fails afterwards", async () => {
    const game = await joinedGame();
    const em = orm.em.fork();
    const clock = systemClock;
    const timeoutSettler = new SqlTimeoutSettler({ em, clock });
    const gameService = new GameService({
      em,
      clock,
      rateLimiter: new RateLimiter({ em }),
      invitationCodes: new InvitationCodes(),
      timeoutSettler,
      serverConfig: { appOrigin: "https://gomoku.test" } as never,
    });
    // The state read is the last step of the transaction: when it fails, nothing may stay.
    gameService.stateOf = async () => {
      throw new Error("boom");
    };
    const service = new GameMoveService({ em, clock, gameService, timeoutSettler });
    const [player] = await run(`select id from game_players where game_id = ? and seat = 1`, [game.gameId]);

    await expect(service.resign({ playerId: player!.id as string } as never, game.gameId)).rejects.toThrow("boom");

    expect(await row(game)).toMatchObject({ status: "active", end_reason: null, winner_seat: null, active_slots: 2 });
  });
});
