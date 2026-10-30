// A visitor without an account creates a game over HTTP (E02-S08) against the built app and a
// real PostgreSQL: `POST /api/games` without a session, the guest cookie, play to the end against
// a guest and an account, `OWN_INVITATION`, the per-address limit, the cancel by the guest
// creator and the "invitation expired" window of one hour (L29). The production 500 for an unknown
// client address cannot be provoked here (`next start` adds the socket address to
// `X-Forwarded-For` itself); the route and `clientKey` unit tests cover it.
import { CREATE_GAME_LIMIT } from "@gomoku/core";
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
const run = (text: string, params: unknown[] = []) => orm.em.fork().execute<Record<string, unknown>[]>(text, params);

// The creation limit is per client address: every test (and every request, unless it says
// otherwise) uses its own address (X-Forwarded-For, one trusted hop).
let addressCounter = 0;
const nextAddress = () => `198.20.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
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
const post = (path: string, body?: unknown, headers?: Headers) => call("POST", path, body ?? {}, headers);
const body = async (response: Response) => (await response.json()) as { ok: boolean; data: Json; error: Json };

const cookieOf = (response: Response): string => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const maxAgeOf = (response: Response): number =>
  Number(/Max-Age=(\d+)/i.exec(response.headers.get("set-cookie") ?? "")?.[1]);

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await post("/api/auth/register", {
    email: `guestcreate-${n}@example.com`,
    displayName: `GC_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

const GUEST_BODY = { acknowledgedGuestWarning: true };
type Created = { response: Response; cookie: string; gameId: string; code: string };

async function guestCreate(extra: Json = {}, headers: Headers = {}): Promise<Created> {
  const response = await post("/api/games", { ...GUEST_BODY, ...extra }, headers);
  expect(response.status).toBe(201);
  const { data } = await body(response);
  return { response, cookie: cookieOf(response), gameId: data.gameId, code: data.invitation.code };
}

const state = async (gameId: string, cookie: string) => {
  const response = await call("GET", `/api/games/${gameId}`, undefined, { cookie });
  return { status: response.status, ...(await body(response)) };
};
const move = (game: string, cookie: string, x: number, y: number, moveNumber: number) =>
  post(`/api/games/${game}/moves`, { x, y, moveNumber }, { cookie });

/** Both open the page (the clock starts), then black wins with a row of five. */
async function playToTheEnd(gameId: string, seat1: string, seat2: string) {
  await state(gameId, seat1);
  await state(gameId, seat2);
  const [game] = await run(`select black_seat from games where id = ?`, [gameId]);
  const [black, white] = game!.black_seat === 1 ? [seat1, seat2] : [seat2, seat1];
  const blackMoves = [3, 4, 5, 6, 7].map((x) => [x, 7]);
  const whiteMoves = [0, 1, 2, 3].map((x) => [x, 0]);
  let number = 0;
  for (const [index, [x, y]] of blackMoves.entries()) {
    const response = await move(gameId, black, x!, y!, ++number);
    expect(response.status, `move ${number}`).toBe(200);
    if (index < 4) {
      const reply = await move(gameId, white, whiteMoves[index]![0]!, whiteMoves[index]![1]!, ++number);
      expect(reply.status, `move ${number}`).toBe(200);
    }
  }
  return (await state(gameId, black)).data;
}

describe("POST /api/games without a session", () => {
  it("creates a game, sets the guest cookie until an hour after the invitation expires and shows the creator the state", async () => {
    const { response, cookie, gameId, code } = await guestCreate({ nickname: "  Ala  " });

    const set = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^gomoku_guest=[\w-]{43}$/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    // 24 h of the invitation + 1 h of the window (L29), not the two hours of a joiner.
    expect(maxAgeOf(response)).toBeGreaterThan(24.9 * 3600);
    expect(maxAgeOf(response)).toBeLessThanOrEqual(25 * 3600);
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

    const waiting = await state(gameId, cookie);
    expect(waiting.status).toBe(200);
    expect(waiting.data).toMatchObject({
      status: "waiting",
      you: { seat: 1, kind: "guest" },
      invitation: { code, url: `${baseUrl}/invite/${code}` },
    });
    expect(waiting.data.players[0]).toMatchObject({ kind: "guest", displayName: "Ala" });
    const [player] = await run(`select kind, user_id, nickname from game_players where game_id = ?`, [gameId]);
    expect(player).toEqual({ kind: "guest", user_id: null, nickname: "Ala" });
  });

  it("answers 400 without the acknowledgement or with an invalid nickname, creating nothing", async () => {
    const before = await run(`select count(*)::int as n from games`);
    for (const [payload, field] of [
      [undefined, undefined],
      [{}, "acknowledgedGuestWarning"],
      [{ acknowledgedGuestWarning: false }, "acknowledgedGuestWarning"],
      [{ acknowledgedGuestWarning: true, nickname: "<script>" }, "nickname"],
    ] as const) {
      const response = await call("POST", "/api/games", payload, {});
      expect(response.status).toBe(400);
      const { error } = await body(response);
      expect(error.code).toBe("VALIDATION");
      if (field) expect(Object.keys(error.fieldErrors)).toContain(field);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(await run(`select count(*)::int as n from games`)).toEqual(before);
  });

  it("answers 403 without the CSRF header", async () => {
    expect((await post("/api/games", GUEST_BODY, { "x-gomoku-request": null })).status).toBe(403);
  });

  it("limits the creates per address to 10 an hour: 429 with Retry-After", async () => {
    const address = nextAddress();
    for (let i = 0; i < CREATE_GAME_LIMIT; i += 1) {
      expect((await post("/api/games", GUEST_BODY, { "x-forwarded-for": address })).status).toBe(201);
    }
    const limited = await post("/api/games", GUEST_BODY, { "x-forwarded-for": address });
    expect(limited.status).toBe(429);
    expect((await body(limited)).error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another address is not affected.
    expect((await post("/api/games", GUEST_BODY)).status).toBe(201);
  });

  it("ignores the guest fields for a signed-in user: an account game, no guest cookie", async () => {
    const alice = await signedUp();
    const response = await post("/api/games", { nickname: "<script>", cancelOwnWaitingGame: true }, { cookie: alice });
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
    const { gameId } = (await body(response)).data;
    expect((await state(gameId, alice)).data.you).toMatchObject({ seat: 1, kind: "account" });
  });
});

describe("BR-13 for a browser without an account", () => {
  it("refuses a second game of the same browser and offers the own waiting one", async () => {
    const first = await guestCreate();
    const again = await post("/api/games", GUEST_BODY, { cookie: first.cookie });
    expect(again.status).toBe(409);
    const { error } = await body(again);
    expect(error).toMatchObject({ code: "OWN_WAITING_GAME", data: { gameId: first.gameId } });
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("cancels the own waiting game and creates the new one when asked, keeping the same cookie", async () => {
    const first = await guestCreate();
    const second = await post("/api/games", { ...GUEST_BODY, cancelOwnWaitingGame: true }, { cookie: first.cookie });
    expect(second.status).toBe(201);
    expect(cookieOf(second)).toBe(first.cookie);
    const { gameId } = (await body(second)).data;
    expect(gameId).not.toBe(first.gameId);
    const [old] = await run(`select status from games where id = ?`, [first.gameId]);
    expect(old).toEqual({ status: "cancelled" });
    expect((await state(gameId, first.cookie)).status).toBe(200);
    // The old game is no longer the browser's.
    expect((await state(first.gameId, first.cookie)).status).toBe(404);
  });

  it("refuses a browser that is in a game in progress", async () => {
    const creator = await guestCreate();
    const joined = await post(`/api/invitations/${creator.code}/accept`, { as: "user" }, { cookie: await signedUp() });
    expect(joined.status).toBe(200);
    const again = await post("/api/games", { ...GUEST_BODY, cancelOwnWaitingGame: true }, { cookie: creator.cookie });
    expect(again.status).toBe(409);
    expect((await body(again)).error).toMatchObject({ code: "ACTIVE_GAME_EXISTS", data: { gameId: creator.gameId } });
  });
});

describe("a game of a guest creator", () => {
  it("is played to the end against another guest, and both browsers are free afterwards", async () => {
    const creator = await guestCreate({ nickname: "Ala" });
    const joined = await post(`/api/invitations/${creator.code}/accept`, { ...GUEST_BODY, as: "guest", nickname: "Ola" });
    expect(joined.status).toBe(200);
    const joiner = cookieOf(joined);
    expect(joiner).not.toBe(creator.cookie);

    const finished = await playToTheEnd(creator.gameId, creator.cookie, joiner);
    expect(finished).toMatchObject({ status: "finished", result: { reason: "five_in_row" } });
    expect(finished.players.map((p: Json) => [p.kind, p.displayName])).toEqual([
      ["guest", "Ala"],
      ["guest", "Ola"],
    ]);
    // Both slots are free: the creator starts a new game with the same cookie.
    const next = await post("/api/games", GUEST_BODY, { cookie: creator.cookie });
    expect(next.status).toBe(201);
    expect((await run(`select count(*)::int as n from game_players where game_id = ? and is_active`, [creator.gameId]))[0]).toEqual({ n: 0 });
  });

  it("is played to the end against an account", async () => {
    const creator = await guestCreate();
    const bob = await signedUp();
    expect((await post(`/api/invitations/${creator.code}/accept`, { as: "user" }, { cookie: bob })).status).toBe(200);

    const finished = await playToTheEnd(creator.gameId, creator.cookie, bob);
    expect(finished.status).toBe("finished");
    expect(finished.players.map((p: Json) => p.kind)).toEqual(["guest", "account"]);
    expect(finished.players[0].displayName).toBe("Gracz 1");
  });

  it("refuses the creator's own invitation: 409 OWN_INVITATION with the game id", async () => {
    const creator = await guestCreate();
    const own = await post(`/api/invitations/${creator.code}/accept`, { ...GUEST_BODY, as: "guest" }, { cookie: creator.cookie });
    expect(own.status).toBe(409);
    expect((await body(own)).error).toMatchObject({ code: "OWN_INVITATION", data: { gameId: creator.gameId } });
  });

  it("is cancelled by its creator, but not by a stranger; a repeated cancel is 409", async () => {
    const creator = await guestCreate();
    const stranger = await guestCreate();

    expect((await post(`/api/games/${creator.gameId}/cancel`, undefined, { cookie: stranger.cookie })).status).toBe(404);
    expect((await post(`/api/games/${creator.gameId}/cancel`)).status).toBe(404);

    const cancelled = await post(`/api/games/${creator.gameId}/cancel`, undefined, { cookie: creator.cookie });
    expect(cancelled.status).toBe(200);
    // The invitation is void, and the creator's token no longer opens the game.
    expect((await post(`/api/invitations/${creator.code}/accept`, { as: "user" }, { cookie: await signedUp() })).status).toBe(410);
    expect((await state(creator.gameId, creator.cookie)).status).toBe(404);
    // A browser freed by the cancel creates again.
    expect((await post("/api/games", GUEST_BODY, { cookie: creator.cookie })).status).toBe(201);
  });

  it("shows \"invitation expired\" for an hour after the expiry, then 404 (L29)", async () => {
    const creator = await guestCreate();
    await run(`update invitations set expires_at = now() - interval '5 minutes' where game_id = ?`, [creator.gameId]);

    const expired = await state(creator.gameId, creator.cookie);
    expect(expired.status).toBe(200);
    expect(expired.data).toMatchObject({ status: "cancelled", closedReason: "expired" });
    // The expiry freed the slot: the same browser creates a new game.
    const [slot] = await run(`select is_active from game_players where game_id = ?`, [creator.gameId]);
    expect(slot).toEqual({ is_active: false });

    await run(`update invitations set expires_at = now() - interval '61 minutes' where game_id = ?`, [creator.gameId]);
    expect((await state(creator.gameId, creator.cookie)).status).toBe(404);
  });

  it("answers the expired invitation of a guest creator with 410 for the others", async () => {
    const creator = await guestCreate();
    await run(`update invitations set expires_at = now() - interval '5 minutes' where game_id = ?`, [creator.gameId]);
    const response = await post(`/api/invitations/${creator.code}/accept`, { as: "user" }, { cookie: await signedUp() });
    expect(response.status).toBe(410);
  });
});
