// The kill-switch of a public game (E10-S05, BR-43) over HTTP against the built app and a real PostgreSQL: the
// creator (an account or a guest) closes the audience, the spectators are turned away at once with a clear answer,
// the code opens neither watching nor review, the game goes on as private, the players are told, and nobody else
// may close it.
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

let counter = 0;
const nextAddress = () => `198.71.${Math.floor(counter / 250)}.${(counter++ % 250) + 1}`;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST", path: string, body?: unknown, cookie?: string) {
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
    redirect: "manual",
  });
}
const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const json = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `closeaud-${n}@example.com`,
    displayName: `Cl_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Game = { gameId: string; code: string; creator: string; opponent: string };

/** A started public game: the creator is an account or a guest; the opponent is an account. */
async function startedGame(creatorKind: "account" | "guest", isPublic = true): Promise<Game> {
  const creator = creatorKind === "account" ? await signedUp() : undefined;
  const opponent = await signedUp();
  const created = await call(
    "POST",
    "/api/games",
    { ...(creator ? {} : { acknowledgedGuestWarning: true }), ...(isPublic ? { isPublic: true } : {}) },
    creator,
  );
  expect(created.status).toBe(201);
  const creatorCookie = creator ?? cookieOf(created);
  const { data } = (await created.json()) as { data: { gameId: string; invitation: { code: string } } };
  expect((await call("POST", `/api/invitations/${data.invitation.code}/accept`, { as: "user" }, opponent)).status).toBe(200);
  expect((await call("GET", `/api/games/${data.gameId}`, undefined, creatorCookie)).status).toBe(200);
  return { gameId: data.gameId, code: data.invitation.code, creator: creatorCookie, opponent };
}

const spectate = (code: string, body?: unknown, cookie?: string) =>
  call("POST", `/api/invitations/${code}/spectate`, body ?? {}, cookie);
const watch = (gameId: string, cookie: string) => call("GET", `/api/games/${gameId}/spectate`, undefined, cookie);
const close = (gameId: string, cookie?: string) => call("POST", `/api/games/${gameId}/audience/close`, undefined, cookie);
const state = async (gameId: string, cookie: string) => (await json(await call("GET", `/api/games/${gameId}`, undefined, cookie))).data;
const page = (path: string, cookie?: string) =>
  fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

async function watcher(game: Game, nickname: string): Promise<string> {
  const response = await spectate(game.code, { nickname });
  expect(response.status).toBe(200);
  return cookieOf(response);
}

describe("closing the audience", () => {
  it.each(["account", "guest"] as const)("a %s creator turns the spectators away at once, and the game goes on as private", async (kind) => {
    const game = await startedGame(kind);
    const viewer = await watcher(game, "Widz");
    expect((await watch(game.gameId, viewer)).status).toBe(200);
    const said = await call("POST", `/api/games/${game.gameId}/spectate/chat`, { text: "hej", clientId: crypto.randomUUID() }, viewer);
    expect(said.status).toBe(201);
    expect((await state(game.gameId, game.creator)).canCloseAudience).toBe(true);
    expect((await state(game.gameId, game.opponent)).canCloseAudience).toBeUndefined();

    const closed = await close(game.gameId, game.creator);
    expect(closed.status).toBe(200);
    const data = (await json(closed)).data;
    expect(data.audienceClosed).toBe(true);
    expect(data.audience).toBeUndefined();
    expect(data.canCloseAudience).toBeUndefined();

    // The spectator's next read says why; the chat is shut; the page tells them too.
    const poll = await watch(game.gameId, viewer);
    expect(poll.status).toBe(410);
    expect((await json(poll)).error.code).toBe("AUDIENCE_CLOSED");
    expect((await call("GET", `/api/games/${game.gameId}/spectate/chat`, undefined, viewer)).status).toBe(404);
    const shown = await page(`/games/${game.gameId}`, viewer);
    expect(shown.status).toBe(200);
    expect(await shown.text()).toContain("Twórca zamknął publiczność");

    // The code opens nothing, a stranger and the other player see a private game.
    expect((await spectate(game.code, { nickname: "Nowy" })).status).toBe(410);
    expect((await state(game.gameId, game.opponent)).audienceClosed).toBe(true);
    expect((await state(game.gameId, game.opponent)).audience).toBeUndefined();
    // The spectator's messages left the players' chat; the players still talk.
    const chat = await json(await call("GET", `/api/games/${game.gameId}/chat`, undefined, game.opponent));
    expect(chat.data.messages).toEqual([]);
    const reply = await call("POST", `/api/games/${game.gameId}/chat`, { text: "gramy dalej", clientId: crypto.randomUUID() }, game.opponent);
    expect(reply.status).toBe(201);
    const [row] = await run(`select is_public, audience_closed_at from games where id = ?`, [game.gameId]);
    expect(row).toMatchObject({ is_public: false });
    expect(row!.audience_closed_at).not.toBeNull();
  });

  it("is a harmless repeat, and the opponent, a spectator and a stranger get 404", async () => {
    const game = await startedGame("account");
    const viewer = await watcher(game, "Widz");
    expect((await close(game.gameId, game.opponent)).status).toBe(404);
    expect((await close(game.gameId, viewer)).status).toBe(404);
    expect((await close(game.gameId)).status).toBe(404);
    expect((await watch(game.gameId, viewer)).status).toBe(200);

    expect((await close(game.gameId, game.creator)).status).toBe(200);
    const [first] = await run(`select audience_closed_at from games where id = ?`, [game.gameId]);
    expect((await close(game.gameId, game.creator)).status).toBe(200);
    const [second] = await run(`select audience_closed_at from games where id = ?`, [game.gameId]);
    expect(second!.audience_closed_at).toEqual(first!.audience_closed_at);
  });

  it("refuses a game that was never public, and rejects a request without the CSRF header", async () => {
    const game = await startedGame("account", false);
    const refused = await close(game.gameId, game.creator);
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe("GAME_NOT_PUBLIC");
    const noHeader = await fetch(`${baseUrl}/api/games/${game.gameId}/audience/close`, {
      method: "POST",
      headers: { origin: baseUrl, cookie: game.creator },
    });
    expect(noHeader.status).toBe(403);
  });

  it("refuses a game that still waits for its opponent", async () => {
    const creator = await signedUp();
    const created = await call("POST", "/api/games", { isPublic: true }, creator);
    const { data } = (await created.json()) as { data: { gameId: string } };
    const refused = await close(data.gameId, creator);
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe("GAME_NOT_ACTIVE");
  });

  it("closing a finished game blocks the review by code too (BR-43)", async () => {
    const game = await startedGame("account");
    expect((await call("POST", `/api/games/${game.gameId}/resign`, undefined, game.opponent)).status).toBe(200);
    expect((await page(`/games/${game.gameId}/review?code=${game.code}`)).status).toBe(200);
    expect((await state(game.gameId, game.creator)).canCloseAudience).toBe(true);

    expect((await close(game.gameId, game.creator)).status).toBe(200);
    expect((await page(`/games/${game.gameId}/review?code=${game.code}`)).status).toBe(404);
    // The players keep their own history.
    expect((await page(`/games/${game.gameId}/review`, game.creator)).status).toBe(200);
  });
});
