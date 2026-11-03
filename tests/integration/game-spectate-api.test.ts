// Spectating a public game in progress (E10-S02, #207) over HTTP against the built app and a real
// PostgreSQL: the code of a public game with both seats taken lets anybody watch (BR-39); 20 at most
// (BR-42); a spectator reads the board, both clocks and the result and can change nothing; they take
// no slot (BR-13), are no participant (no history, no seat, no agent token, so no MCP) and are swept by the cleanup.
import { cleanupExpired, createOrm, type Orm } from "@gomoku/db";
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

let counter = 0;
const nextAddress = () => `198.70.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST" | "PUT", path: string, body?: unknown, cookie?: string) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      origin: baseUrl,
      "x-gomoku-request": "1",
      "x-forwarded-for": nextAddress(),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `spectate-${n}@example.com`,
    displayName: `Sp_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Game = { gameId: string; code: string; black: string; white: string; alice: string; bob: string };

/** A started game between two accounts; the creator opened the page, so the clock runs. */
async function startedGame(isPublic = true): Promise<Game> {
  const alice = await signedUp();
  const bob = await signedUp();
  const created = await call("POST", "/api/games", isPublic ? { isPublic: true } : {}, alice);
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  expect((await call("POST", `/api/invitations/${data.invitation.code}/accept`, { as: "user" }, bob)).status).toBe(200);
  expect((await call("GET", `/api/games/${data.gameId}`, undefined, alice)).status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [data.gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  return {
    gameId: data.gameId,
    code: data.invitation.code,
    alice,
    bob,
    black: blackSeat === 1 ? alice : bob,
    white: blackSeat === 1 ? bob : alice,
  };
}
const cell = (x: number, y: number) => y * 15 + x;
const move = (game: Game, cookie: string, x: number, y: number, moveNumber: number) =>
  call("POST", `/api/games/${game.gameId}/moves`, { x, y, moveNumber }, cookie);
const spectate = (code: string, body?: unknown, cookie?: string) =>
  call("POST", `/api/invitations/${code}/spectate`, body ?? {}, cookie);
const watch = (game: Game | string, cookie?: string, query = "") =>
  call("GET", `/api/games/${typeof game === "string" ? game : game.gameId}/spectate${query}`, undefined, cookie);
const spectatorCount = async (gameId: string) =>
  Number((await run(`select count(*) as n from game_spectators where game_id = ?`, [gameId]))[0]!.n);
const snapshot = async (gameId: string) => ({
  game: (await run(`select status, move_count, moves, turn_started_at, clock_ms_1, clock_ms_2, winner_seat from games where id = ?`, [gameId]))[0],
  players: await run(`select id, seat, kind, user_id, agent_token_hash, guest_token_hash, seen_at from game_players where game_id = ? order by seat`, [gameId]),
});

describe("joining as a spectator (BR-39)", () => {
  it("is refused until both seats are taken: the first person with the code is the opponent", async () => {
    const owner = await signedUp();
    const created = await call("POST", "/api/games", { isPublic: true }, owner);
    const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };

    const early = await spectate(data.invitation.code);
    expect(early.status).toBe(410);
    expect((await json(early)).error.code).toBe("INVALID_INVITATION");
    expect(await spectatorCount(data.gameId)).toBe(0);
    const page = await (await call("GET", `/invite/${data.invitation.code}`)).text();
    expect(page).toContain('data-state="joinable"');
  });

  it("lets a visitor with a nickname watch: HttpOnly cookie, only the hash stored, the nickname kept", async () => {
    const game = await startedGame();

    const response = await spectate(game.code, { nickname: "  Zosia  " });

    expect(response.status).toBe(200);
    expect((await json(response)).data).toEqual({ gameId: game.gameId });
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^gomoku_spectator=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=3600/i);
    const token = cookieOf(response).split("=")[1]!;
    const [row] = await run(`select nickname, token_hash, user_id, expires_at > now() + interval '59 minutes' as fresh from game_spectators where game_id = ?`, [game.gameId]);
    expect(row).toMatchObject({ nickname: "Zosia", user_id: null, fresh: true });
    expect(row!.token_hash).toHaveLength(64);
    expect(row!.token_hash).not.toBe(token);
  });

  it("lets an account watch under its name, with no cookie and a nickname refused", async () => {
    const game = await startedGame();
    const viewer = await signedUp();

    expect((await spectate(game.code, { nickname: "Ala" }, viewer)).status).toBe(400);
    const response = await spectate(game.code, {}, viewer);

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").not.toContain("gomoku_spectator");
    const [row] = await run(`select user_id, nickname, token_hash from game_spectators where game_id = ?`, [game.gameId]);
    expect(row!.user_id).not.toBeNull();
    expect(row!.nickname).toBeNull();
    expect(row!.token_hash).toBeNull();
    expect((await watch(game, viewer)).status).toBe(200);
  });

  it("refuses a bad nickname and a private game, and does not tell them apart from an unknown code", async () => {
    const game = await startedGame();
    expect((await spectate(game.code, { nickname: "<script>" })).status).toBe(400);
    expect(await spectatorCount(game.gameId)).toBe(0);

    const priv = await startedGame(false);
    const refused = await spectate(priv.code);
    expect(refused.status).toBe(410);
    const unknown = await spectate("ABCD-EFGH");
    expect(unknown.status).toBe(410);
    expect((await json(refused)).error).toEqual((await json(unknown)).error);
    expect(await spectatorCount(priv.gameId)).toBe(0);
  });

  it("refuses a game whose audience the creator closed after it started", async () => {
    const game = await startedGame();
    await run(`update games set is_public = false where id = ?`, [game.gameId]);
    expect((await spectate(game.code)).status).toBe(410);
  });

  it("gives a player of the game their game back and makes no spectator of them", async () => {
    const game = await startedGame();
    const response = await spectate(game.code, {}, game.alice);
    expect(response.status).toBe(200);
    expect(await spectatorCount(game.gameId)).toBe(0);
  });

  it("the invite page offers to watch a game in progress, and not to join it", async () => {
    const game = await startedGame();
    const stranger = await signedUp();
    for (const cookie of [undefined, stranger]) {
      const page = await call("GET", `/invite/${game.code}`, undefined, cookie);
      const html = await page.text();
      expect(page.status).toBe(200);
      expect(html).toContain('data-state="watch"');
      expect(html).toContain("Ta partia już trwa");
      expect(html).toContain("Oglądaj partię");
      expect(html).not.toContain("Dołącz do partii");
    }
    // A player is sent to their own game, not to the audience.
    const own = await call("GET", `/invite/${game.code}`, undefined, game.bob);
    expect(own.status).toBe(200);
    expect(own.url).toContain(`/games/${game.gameId}`);
  });
});

describe("the limit of 20 (BR-42)", () => {
  it("lets 20 watch, turns the 21st away, lets a returning one in and frees a seat after 15 s of silence", async () => {
    const game = await startedGame();
    const cookies: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const response = await spectate(game.code, { nickname: `W${index}` });
      expect(response.status, `spectator ${index + 1}`).toBe(200);
      cookies.push(cookieOf(response));
    }
    expect(await spectatorCount(game.gameId)).toBe(20);

    const full = await spectate(game.code, { nickname: "Dwudziesty pierwszy" });
    expect(full.status).toBe(409);
    expect((await json(full)).error).toMatchObject({ code: "SPECTATORS_FULL", message: "Partia ma komplet widzów" });
    expect(await spectatorCount(game.gameId)).toBe(20);

    // The 21st does not read either: they have no row.
    expect((await watch(game)).status).toBe(404);
    // A returning spectator is let in whatever the limit says, and is not counted twice.
    expect((await spectate(game.code, {}, cookies[3])).status).toBe(200);
    expect(await spectatorCount(game.gameId)).toBe(20);

    // One of them has been silent for a minute: the seat is free for the 21st.
    await run(`update game_spectators set last_seen_at = now() - interval '1 minute' where id = (select id from game_spectators where game_id = ? limit 1)`, [game.gameId]);
    expect((await spectate(game.code, { nickname: "Wchodzę" })).status).toBe(200);
    expect(await spectatorCount(game.gameId)).toBe(21);
  });

  it("decides the last seat under concurrency: of 25 simultaneous joins exactly 20 get in", async () => {
    const game = await startedGame();
    const responses = await Promise.all(Array.from({ length: 25 }, (_, index) => spectate(game.code, { nickname: `C${index}` })));
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(20);
    expect(statuses.filter((status) => status === 409)).toHaveLength(5);
    expect(await spectatorCount(game.gameId)).toBe(20);
  });

  it("counts each game on its own", async () => {
    const first = await startedGame();
    const second = await startedGame();
    for (let index = 0; index < 20; index += 1) expect((await spectate(first.code)).status).toBe(200);
    expect((await spectate(first.code)).status).toBe(409);
    expect((await spectate(second.code)).status).toBe(200);
  });
});

describe("what a spectator sees", () => {
  it("reads the board, both clocks and the names - live, with only the new moves - and nothing private", async () => {
    const game = await startedGame();
    const spectator = cookieOf(await spectate(game.code, { nickname: "Zosia" }));

    const first = await watch(game, spectator);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const initial = (await json(first)).data;
    expect(initial).toMatchObject({ status: "active", moveCount: 0, moves: [], result: null });
    // Black is on turn and its clock runs; the other one is untouched.
    expect(initial.turnSeat).toBe(initial.blackSeat);
    expect(initial.clock).toMatchObject({ running: initial.blackSeat, now: expect.any(Number) });
    expect(initial.clock.remainingMs[2 - initial.blackSeat]).toBe(600_000);
    expect(initial.clock.remainingMs[initial.blackSeat - 1]).toBeLessThanOrEqual(600_000);
    expect(initial.players).toHaveLength(2);
    expect(initial.players.map((player: Json) => player.kind)).toEqual(["account", "account"]);
    expect(Object.keys(initial).sort()).toEqual(["audience", "blackSeat", "canChat", "clock", "moveCount", "moves", "players", "result", "status", "turnSeat"]);

    expect((await move(game, game.black, 7, 7, 1)).status).toBe(200);
    expect((await move(game, game.white, 8, 7, 2)).status).toBe(200);
    const live = (await json(await watch(game, spectator, "?after=0"))).data;
    expect(live).toMatchObject({ moveCount: 2, moves: [cell(7, 7), cell(8, 7)] });
    expect(live.clock.running).toBe(live.turnSeat);
    const tail = (await json(await watch(game, spectator, "?after=1"))).data;
    expect(tail).toMatchObject({ moveCount: 2, moves: [cell(8, 7)] });

    const text = JSON.stringify(live);
    expect(text).not.toContain(game.code);
    expect(text).not.toMatch(/email|invitation|rematch|token|"you"|seen|@example/i);
  });

  it("sees the result when a player resigns, and reads it again later", async () => {
    const game = await startedGame();
    const spectator = cookieOf(await spectate(game.code));
    expect((await move(game, game.black, 7, 7, 1)).status).toBe(200);
    expect((await call("POST", `/api/games/${game.gameId}/resign`, undefined, game.white)).status).toBe(200);

    const done = (await json(await watch(game, spectator, "?after=1"))).data;
    expect(done).toMatchObject({ status: "finished", result: { reason: "resignation" }, clock: { running: null } });
    expect(done.turnSeat).toBeNull();
    expect(typeof (await json(await watch(game, spectator))).data.moveCount).toBe("number");
  });

  it("answers 404 to anybody who does not watch this game, and 400 to an after beyond the game", async () => {
    const game = await startedGame();
    const other = await startedGame();
    const spectator = cookieOf(await spectate(game.code));
    expect((await watch(game)).status).toBe(404);
    expect((await watch(other, spectator)).status).toBe(404);
    expect((await watch(game, await signedUp())).status).toBe(404);
    expect((await watch("not-a-uuid", spectator)).status).toBe(404);
    expect((await watch(game, spectator, "?after=5")).status).toBe(400);
    expect((await watch(game, spectator, "?after=x")).status).toBe(400);
    // The page of the game answers 404 to a stranger too (the text does not say why).
    const page = await call("GET", `/games/${game.gameId}`, undefined, await signedUp());
    expect(page.status).toBe(404);
  });

  it("opens the game page for a spectator, read-only, and never for a stranger", async () => {
    const game = await startedGame();
    const spectator = cookieOf(await spectate(game.code));
    const page = await call("GET", `/games/${game.gameId}`, undefined, spectator);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain("Oglądasz partię");
    expect(html).not.toContain("Poddaj partię");
    expect(html).not.toContain(game.code);
  });
});

describe("a spectator changes nothing (negative)", () => {
  it("is a stranger to every route of a player: no move, resignation, rematch, chat, state or cancel", async () => {
    const game = await startedGame();
    const spectator = cookieOf(await spectate(game.code));
    const viewer = await signedUp();
    await spectate(game.code, {}, viewer);
    expect((await move(game, game.black, 7, 7, 1)).status).toBe(200);
    const before = await snapshot(game.gameId);

    for (const cookie of [spectator, viewer]) {
      const attempts = [
        move(game, cookie, 9, 9, 2),
        call("POST", `/api/games/${game.gameId}/resign`, undefined, cookie),
        call("POST", `/api/games/${game.gameId}/cancel`, undefined, cookie),
        call("POST", `/api/games/${game.gameId}/rematch`, undefined, cookie),
        call("POST", `/api/games/${game.gameId}/chat`, { text: "hej", clientId: crypto.randomUUID() }, cookie),
        call("GET", `/api/games/${game.gameId}/chat`, undefined, cookie),
        call("PUT", `/api/games/${game.gameId}/chat/settings`, { enabled: false }, cookie),
        call("GET", `/api/games/${game.gameId}`, undefined, cookie),
      ];
      for (const response of await Promise.all(attempts)) expect(response.status).toBe(404);
    }

    expect(await snapshot(game.gameId)).toEqual(before);
  });

  it("does not move the clocks, the turn or the seats by reading, whatever the number of reads", async () => {
    const game = await startedGame();
    const spectator = cookieOf(await spectate(game.code));
    const before = await snapshot(game.gameId);
    for (let index = 0; index < 5; index += 1) expect((await watch(game, spectator)).status).toBe(200);
    expect(await snapshot(game.gameId)).toEqual(before);
  });
});

describe("a spectator is not a participant", () => {
  it("takes no game slot (BR-13): they can create and join games while watching", async () => {
    const game = await startedGame();
    const viewer = await signedUp();
    expect((await spectate(game.code, {}, viewer)).status).toBe(200);
    expect((await watch(game, viewer)).status).toBe(200);

    const created = await call("POST", "/api/games", {}, viewer);
    expect(created.status).toBe(201);
    const other = await startedGame();
    // The viewer now waits in their own game, so a spectator of a second game is still allowed.
    expect((await spectate(other.code, {}, viewer)).status).toBe(200);
  });

  it("is not in the history of the game or the account, has no seat and no agent token", async () => {
    const game = await startedGame();
    const viewer = await signedUp();
    expect((await spectate(game.code, {}, viewer)).status).toBe(200);
    expect((await spectate(game.code, { nickname: "Gość" })).status).toBe(200);

    const players = await run(`select seat, kind, agent_token_hash, guest_token_hash from game_players where game_id = ?`, [game.gameId]);
    expect(players.map((player) => player.seat).sort()).toEqual([1, 2]);
    expect(players.every((player) => player.agent_token_hash === null)).toBe(true);
    const history = await json(await call("GET", "/api/history", undefined, viewer));
    expect(JSON.stringify(history)).not.toContain(game.gameId);
    const columns = await run(`select column_name from information_schema.columns where table_name = 'game_spectators'`);
    expect(columns.map((column) => column.column_name)).not.toContain("seat");
    expect(columns.map((column) => column.column_name)).not.toContain("agent_token_hash");
  });
});

describe("the life of a spectator", () => {
  it("slides the access with a read, writes the presence at most every 10 s and ends after an hour of silence", async () => {
    const game = await startedGame();
    const spectator = cookieOf(await spectate(game.code));
    await run(`update game_spectators set last_seen_at = now() - interval '1 minute', expires_at = now() + interval '1 minute' where game_id = ?`, [game.gameId]);

    expect((await watch(game, spectator)).status).toBe(200);
    const [slid] = await run(`select expires_at > now() + interval '59 minutes' as slid, last_seen_at, expires_at from game_spectators where game_id = ?`, [game.gameId]);
    expect(slid!.slid).toBe(true);

    // A second read within 10 s writes nothing.
    expect((await watch(game, spectator)).status).toBe(200);
    const [again] = await run(`select last_seen_at, expires_at from game_spectators where game_id = ?`, [game.gameId]);
    expect(again).toEqual({ last_seen_at: slid!.last_seen_at, expires_at: slid!.expires_at });

    await run(`update game_spectators set expires_at = now() - interval '1 second', created_at = now() - interval '2 hours' where game_id = ?`, [game.gameId]);
    expect((await watch(game, spectator)).status).toBe(404);
  });

  it("is swept by the cleanup an hour after the access ended, and goes with its game and its account", async () => {
    const game = await startedGame();
    const spectators = [];
    for (let index = 0; index < 3; index += 1) spectators.push(cookieOf(await spectate(game.code, { nickname: `S${index}` })));
    const [a, b, c] = (await run(`select id from game_spectators where game_id = ? order by created_at`, [game.gameId])).map((row) => row.id as string);
    await run(`update game_spectators set created_at = now() - interval '5 hours', expires_at = now() - interval '2 hours' where id = ?`, [a]);
    await run(`update game_spectators set created_at = now() - interval '5 hours', expires_at = now() - interval '10 minutes' where id = ?`, [b]);

    const result = await cleanupExpired({ em: orm.em.fork(), now: new Date() });

    expect(result.errors).toEqual([]);
    expect(result.gameSpectators).toBeGreaterThanOrEqual(1);
    const left = (await run(`select id from game_spectators where game_id = ?`, [game.gameId])).map((row) => row.id);
    // Expired two hours ago: gone. Expired ten minutes ago: kept for the 1 h margin. Alive: kept.
    expect(left.sort()).toEqual([b, c].sort());

    const viewer = await signedUp();
    await spectate(game.code, {}, viewer);
    await run(`delete from users where id = (select user_id from game_spectators where game_id = ? and user_id is not null)`, [game.gameId]);
    expect(await spectatorCount(game.gameId)).toBe(2);
    await run(`delete from games where id = ?`, [game.gameId]);
    expect(Number((await run(`select count(*) as n from game_spectators where id = any(?::uuid[])`, [`{${[b, c].join(",")}}`]))[0]!.n)).toBe(0);
  });
});
