// Chat and flag of a public game (E10-S03, E10-S04) over HTTP against the built app and a real PostgreSQL:
// a spectator with a nickname or an account writes on BR-32 terms and is marked as a spectator, one without a
// nickname only reads, nobody but the players can switch the chat off, the spectators' messages follow BR-34, and
// players and spectators see the flag "Partia publiczna" with the live spectator count (BR-45).
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

const spectate = (code: string, body?: unknown, cookie?: string) =>
  call("POST", `/api/invitations/${code}/spectate`, body ?? {}, cookie);
const chatOf = (gameId: string, cookie: string) => call("GET", `/api/games/${gameId}/spectate/chat`, undefined, cookie);
const say = (gameId: string, cookie: string, text: string) =>
  call("POST", `/api/games/${gameId}/spectate/chat`, { text, clientId: crypto.randomUUID() }, cookie);
const playerChat = (gameId: string, cookie: string) => call("GET", `/api/games/${gameId}/chat`, undefined, cookie);
const playerSay = (gameId: string, cookie: string, text: string) =>
  call("POST", `/api/games/${gameId}/chat`, { text, clientId: crypto.randomUUID() }, cookie);
const state = async (gameId: string, cookie: string) => (await json(await call("GET", `/api/games/${gameId}`, undefined, cookie))).data;
// The spectator polling writes the presence at most every 10 s; the tests move it by hand.
const backdate = (gameId: string) =>
  run(`update chat_messages set created_at = created_at - interval '1 minute' where game_id = ?`, [gameId]);

async function watcher(game: Game, nickname?: string): Promise<string> {
  const response = await spectate(game.code, nickname ? { nickname } : {});
  expect(response.status).toBe(200);
  return cookieOf(response);
}

describe("a spectator in the chat (BR-41)", () => {
  it("writes with a nickname, marked as a spectator, and both players read it", async () => {
    const game = await startedGame();
    const zosia = await watcher(game, "Zosia");

    const sent = await say(game.gameId, zosia, "  Fajna partia  ");
    expect(sent.status).toBe(201);
    expect((await json(sent)).data.message).toMatchObject({ seat: null, spectatorName: "Zosia", text: "Fajna partia" });

    for (const player of [game.alice, game.bob]) {
      const read = await json(await playerChat(game.gameId, player));
      expect(read.data.messages).toHaveLength(1);
      expect(read.data.messages[0]).toMatchObject({ seat: null, spectatorName: "Zosia", text: "Fajna partia" });
    }
    const read = await json(await chatOf(game.gameId, zosia));
    expect(read.data).toMatchObject({ state: "open", lastId: 1 });
    expect(JSON.stringify(read)).not.toMatch(/token|email/i);
  });

  it("writes as an account under the account's name", async () => {
    const game = await startedGame();
    const viewer = await signedUp();
    expect((await spectate(game.code, {}, viewer)).status).toBe(200);
    const sent = await json(await say(game.gameId, viewer, "Cześć"));
    expect(sent.data.message.spectatorName).toMatch(/^Sp_/);
  });

  it("only reads without a nickname: 403, and the conversation is still readable", async () => {
    const game = await startedGame();
    const silent = await watcher(game);
    const refused = await say(game.gameId, silent, "hej");
    expect(refused.status).toBe(403);
    expect((await chatOf(game.gameId, silent)).status).toBe(200);
    expect(Number((await run(`select count(*) as n from chat_messages where game_id = ?`, [game.gameId]))[0]!.n)).toBe(0);
  });

  it("applies the limits of BR-32: no links, 200 characters, one message per 2 s", async () => {
    const game = await startedGame();
    const zosia = await watcher(game, "Zosia");
    expect((await say(game.gameId, zosia, "zobacz example.com")).status).toBe(400);
    expect((await say(game.gameId, zosia, "x".repeat(201))).status).toBe(400);
    expect((await say(game.gameId, zosia, "raz")).status).toBe(201);
    const fast = await say(game.gameId, zosia, "dwa");
    expect(fast.status).toBe(429);
    expect((await json(fast)).error.data.retryAfterMs).toBeGreaterThan(0);
    await backdate(game.gameId);
    expect((await say(game.gameId, zosia, "dwa")).status).toBe(201);
  });

  it("is invisible to strangers and has no way to the players' routes or to the chat switch", async () => {
    const game = await startedGame();
    const zosia = await watcher(game, "Zosia");
    const stranger = await signedUp();
    expect((await chatOf(game.gameId, stranger)).status).toBe(404);
    expect((await say(game.gameId, stranger, "hej")).status).toBe(404);
    expect((await playerChat(game.gameId, zosia)).status).toBe(404);
    expect((await playerSay(game.gameId, zosia, "hej")).status).toBe(404);
    expect((await call("PUT", `/api/games/${game.gameId}/chat/settings`, { enabled: false }, zosia)).status).toBe(404);
    expect((await call("PUT", `/api/games/${game.gameId}/spectate/chat`, { enabled: false }, zosia)).status).toBe(405);
  });

  it("goes on when one player turns the chat off: the other player and the spectators keep talking", async () => {
    const game = await startedGame();
    const zosia = await watcher(game, "Zosia");
    expect((await say(game.gameId, zosia, "przed")).status).toBe(201);
    const off = await call("PUT", `/api/games/${game.gameId}/chat/settings`, { enabled: false }, game.alice);
    expect((await json(off)).data.state).toBe("disabled_by_you");

    // Alice neither reads nor writes.
    const aliceRead = await json(await playerChat(game.gameId, game.alice));
    expect(aliceRead.data).toMatchObject({ state: "disabled_by_you", messages: [] });
    expect((await playerSay(game.gameId, game.alice, "hej")).status).toBe(409);
    // Bob stays in the conversation with the spectators and is told Alice left.
    const bobRead = await json(await playerChat(game.gameId, game.bob));
    expect(bobRead.data).toMatchObject({ state: "open", opponentDisabled: true });
    expect((await playerSay(game.gameId, game.bob, "Bob tu")).status).toBe(201);
    await backdate(game.gameId);
    expect((await say(game.gameId, zosia, "po")).status).toBe(201);
    const zosiaRead = await json(await chatOf(game.gameId, zosia));
    expect(zosiaRead.data.messages.map((m: Json) => m.text)).toEqual(["przed", "Bob tu", "po"]);
  });
});

describe("retention of a spectator's messages (BR-34)", () => {
  it("are swept with the game by the cleanup, and go with the account of the spectator", async () => {
    const game = await startedGame();
    const zosia = await watcher(game, "Zosia");
    const viewer = await signedUp();
    expect((await spectate(game.code, {}, viewer)).status).toBe(200);
    expect((await say(game.gameId, zosia, "z nickiem")).status).toBe(201);
    expect((await say(game.gameId, viewer, "z kontem")).status).toBe(201);
    const count = async () => Number((await run(`select count(*) as n from chat_messages where game_id = ?`, [game.gameId]))[0]!.n);
    expect(await count()).toBe(2);

    // Deleting the spectator's row (the account's deletion cascades the same way) deletes the message.
    await run(`delete from game_spectators where user_id is not null and game_id = ?`, [game.gameId]);
    expect(await count()).toBe(1);

    expect((await call("POST", `/api/games/${game.gameId}/resign`, undefined, game.alice)).status).toBe(200);
    await run(`update games set finished_at = now() - interval '2 hours' where id = ?`, [game.gameId]);
    const result = await cleanupExpired({ em: orm.em.fork(), now: new Date() });
    expect(result.errors).toEqual([]);
    expect(await count()).toBe(0);
  });
});

describe("the flag with the spectator count (BR-45)", () => {
  it("is shown to the players and the spectators with the number of those watching, and the number falls", async () => {
    const game = await startedGame();
    expect((await state(game.gameId, game.alice)).audience).toEqual({ spectators: 0 });
    const a = await watcher(game, "A");
    const b = await watcher(game, "B");
    expect((await state(game.gameId, game.alice)).audience).toEqual({ spectators: 2 });
    expect((await state(game.gameId, game.bob)).audience).toEqual({ spectators: 2 });
    expect((await json(await call("GET", `/api/games/${game.gameId}/spectate`, undefined, a))).data.audience).toEqual({ spectators: 2 });

    // B stops polling: past the presence window they no longer count.
    await run(
      `update game_spectators set last_seen_at = now() - interval '1 minute' where token_hash is not null and game_id = ? and nickname = 'B'`,
      [game.gameId],
    );
    expect((await state(game.gameId, game.alice)).audience).toEqual({ spectators: 1 });
    expect(b).toBeTruthy();
  });

  it("is absent for a private game, a closed audience and a finished game", async () => {
    const priv = await startedGame(false);
    expect(await state(priv.gameId, priv.alice)).not.toHaveProperty("audience");

    const game = await startedGame();
    const zosia = await watcher(game, "Zosia");
    await run(`update games set is_public = false where id = ?`, [game.gameId]);
    expect(await state(game.gameId, game.alice)).not.toHaveProperty("audience");
    // Closing the audience also ends the spectators' chat: they get what any stranger gets.
    expect((await chatOf(game.gameId, zosia)).status).toBe(404);
    await run(`update games set is_public = true where id = ?`, [game.gameId]);

    expect((await call("POST", `/api/games/${game.gameId}/resign`, undefined, game.bob)).status).toBe(200);
    expect(await state(game.gameId, game.alice)).not.toHaveProperty("audience");
  });
});
