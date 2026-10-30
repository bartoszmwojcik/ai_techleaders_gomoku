// Rematch over HTTP (E02-S06, #88) against the built app and a real PostgreSQL: a game played
// to the end, the offer, accepting with swapped colours, declining, expiry, a second offer,
// strangers, and a guest who gets the token of the new game in a cookie.
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
const nextAddress = () => `198.19.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
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
  return fetch(`${baseUrl}${path}`, { method, headers: sent, body: body === undefined ? undefined : JSON.stringify(body) });
}

const cookieOf = (response: Response): string => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const guestCookieOf = (response: Response): string | undefined =>
  (response.headers.getSetCookie?.() ?? []).find((line) => line.startsWith("gomoku_guest="))?.split(";")[0];
const GUEST = { as: "guest", acknowledgedGuestWarning: true };

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await call("POST", "/api/auth/register", {
    email: `rematch-${n}@example.com`,
    displayName: `Rm_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

const stateOf = async (game: string, cookie: string) => {
  const response = await call("GET", `/api/games/${game}`, undefined, { cookie });
  return { status: response.status, response, data: ((await response.json()) as { data: Json }).data };
};
const post = (path: string, cookie?: string, headers: Headers = {}) =>
  call("POST", path, undefined, cookie ? { cookie, ...headers } : headers);
const offer = (game: string, cookie: string) => post(`/api/games/${game}/rematch`, cookie);
const accept = (game: string, cookie: string) => post(`/api/games/${game}/rematch/accept`, cookie);
const decline = (game: string, cookie: string) => post(`/api/games/${game}/rematch/decline`, cookie);
const errorOf = async (response: Response) => ((await response.json()) as { error: Json }).error;

type Played = { gameId: string; blackSeat: 1 | 2; black: string; white: string };

/** A game between `alice` (seat 1) and the joiner, played until black has five in a row. */
async function playedGame(alice: string, join: { cookie: string } | "guest"): Promise<Played & { joiner: string }> {
  const created = await call("POST", "/api/games", {}, { cookie: alice });
  const { gameId, invitation } = ((await created.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
  const code = invitation.code;
  const joined =
    join === "guest"
      ? await call("POST", `/api/invitations/${code}/accept`, GUEST)
      : await call("POST", `/api/invitations/${code}/accept`, { as: "user" }, { cookie: join.cookie });
  expect(joined.status).toBe(200);
  const joiner = join === "guest" ? guestCookieOf(joined)! : join.cookie;
  expect((await stateOf(gameId, alice)).status).toBe(200);
  const [row] = await run(`select black_seat from games where id = ?`, [gameId]);
  const blackSeat = row!.black_seat as 1 | 2;
  const game = { gameId, blackSeat, black: blackSeat === 1 ? alice : joiner, white: blackSeat === 1 ? joiner : alice, joiner };
  for (let i = 0; i < 9; i++) {
    const black = i % 2 === 0;
    const n = Math.floor(i / 2);
    const response = await call("POST", `/api/games/${gameId}/moves`, { x: n, y: black ? 0 : 1, moveNumber: i + 1 }, { cookie: black ? game.black : game.white });
    expect(response.status, `move ${i + 1}`).toBe(200);
  }
  expect((await stateOf(gameId, alice)).data).toMatchObject({ status: "finished", result: { reason: "five_in_row" } });
  return game;
}

describe("rematch between two accounts", () => {
  it("offer, state for both, accept, a new game with swapped colours", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const game = await playedGame(alice, { cookie: bob });
    expect((await stateOf(game.gameId, bob)).data.rematch).toBeUndefined();

    const offered = await offer(game.gameId, game.white);
    expect(offered.status).toBe(200);
    const offerBody = ((await offered.json()) as { data: Json }).data;
    expect(offerBody).toMatchObject({ state: "pending", offeredBySeat: game.blackSeat === 1 ? 2 : 1, gameId: null });
    expect(Date.parse(offerBody.expiresAt) - Date.now()).toBeGreaterThan(4 * 60_000);

    for (const cookie of [alice, bob]) {
      expect((await stateOf(game.gameId, cookie)).data.rematch).toEqual(offerBody);
    }

    // A second offer, from either side, is refused while this one is open.
    expect((await errorOf(await offer(game.gameId, game.black))).code).toBe("REMATCH_ALREADY_OFFERED");
    // The proposer cannot accept their own offer.
    expect((await errorOf(await accept(game.gameId, game.white))).code).toBe("REMATCH_NOT_OFFERED");

    const accepted = await accept(game.gameId, game.black);
    expect(accepted.status).toBe(200);
    const { gameId: newId, ...rest } = ((await accepted.json()) as { data: Json }).data;
    expect(rest).toEqual({});
    expect(guestCookieOf(accepted)).toBeUndefined();

    // Both are sent to the new game: the proposer finds it in the state of the old one.
    expect((await stateOf(game.gameId, game.white)).data.rematch).toMatchObject({ state: "accepted", gameId: newId });
    const fresh = await stateOf(newId, game.white);
    expect(fresh.data).toMatchObject({
      status: "active",
      blackSeat: game.blackSeat === 1 ? 2 : 1,
      moveCount: 0,
      you: { seat: game.white === alice ? 1 : 2 },
    });
    expect((await stateOf(newId, game.black)).status).toBe(200);
    const [row] = await run(`select origin from games where id = ?`, [newId]);
    expect(row!.origin).toBe("rematch");
    // The accepted offer cannot be accepted again by the proposer, nor offered again.
    expect((await errorOf(await offer(game.gameId, game.black))).code).toBe("REMATCH_ALREADY_OFFERED");
  });

  it("decline: the proposer sees it declined and may offer again", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const game = await playedGame(alice, { cookie: bob });
    expect((await offer(game.gameId, alice)).status).toBe(200);

    const declined = await decline(game.gameId, bob);
    expect(declined.status).toBe(200);
    expect(((await declined.json()) as Json).data).toBeNull();
    expect((await stateOf(game.gameId, alice)).data.rematch).toMatchObject({ state: "declined" });
    expect((await errorOf(await accept(game.gameId, bob))).code).toBe("REMATCH_NOT_OFFERED");
    // Leaving to the panel twice is harmless.
    expect((await decline(game.gameId, bob)).status).toBe(200);
    expect((await offer(game.gameId, alice)).status).toBe(200);
  });

  it("the proposer may withdraw the offer", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const game = await playedGame(alice, { cookie: bob });
    await offer(game.gameId, bob);
    expect((await decline(game.gameId, bob)).status).toBe(200);
    expect((await stateOf(game.gameId, alice)).data.rematch).toMatchObject({ state: "declined", offeredBySeat: 2 });
  });

  it("an offer expires after five minutes: read as expired, accept and decline say so, a new one is allowed", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const game = await playedGame(alice, { cookie: bob });
    await offer(game.gameId, alice);
    await run(`update games set rematch_expires_at = now() - interval '1 second' where id = ?`, [game.gameId]);

    expect((await stateOf(game.gameId, bob)).data.rematch).toMatchObject({ state: "expired" });
    const late = await accept(game.gameId, bob);
    expect(late.status).toBe(409);
    expect((await errorOf(late)).code).toBe("REMATCH_EXPIRED");
    expect((await errorOf(await decline(game.gameId, bob))).code).toBe("REMATCH_EXPIRED");

    expect((await offer(game.gameId, bob)).status).toBe(200);
    expect((await stateOf(game.gameId, alice)).data.rematch).toMatchObject({ state: "pending", offeredBySeat: 2 });
  });

  it("refuses an offer on a game that is not finished, and a stranger gets 404 everywhere", async () => {
    const [alice, bob, eve] = [await signedUp(), await signedUp(), await signedUp()];
    const created = await call("POST", "/api/games", {}, { cookie: alice });
    const { gameId, invitation } = ((await created.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
    await call("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, { cookie: bob });
    const early = await offer(gameId, alice);
    expect(early.status).toBe(409);
    expect((await errorOf(early)).code).toBe("GAME_NOT_FINISHED");

    const game = await playedGame(await signedUp(), { cookie: await signedUp() });
    for (const send of [offer, accept, decline]) {
      expect((await send(game.gameId, eve)).status).toBe(404);
    }
    expect((await post(`/api/games/${game.gameId}/rematch`)).status).toBe(404);
    expect((await post("/api/games/not-a-uuid/rematch", eve)).status).toBe(404);
  });

  it("is protected by CSRF", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const game = await playedGame(alice, { cookie: bob });
    for (const path of ["rematch", "rematch/accept", "rematch/decline"]) {
      const response = await post(`/api/games/${game.gameId}/${path}`, alice, { "x-gomoku-request": null });
      expect(response.status, path).toBe(403);
    }
    expect((await stateOf(game.gameId, alice)).data.rematch).toBeUndefined();
  });

  it("accept refuses when the caller already has another game (BR-13), with a link", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const game = await playedGame(alice, { cookie: bob });
    await offer(game.gameId, alice);
    const other = ((await (await call("POST", "/api/games", {}, { cookie: bob })).json()) as { data: { gameId: string } }).data.gameId;

    const blocked = await accept(game.gameId, bob);

    expect(blocked.status).toBe(409);
    expect(await errorOf(blocked)).toMatchObject({ code: "ACTIVE_GAME_EXISTS", data: { gameId: other } });
    expect((await stateOf(game.gameId, alice)).data.rematch).toMatchObject({ state: "pending" });
  });
});

describe("rematch with a guest", () => {
  it("a guest acceptor gets the token of the new game in the cookie, never in the JSON", async () => {
    const alice = await signedUp();
    const game = await playedGame(alice, "guest");
    await offer(game.gameId, alice);

    const accepted = await accept(game.gameId, game.joiner);

    expect(accepted.status).toBe(200);
    const fresh = guestCookieOf(accepted)!;
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(game.joiner);
    const text = await accepted.text();
    const { gameId: newId } = JSON.parse(text).data as { gameId: string };
    expect(text).not.toContain(fresh.split("=")[1]);
    expect(accepted.headers.getSetCookie?.().find((line) => line.startsWith("gomoku_guest="))).toMatch(/HttpOnly/i);
    expect((await stateOf(newId, fresh)).data).toMatchObject({ status: "active", you: { kind: "guest" } });
    expect((await stateOf(newId, game.joiner)).status).toBe(404);
  });

  it("a guest who proposed gets the token while following the accepted offer, the same one each time", async () => {
    const alice = await signedUp();
    const game = await playedGame(alice, "guest");
    expect((await offer(game.gameId, game.joiner)).status).toBe(200);
    const newId = ((await (await accept(game.gameId, alice)).json()) as { data: { gameId: string } }).data.gameId;

    const followed = await stateOf(game.gameId, game.joiner);
    expect(followed.data.rematch).toMatchObject({ state: "accepted", gameId: newId });
    const fresh = guestCookieOf(followed.response)!;
    expect(fresh).toBeDefined();
    expect(guestCookieOf((await stateOf(game.gameId, game.joiner)).response)).toBe(fresh);
    expect((await stateOf(newId, fresh)).data).toMatchObject({ status: "active", you: { kind: "guest", seat: 2 } });
  });

  it("copies a guest's nickname to the rematch", async () => {
    const alice = await signedUp();
    const created = await call("POST", "/api/games", {}, { cookie: alice });
    const { gameId, invitation } = ((await created.json()) as { data: { gameId: string; invitation: { code: string } } }).data;
    const joined = await call("POST", `/api/invitations/${invitation.code}/accept`, { ...GUEST, nickname: "Olek" });
    const guest = guestCookieOf(joined)!;
    await stateOf(gameId, alice);
    await run(`update games set status = 'finished', finished_at = now(), end_reason = 'draw' where id = ?`, [gameId]);
    await run(`update game_players set is_active = false where game_id = ?`, [gameId]);
    await offer(gameId, alice);

    const accepted = await accept(gameId, guest);

    const newId = ((await accepted.json()) as { data: { gameId: string } }).data.gameId;
    const state = await stateOf(newId, guestCookieOf(accepted)!);
    expect(state.data.players.map((player: Json) => player.displayName)).toEqual([expect.any(String), "Olek"]);
  });
});
