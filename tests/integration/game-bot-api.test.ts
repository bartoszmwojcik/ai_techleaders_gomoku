// A game against the bot (hosted-bot spec, E13-S02) over HTTP against the built app and a real PostgreSQL,
// with BOT_ENABLED on (global-setup): the game starts at once without an invitation, the bot answers the
// player's move after the response (`after()`), a lost computation is recovered by the next read, the
// player may resign, the bot loses on time, and there is no rematch, chat, audience or seat for anybody else.
import { BOARD_SIZE, cellOf } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { ColorDraw } from "../../packages/app/src/server/services/games/color-draw";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { PaperSettler } from "../../packages/app/src/server/services/games/paper-settler";
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
const nextAddress = () => `198.41.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
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
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const guestCookieOf = (response: Response) =>
  (response.headers.getSetCookie?.() ?? []).find((line) => line.startsWith("gomoku_guest="))!.split(";")[0]!;

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `bot-${n}@example.com`,
    displayName: `Bot_fan_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

const state = async (gameId: string, cookie: string) => {
  const response = await call("GET", `/api/games/${gameId}`, undefined, cookie);
  expect(response.status).toBe(200);
  return (await json(response)).data;
};

/** Reads the state until `done` holds (the bot moves after the answer, so the test waits for it). */
async function readUntil(gameId: string, cookie: string, done: (data: Json) => boolean, timeoutMs = 15_000): Promise<Json> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const data = await state(gameId, cookie);
    if (done(data)) return data;
    if (Date.now() > until) throw new Error(`timed out; last state: ${JSON.stringify({ moveCount: data.moveCount, turnSeat: data.turnSeat, status: data.status })}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** A free cell for the player: the first empty one from the centre outwards (never a five for anybody early on). */
function freeCell(moves: number[]): { x: number; y: number } {
  for (let radius = 0; radius < BOARD_SIZE; radius++) {
    for (let y = 7 - radius; y <= 7 + radius; y++) {
      for (let x = 7 - radius; x <= 7 + radius; x++) {
        if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) continue;
        if (!moves.includes(cellOf(x, y))) return { x, y };
      }
    }
  }
  throw new Error("full board");
}

async function createBotGame(cookie: string, botLevel: 1 | 2 = 1) {
  const response = await call("POST", "/api/games", { opponent: "bot", botLevel }, cookie);
  expect(response.status).toBe(201);
  return (await json(response)).data as { gameId: string; opponent: "bot"; bot: { level: number; name: string } };
}

describe("creating a game with the bot", () => {
  it("starts an active, private game at once: no invitation, the bot in seat 2, the colours drawn (R3, R4)", async () => {
    const cookie = await signedUp();
    const created = await createBotGame(cookie, 2);
    expect(created).toEqual({ gameId: expect.any(String), opponent: "bot", bot: { level: 2, name: "Bot · poziom 2 · 16 MB" } });
    expect(created).not.toHaveProperty("invitation");

    const [game] = await run(`select origin, status, is_public, black_seat, started_at is not null as started from games where id = ?`, [created.gameId]);
    expect(game).toMatchObject({ origin: "bot", status: "active", is_public: false, started: true });
    expect([1, 2]).toContain(game!.black_seat);
    expect(await run(`select 1 from invitations where game_id = ?`, [created.gameId])).toHaveLength(0);
    const [bot] = await run(
      `select seat, user_id, bot_level, bot_memory_mb, bot_depth_cap, seen_at is not null as seen, is_active, join_channel
       from game_players where game_id = ? and kind = 'bot'`,
      [created.gameId],
    );
    expect(bot).toEqual({ seat: 2, user_id: null, bot_level: 2, bot_memory_mb: 768, bot_depth_cap: 8, seen: true, is_active: true, join_channel: "web" });

    const data = await state(created.gameId, cookie);
    expect(data.players[1]).toEqual({ seat: 2, kind: "bot", displayName: "Bot · poziom 2 · 16 MB", bot: { level: 2, memoryMb: 768 }, seen: true });
    expect(data).not.toHaveProperty("invitation");
    expect(data).not.toHaveProperty("audience");
  });

  it("creates a guest's game with the bot and hands over the cookie of a game in progress", async () => {
    const response = await call("POST", "/api/games", { acknowledgedGuestWarning: true, opponent: "bot", botLevel: 1 });
    expect(response.status).toBe(201);
    const { gameId, bot } = (await json(response)).data;
    expect(bot).toEqual({ level: 1, name: "Bot · poziom 1" });
    const data = await state(gameId, guestCookieOf(response));
    expect(data.you).toEqual({ seat: 1, kind: "guest" });
    expect(data.players[1].displayName).toBe("Bot · poziom 1");
  });

  it.each([
    ["no level", { opponent: "bot" }, "botLevel"],
    ["the paper game", { opponent: "bot", botLevel: 1, variant: "paper" }, "opponent"],
    ["a public game", { opponent: "bot", botLevel: 1, isPublic: true }, "isPublic"],
    ["a level without the bot", { botLevel: 2 }, "botLevel"],
  ])("answers 400 for %s, creating nothing", async (_name, body, field) => {
    const cookie = await signedUp();
    const response = await call("POST", "/api/games", body, cookie);
    expect(response.status).toBe(400);
    expect(Object.keys((await json(response)).error.fieldErrors)).toContain(field);
  });

  it("keeps one game per player (BR-13): a second game while the bot game runs is refused", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    const second = await call("POST", "/api/games", { opponent: "bot", botLevel: 1 }, cookie);
    expect(second.status).toBe(409);
    expect((await json(second)).error.code).toBe("ACTIVE_GAME_EXISTS");
    expect((await run(`select count(*)::int as n from games where origin = 'bot' and id <> ? and id in
      (select game_id from game_players where user_id = (select user_id from game_players where game_id = ? and seat = 1))`, [gameId, gameId]))[0]!.n).toBe(0);
  });
});

describe("playing the bot", () => {
  it("answers the player's move after the response, at once, with a legal move charged to the bot's clock (R1, BR-58)", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    // The first read starts the clock; when the bot plays black it moves first.
    let data = await readUntil(gameId, cookie, (d) => d.turnSeat === 1);
    const before = data.moveCount as number;
    const cell = freeCell(data.moves);

    const response = await call("POST", `/api/games/${gameId}/moves`, { ...cell, moveNumber: before + 1 }, cookie);
    expect(response.status).toBe(200);
    // The answer does not wait for the bot: it carries the player's move only.
    expect((await json(response)).data).toMatchObject({ moveCount: before + 1, turnSeat: 2 });

    data = await readUntil(gameId, cookie, (d) => d.moveCount === before + 2);
    expect(data.turnSeat).toBe(1);
    expect(new Set(data.moves).size).toBe(data.moves.length);
    const [clocks] = await run(`select clock_ms_2 from games where id = ?`, [gameId]);
    expect(clocks!.clock_ms_2).toBeLessThanOrEqual(600_000);
  });

  it("plays level 2 too", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie, 2);
    const data = await readUntil(gameId, cookie, (d) => d.turnSeat === 1);
    await call("POST", `/api/games/${gameId}/moves`, { ...freeCell(data.moves), moveNumber: data.moveCount + 1 }, cookie);
    await readUntil(gameId, cookie, (d) => d.moveCount === data.moveCount + 2);
  });

  it("recovers a lost computation: the next read of a game where the bot is to move plays its move (R1)", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    // As after a restart: the bot is to move, the clock runs, and nothing was scheduled for it.
    await run(
      `update games set black_seat = 2, turn_started_at = now() where id = ?`,
      [gameId],
    );
    await run(`update game_players set seen_at = now() where game_id = ?`, [gameId]);
    expect((await run(`select move_count from games where id = ?`, [gameId]))[0]!.move_count).toBe(0);

    const data = await readUntil(gameId, cookie, (d) => d.moveCount === 1);
    expect(data.turnSeat).toBe(1);
  });

  it("lets the player resign: the bot wins, both seats are freed and there is no rematch (R13, R14)", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    await readUntil(gameId, cookie, (d) => d.turnSeat === 1);

    const resigned = await call("POST", `/api/games/${gameId}/resign`, undefined, cookie);
    expect(resigned.status).toBe(200);
    expect((await json(resigned)).data).toMatchObject({ status: "finished", result: { winnerSeat: 2, reason: "resignation" } });
    expect((await run(`select count(*)::int as n from game_players where game_id = ? and is_active`, [gameId]))[0]!.n).toBe(0);

    const rematch = await call("POST", `/api/games/${gameId}/rematch`, undefined, cookie);
    expect(rematch.status).toBe(409);
    expect((await json(rematch)).error).toMatchObject({ code: "REMATCH_UNAVAILABLE", message: "Z botem nie ma rewanżu. Zagraj ponownie z botem w nowej partii." });

    // "Zagraj ponownie z botem": a new game, at once, since the slot is free.
    const again = await createBotGame(cookie);
    expect(again.gameId).not.toBe(gameId);
  });

  it("finishes the game on the bot's clock: the bot loses on time like a person (BR-58)", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    // The bot is to move and its time ran out long ago. Nothing read the game yet, so nothing computes.
    await run(`update games set black_seat = 2, turn_started_at = now() - interval '11 minutes' where id = ?`, [gameId]);
    await run(`update game_players set seen_at = now() where game_id = ?`, [gameId]);

    const data = await state(gameId, cookie);
    expect(data).toMatchObject({ status: "finished", result: { winnerSeat: 1, reason: "timeout" } });
    const [counter] = await run(
      `select sum(finished_count)::int as n from game_pair_counters where kind_a = 'account' and kind_b = 'bot'`,
    );
    expect(counter!.n).toBeGreaterThan(0);
  });

  it("has no chat (R14) and nobody else can read or move in it", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    const sent = await call("POST", `/api/games/${gameId}/chat`, { text: "cześć", clientId: crypto.randomUUID() }, cookie);
    expect(sent.status).toBe(409);
    expect((await json(sent)).error.code).toBe("CHAT_UNAVAILABLE");

    const stranger = await signedUp();
    expect((await call("GET", `/api/games/${gameId}`, undefined, stranger)).status).toBe(404);
    expect((await call("POST", `/api/games/${gameId}/moves`, { x: 0, y: 0, moveNumber: 1 }, stranger)).status).toBe(404);
    expect((await call("GET", `/api/games/${gameId}`)).status).toBe(404);
    expect((await call("GET", `/api/games/${gameId}/spectate`)).status).toBe(404);
  });
});

describe("the bot's seat cannot be taken by any client (hosted-bot, autoryzacja)", () => {
  it("resolves no identity to the bot: no account, guest token or agent token stands for it", async () => {
    const cookie = await signedUp();
    const { gameId } = await createBotGame(cookie);
    const em = orm.em.fork();
    const clock = systemClock;
    const games = new GameService({
      em,
      clock,
      rateLimiter: new RateLimiter({ em }),
      invitationCodes: new InvitationCodes(),
      timeoutSettler: new SqlTimeoutSettler({ em, clock, paperSettler: new PaperSettler({ clock, random: Math.random }) }),
      serverConfig: { appOrigin: "https://gomoku.test" } as never,
      colorDraw: new ColorDraw(),
    });
    const [bot] = await run(`select id, user_id, guest_token_hash, agent_token_hash from game_players where game_id = ? and kind = 'bot'`, [gameId]);
    expect(bot).toMatchObject({ user_id: null, guest_token_hash: null, agent_token_hash: null });

    const nobody = "0".repeat(64);
    for (const identity of [{}, { guestTokenHash: nobody }, { agentTokenHash: nobody }, { userId: crypto.randomUUID() }]) {
      expect(await games.findParticipant(identity, gameId)).toBeNull();
    }
    const [creator] = await run(`select id, user_id from game_players where game_id = ? and seat = 1`, [gameId]);
    // The player's own account resolves to the player, never to the bot's seat.
    expect(await games.findParticipant({ userId: creator!.user_id }, gameId)).toEqual({ playerId: creator!.id });
  });
});
