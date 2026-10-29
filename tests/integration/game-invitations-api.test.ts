// The invitation flow over HTTP (E02 phase 2) against the built app and a real PostgreSQL:
// create a game, get the code, join with a second account, refuse a third person, cancel.
import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// Every request uses its own client address (X-Forwarded-For, one trusted hop), so the pool of
// failed code lookups (20 per address) of one test never spends another's budget.
let addressCounter = 0;
const nextAddress = () => `198.19.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

type Headers = Record<string, string | null>;

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
const get = (path: string, headers?: Headers) => call("GET", path, undefined, headers);

const cookieOf = (response: Response): string =>
  (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

async function signedUp(): Promise<string> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const response = await post("/api/auth/register", {
    email: `invite-${n}@example.com`,
    displayName: `Invite_${n}`,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  return cookieOf(response);
}

type Created = { gameId: string; code: string; url: string; expiresAt: string };

async function createGame(cookie: string): Promise<Created> {
  const response = await post("/api/games", undefined, { cookie });
  expect(response.status).toBe(201);
  const { data } = (await response.json()) as {
    data: { gameId: string; invitation: { code: string; url: string; expiresAt: string } };
  };
  return { gameId: data.gameId, ...data.invitation };
}

const accept = (code: string, body: unknown, cookie?: string, headers: Headers = {}) =>
  post(`/api/invitations/${code}/accept`, body, { ...(cookie ? { cookie } : {}), ...headers });
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const stateOf = async (gameId: string, cookie?: string) => {
  const response = await get(`/api/games/${gameId}`, cookie ? { cookie } : {});
  return { status: response.status, body: (await response.json()) as { ok: boolean; data: Json; error?: Json } };
};
const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

describe("invitation flow over HTTP", () => {
  it("creates a game, joins a second account, refuses a third person and shows the state", async () => {
    const alice = await signedUp();
    const bob = await signedUp();
    const carol = await signedUp();

    const created = await createGame(alice);
    expect(created.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(created.url).toBe(`${baseUrl}/invite/${created.code}`);
    expect(Date.parse(created.expiresAt)).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    const waiting = await stateOf(created.gameId, alice);
    expect(waiting.status).toBe(200);
    expect(waiting.body.data).toMatchObject({
      status: "waiting",
      you: { seat: 1, kind: "account" },
      invitation: { code: created.code },
    });
    expect(waiting.body.data.players).toHaveLength(1);

    const joined = await accept(created.code.toLowerCase().replace("-", ""), { as: "user" }, bob);
    expect(joined.status).toBe(200);
    expect(await joined.json()).toEqual({ ok: true, data: { gameId: created.gameId } });

    // A third person: the uniform "invalid", and a repeat by Bob returns the game.
    const third = await accept(created.code, { as: "user" }, carol);
    expect(third.status).toBe(410);
    expect(await errorCode(third)).toBe("INVALID_INVITATION");
    expect((await accept(created.code, { as: "user" }, bob)).status).toBe(200);

    const forBob = await stateOf(created.gameId, bob);
    expect(forBob.body.data).toMatchObject({ status: "active", you: { seat: 2, kind: "account" } });
    expect(forBob.body.data.invitation).toBeUndefined();
    expect(forBob.body.data.players.map((p: { seat: number }) => p.seat)).toEqual([1, 2]);
    const forAlice = await stateOf(created.gameId, alice);
    expect(forAlice.body.data.status).toBe("active");
    expect(forAlice.body.data.invitation).toBeUndefined();
    expect(forAlice.body.data.players.every((p: { seen: boolean }) => p.seen)).toBe(true);
  });

  it("hides the game from outsiders with 404, whatever the reason", async () => {
    const alice = await signedUp();
    const carol = await signedUp();
    const { gameId } = await createGame(alice);

    expect((await stateOf(gameId, carol)).status).toBe(404);
    expect((await stateOf(gameId)).status).toBe(404);
    expect((await stateOf("00000000-0000-4000-8000-000000000000", alice)).status).toBe(404);
    expect((await stateOf("not-a-uuid", alice)).status).toBe(404);
  });

  it("enforces BR-13, refuses own invitations and offers to drop an own waiting game", async () => {
    const alice = await signedUp();
    const bob = await signedUp();
    const first = await createGame(alice);

    const second = await post("/api/games", undefined, { cookie: alice });
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe("ACTIVE_GAME_EXISTS");

    const own = await accept(first.code, { as: "user" }, alice);
    expect(own.status).toBe(409);
    expect(((await own.json()) as { error: { code: string; data: { gameId: string } } }).error).toMatchObject({
      code: "OWN_INVITATION",
      data: { gameId: first.gameId },
    });

    const bobs = await createGame(bob);
    const clash = await accept(first.code, { as: "user" }, bob);
    expect(clash.status).toBe(409);
    expect(((await clash.json()) as { error: Json }).error).toMatchObject({
      code: "OWN_WAITING_GAME",
      data: { gameId: bobs.gameId },
    });
    const dropped = await accept(first.code, { as: "user", cancelOwnWaitingGame: true }, bob);
    expect(dropped.status).toBe(200);
    expect((await stateOf(bobs.gameId, bob)).body.data.status).toBe("cancelled");
    expect((await stateOf(first.gameId, alice)).body.data.status).toBe("active");
  });

  it("cancels a waiting game, kills its link and frees the creator", async () => {
    const alice = await signedUp();
    const bob = await signedUp();
    const { gameId, code } = await createGame(alice);

    expect((await post(`/api/games/${gameId}/cancel`, undefined, { cookie: bob })).status).toBe(404);
    const cancelled = await post(`/api/games/${gameId}/cancel`, undefined, { cookie: alice });
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ ok: true, data: null });

    expect((await stateOf(gameId, alice)).body.data.status).toBe("cancelled");
    const late = await accept(code, { as: "user" }, bob);
    expect(late.status).toBe(410);
    expect(await errorCode(late)).toBe("INVALID_INVITATION");
    const again = await post(`/api/games/${gameId}/cancel`, undefined, { cookie: alice });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("GAME_NOT_CANCELLABLE");
    // The slot is free again.
    await createGame(alice);
  });

  it("does not let the creator cancel a game that already started", async () => {
    const alice = await signedUp();
    const bob = await signedUp();
    const { gameId, code } = await createGame(alice);
    await accept(code, { as: "user" }, bob);

    const response = await post(`/api/games/${gameId}/cancel`, undefined, { cookie: alice });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("GAME_NOT_CANCELLABLE");
    expect((await stateOf(gameId, alice)).body.data.status).toBe("active");
  });

  it("lets exactly one of several parallel accepts win", async () => {
    const alice = await signedUp();
    const { gameId, code } = await createGame(alice);
    const joiners = await Promise.all(Array.from({ length: 6 }, () => signedUp()));

    const responses = await Promise.all(joiners.map((cookie) => accept(code, { as: "user" }, cookie)));

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 410, 410, 410, 410, 410]);
    const state = await stateOf(gameId, alice);
    expect(state.body.data.status).toBe("active");
    expect(state.body.data.players).toHaveLength(2);
  });

  it("settles a race of accept and cancel: never an active game after a cancelled one", async () => {
    for (let round = 0; round < 4; round += 1) {
      const alice = await signedUp();
      const bob = await signedUp();
      const { gameId, code } = await createGame(alice);

      const [joined, cancelled] = await Promise.all([
        accept(code, { as: "user" }, bob),
        post(`/api/games/${gameId}/cancel`, undefined, { cookie: alice }),
      ]);

      const status = (await stateOf(gameId, alice)).body.data.status;
      if (joined.status === 200) {
        expect(cancelled.status).toBe(409);
        expect(status).toBe("active");
      } else {
        expect(joined.status).toBe(410);
        expect(cancelled.status).toBe(200);
        expect(status).toBe("cancelled");
      }
    }
  });

  it("answers 401 without a session, 400 for bad input and 403 without CSRF", async () => {
    const alice = await signedUp();
    const { code } = await createGame(alice);

    expect((await post("/api/games")).status).toBe(401);
    expect((await accept(code, { as: "user" })).status).toBe(401);
    expect((await post("/api/games/4d293981-7b3c-4f81-a1af-0a9e3bf3636b/cancel")).status).toBe(401);
    expect((await accept(code, { as: "wizard" }, alice)).status).toBe(400);
    expect((await accept(code, { as: "guest" }, alice)).status).toBe(400);
    expect((await post("/api/games", undefined, { cookie: alice, "x-gomoku-request": null })).status).toBe(403);
    expect((await accept(code, { as: "user" }, alice, { origin: "https://evil.example" })).status).toBe(403);
  });

  it("answers the same 410 for unknown and malformed codes, then 429 after 20 failures from one address", async () => {
    const bob = await signedUp();
    const address = { "x-forwarded-for": "203.0.113.77" };
    const alice = await signedUp();
    const { code } = await createGame(alice);

    const unknown = await accept("ZZZZ-ZZZZ", { as: "user" }, bob, address);
    const malformed = await accept("hello", { as: "user" }, bob, address);
    expect(unknown.status).toBe(410);
    expect(malformed.status).toBe(410);
    expect(await unknown.json()).toEqual(await malformed.json());

    for (let attempt = 2; attempt < 20; attempt += 1) {
      expect((await accept("ZZZZ-ZZZZ", { as: "user" }, bob, address)).status).toBe(410);
    }
    // The pool is spent: 429 with Retry-After, even for the valid code.
    const refused = await accept(code, { as: "user" }, bob, address);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).not.toBeNull();
    // Another address is not affected and the game was never joined by that attempt.
    expect((await accept(code, { as: "user" }, bob)).status).toBe(200);
  });
});
