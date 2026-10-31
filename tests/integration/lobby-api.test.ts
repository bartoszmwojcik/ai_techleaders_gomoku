// The lobby over HTTP (E03-S01, #25 and #31; picking an opponent, E03-S02, #26) against the built app and a real PostgreSQL: marking,
// the list of the others (names only), the 5-minute expiry at its boundary, withdrawing, BR-13,
// the status ending with a game / logout / account deletion, and the races that mock-based
// tests cannot see (parallel marks, marking against creating a game).
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

let orm: Orm;
beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await clearLobby();
  await orm.close();
});
// Statuses of other files would crowd the oldest-first list of 50; every test starts from an empty lobby.
beforeEach(clearLobby);

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any
async function clearLobby() {
  await orm.em.fork().execute(`delete from lobby_seekers`, [], "run");
}

let addressCounter = 0;
const nextAddress = () => `198.20.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
let userCounter = 0;

type Headers = Record<string, string | null>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function call(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, headers: Headers = {}) {
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
const dataOf = async (response: Response) => ((await response.json()) as { data: Json }).data;
const errorOf = async (response: Response) => ((await response.json()) as { error: Json }).error;

type Account = { cookie: string; id: string; name: string };
async function signedUp(): Promise<Account> {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const name = `Lb_${n}`;
  const response = await call("POST", "/api/auth/register", {
    email: `lobby-${n}@example.com`,
    displayName: name,
    password: "secret123",
  });
  expect(response.status).toBe(201);
  const [row] = await run(`select id from users where display_name = ?`, [name]);
  return { cookie: cookieOf(response), id: row!.id as string, name };
}

const lobby = async (who: Account) => {
  const response = await call("GET", "/api/lobby", undefined, { cookie: who.cookie });
  expect(response.status).toBe(200);
  return dataOf(response);
};
const mark = (who: Account) => call("PUT", "/api/lobby/seeking", undefined, { cookie: who.cookie });
const withdraw = (who: Account) => call("DELETE", "/api/lobby/seeking", undefined, { cookie: who.cookie });
const seekerRows = async (who: Account) =>
  Number((await run(`select count(*)::int as n from lobby_seekers where user_id = ?`, [who.id]))[0]!.n);
const namesOf = (view: Json) => (view.seekers as Json[]).map((seeker) => seeker.displayName);

async function createGame(who: Account) {
  const response = await call("POST", "/api/games", {}, { cookie: who.cookie });
  expect(response.status).toBe(201);
  return (await dataOf(response)) as { gameId: string; invitation: { code: string } };
}

describe("access and CSRF", () => {
  it("answers 401 to every call without a session", async () => {
    expect((await call("GET", "/api/lobby")).status).toBe(401);
    expect((await call("PUT", "/api/lobby/seeking")).status).toBe(401);
    expect((await call("DELETE", "/api/lobby/seeking")).status).toBe(401);
  });

  it("rejects a write without the CSRF header or from a foreign origin with 403", async () => {
    const who = await signedUp();
    expect((await call("PUT", "/api/lobby/seeking", undefined, { cookie: who.cookie, "x-gomoku-request": null })).status).toBe(403);
    expect((await call("PUT", "/api/lobby/seeking", undefined, { cookie: who.cookie, origin: "https://evil.example" })).status).toBe(403);
    expect((await call("DELETE", "/api/lobby/seeking", undefined, { cookie: who.cookie, origin: "https://evil.example" })).status).toBe(403);
    expect(await seekerRows(who)).toBe(0);
  });
});

describe("marking and the list", () => {
  it("marks for 5 minutes and shows the user to others by public name only, never to themselves", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];

    const marked = await mark(alice);
    expect(marked.status).toBe(200);
    const { me } = await dataOf(marked);
    expect(me.expiresInMs).toBeGreaterThan(299_000);
    expect(me.expiresInMs).toBeLessThanOrEqual(300_000);
    expect(Date.parse(me.createdAt)).toBeLessThanOrEqual(Date.now() + 1000);

    const seenByBob = await lobby(bob);
    expect(seenByBob.me).toBeNull();
    expect(seenByBob.seekers).toEqual([
      { id: me.id, displayName: alice.name, sinceMs: expect.any(Number), expiresInMs: expect.any(Number) },
    ]);
    // Nothing that identifies the account beyond the public name (BR-14).
    const raw = JSON.stringify(seenByBob);
    expect(raw).not.toContain(alice.id);
    expect(raw).not.toContain("@example.com");
    expect(seenByBob.seekers[0].expiresInMs).toBeLessThanOrEqual(300_000);

    const seenByAlice = await lobby(alice);
    expect(seenByAlice.me).toMatchObject({ id: me.id });
    expect(seenByAlice.seekers).toEqual([]);
    expect(seenByAlice.currentGame).toBeNull();
  });

  it("lists the oldest statuses first", async () => {
    const [first, second, viewer] = [await signedUp(), await signedUp(), await signedUp()];
    await mark(first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await mark(second);

    expect(namesOf(await lobby(viewer))).toEqual([first.name, second.name]);
  });

  it("is idempotent: marking again returns the same status and does not renew the time (Q3)", async () => {
    const who = await signedUp();
    const { me: first } = await dataOf(await mark(who));
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const { me: again } = await dataOf(await mark(who));

    expect(again.id).toBe(first.id);
    expect(again.createdAt).toBe(first.createdAt);
    expect(again.expiresInMs).toBeLessThan(first.expiresInMs);
    expect(await seekerRows(who)).toBe(1);
  });

  it("keeps one row when the same account marks in parallel (two tabs)", async () => {
    const who = await signedUp();

    const answers = await Promise.all(Array.from({ length: 6 }, () => mark(who)));

    expect(answers.map((answer) => answer.status)).toEqual(Array(6).fill(200));
    const ids = new Set((await Promise.all(answers.map(dataOf))).map(({ me }) => me.id));
    expect(ids.size).toBe(1);
    expect(await seekerRows(who)).toBe(1);
  });

  it("shows at most 50 seekers", async () => {
    const viewer = await signedUp();
    await run(
      `insert into users (email, display_name, display_name_key, password_hash)
       select 'lobby-bulk-' || n || '@example.com', 'LbBulk' || n, 'lbbulk' || n, repeat('x', 60)
       from generate_series(1, 55) n`,
    );
    await run(
      `insert into lobby_seekers (user_id, created_at, expires_at)
       select id, now() - interval '1 minute', now() + interval '4 minutes' from users where display_name like 'LbBulk%'`,
    );

    try {
      expect((await lobby(viewer)).seekers).toHaveLength(50);
    } finally {
      await run(`delete from users where display_name like 'LbBulk%'`);
    }
  });
});

describe("expiry (BR-12)", () => {
  it("shows a status until the second it expires, then drops the user from the list and from their own view", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    await mark(alice);
    // Just before: 2 s left.
    await run(`update lobby_seekers set created_at = now() - interval '298 seconds', expires_at = now() + interval '2 seconds' where user_id = ?`, [alice.id]);
    expect(namesOf(await lobby(bob))).toEqual([alice.name]);
    expect((await lobby(alice)).me.expiresInMs).toBeLessThanOrEqual(2000);

    // Just after: expired a second ago (the row still exists until the cleanup).
    await run(`update lobby_seekers set created_at = now() - interval '301 seconds', expires_at = now() - interval '1 second' where user_id = ?`, [alice.id]);

    expect((await lobby(bob)).seekers).toEqual([]);
    expect((await lobby(alice)).me).toBeNull();
    expect(await seekerRows(alice)).toBe(1);
  });

  it("starts a fresh 5 minutes when marking after the old status ran out", async () => {
    const who = await signedUp();
    const { me: old } = await dataOf(await mark(who));
    await run(`update lobby_seekers set created_at = now() - interval '301 seconds', expires_at = now() - interval '1 second' where user_id = ?`, [who.id]);

    const { me } = await dataOf(await mark(who));

    expect(me.expiresInMs).toBeGreaterThan(299_000);
    expect(me.id).toBe(old.id);
    expect(await seekerRows(who)).toBe(1);
    expect((await lobby(who)).me).toMatchObject({ id: me.id });
  });
});

describe("withdrawing", () => {
  it("removes the user from the list, and again is still 200", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    await mark(alice);
    expect(namesOf(await lobby(bob))).toEqual([alice.name]);

    const answer = await withdraw(alice);
    expect(answer.status).toBe(200);
    expect(await dataOf(answer)).toEqual({ me: null });

    expect((await lobby(bob)).seekers).toEqual([]);
    expect((await lobby(alice)).me).toBeNull();
    expect((await withdraw(alice)).status).toBe(200);
  });
});

describe("one game at a time (BR-13)", () => {
  it("refuses a user with a waiting game, with the game to return to", async () => {
    const who = await signedUp();
    const { gameId } = await createGame(who);

    const answer = await mark(who);

    expect(answer.status).toBe(409);
    expect(await errorOf(answer)).toMatchObject({ code: "ACTIVE_GAME_EXISTS", data: { gameId } });
    expect(await seekerRows(who)).toBe(0);
    expect((await lobby(who)).currentGame).toEqual({ gameId, status: "waiting" });
  });

  it("refuses a user whose game is in progress", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const { gameId, invitation } = await createGame(alice);
    expect((await call("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, { cookie: bob.cookie })).status).toBe(200);

    for (const player of [alice, bob]) {
      const answer = await mark(player);
      expect(answer.status).toBe(409);
      expect((await errorOf(answer)).data).toEqual({ gameId });
    }
    expect((await lobby(bob)).currentGame).toEqual({ gameId, status: "active" });
  });

  it("does not let an expired waiting game block the lobby (stale slots are closed first)", async () => {
    const who = await signedUp();
    const { gameId } = await createGame(who);
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [gameId]);

    expect((await mark(who)).status).toBe(200);
    expect((await run(`select status from games where id = ?`, [gameId]))[0]!.status).toBe("cancelled");
  });

  it("removes the status when the user creates a game", async () => {
    const who = await signedUp();
    await mark(who);

    await createGame(who);

    expect(await seekerRows(who)).toBe(0);
  });

  it("removes the status of the joiner when they accept an invitation, and keeps others' untouched", async () => {
    const [alice, bob, carol] = [await signedUp(), await signedUp(), await signedUp()];
    const { invitation } = await createGame(alice);
    await mark(bob);
    await mark(carol);

    expect((await call("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, { cookie: bob.cookie })).status).toBe(200);

    expect(await seekerRows(bob)).toBe(0);
    expect(await seekerRows(carol)).toBe(1);
  });

  it("keeps the status of a user who only looks at an invitation", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const { invitation } = await createGame(alice);
    await mark(bob);

    const page = await fetch(`${baseUrl}/invite/${invitation.code}`, { headers: { cookie: bob.cookie } });
    expect(page.status).toBe(200);

    expect(await seekerRows(bob)).toBe(1);
  });

  it("removes the statuses of both players when a rematch is accepted", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const { gameId, invitation } = await createGame(alice);
    expect((await call("POST", `/api/invitations/${invitation.code}/accept`, { as: "user" }, { cookie: bob.cookie })).status).toBe(200);
    // Both open the page (the clock starts), then alice resigns: the game is finished and both are free.
    for (const player of [alice, bob]) await call("GET", `/api/games/${gameId}`, undefined, { cookie: player.cookie });
    expect((await call("POST", `/api/games/${gameId}/resign`, undefined, { cookie: alice.cookie })).status).toBe(200);
    await mark(alice);
    await mark(bob);
    expect(await seekerRows(alice)).toBe(1);
    expect(await seekerRows(bob)).toBe(1);
    expect((await call("POST", `/api/games/${gameId}/rematch`, undefined, { cookie: alice.cookie })).status).toBe(200);

    const accepted = await call("POST", `/api/games/${gameId}/rematch/accept`, undefined, { cookie: bob.cookie });

    expect(accepted.status).toBe(200);
    expect(await seekerRows(alice)).toBe(0);
    expect(await seekerRows(bob)).toBe(0);
  });

  it("never leaves a user both seeking and holding a slot, whichever of two parallel requests wins", async () => {
    for (let round = 0; round < 6; round++) {
      const who = await signedUp();
      const [created, marked] = await Promise.all([
        call("POST", "/api/games", {}, { cookie: who.cookie }),
        mark(who),
      ]);

      // The game is always created: either the mark came first and is removed, or it is refused with 409.
      expect(created.status, `round ${round}`).toBe(201);
      expect([200, 409]).toContain(marked.status);
      expect(await seekerRows(who), `round ${round}`).toBe(0);
      const [slots] = await run(`select count(*)::int as n from game_players where user_id = ? and is_active`, [who.id]);
      expect(slots!.n).toBe(1);
    }
  });
});

describe("the status ends with the session or the account", () => {
  it("removes the status on logout", async () => {
    const who = await signedUp();
    await mark(who);

    const answer = await call("POST", "/api/auth/logout", undefined, { cookie: who.cookie });

    expect(answer.status).toBe(200);
    expect(await seekerRows(who)).toBe(0);
  });

  it("ends with the logout of any session of the user", async () => {
    // Logging out of one session removes the user's status (Q6): the person may still be signed in elsewhere
    // and can mark again; the opposite (a stale status after "logout") is the worse mistake.
    const who = await signedUp();
    const login = await call("POST", "/api/auth/login", { email: `lobby-${who.name.slice(3)}@example.com`, password: "secret123" });
    expect(login.status).toBe(200);
    await mark(who);

    await call("POST", "/api/auth/logout", undefined, { cookie: cookieOf(login) });

    expect(await seekerRows(who)).toBe(0);
  });

  it("is removed with the account (cascade)", async () => {
    const who = await signedUp();
    await mark(who);

    await run(`delete from users where id = ?`, [who.id]);

    expect((await run(`select count(*)::int as n from lobby_seekers where user_id = ?`, [who.id]))[0]!.n).toBe(0);
  });

  it("answers 401 to a mark from an account deleted meanwhile", async () => {
    const who = await signedUp();
    // The session row goes with the account, so the session check already refuses.
    await run(`delete from users where id = ?`, [who.id]);

    expect((await mark(who)).status).toBe(401);
  });
});

describe("limits", () => {
  it("answers 429 with Retry-After after 30 marks in an hour", async () => {
    const who = await signedUp();
    for (let i = 0; i < 30; i++) expect((await mark(who)).status, `mark ${i + 1}`).toBe(200);

    const refused = await mark(who);

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

// Picking an opponent (E03-S02, #26): one game from a status, whoever is faster.
const pick = (who: Account, seekerId: string, headers: Headers = {}) =>
  call("POST", `/api/lobby/seekers/${seekerId}/pick`, undefined, { cookie: who.cookie, ...headers });
const seekerIdOf = async (who: Account) => ((await dataOf(await mark(who))) as { me: { id: string } }).me.id;
const lobbyGames = async () =>
  Number((await run(`select count(*)::int as n from games where origin = 'lobby'`))[0]!.n);
const slotsOf = async (who: Account) =>
  Number((await run(`select count(*)::int as n from game_players where user_id = ? and is_active`, [who.id]))[0]!.n);

describe("picking an opponent from the lobby (#26)", () => {
  it("creates one active lobby game for both, removes both statuses and leads both to it", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);
    await mark(bob);

    const answer = await pick(bob, aliceStatus);

    expect(answer.status).toBe(200);
    const answered = await dataOf(answer);
    const { gameId } = answered;
    const [game] = await run(`select origin, status, black_seat from games where id = ?`, [gameId]);
    expect(game).toMatchObject({ origin: "lobby", status: "active" });
    expect([1, 2]).toContain(game!.black_seat);
    const players = await run(
      `select user_id, seat, kind, is_active, seen_at from game_players where game_id = ? order by seat`,
      [gameId],
    );
    expect(players).toEqual([
      { user_id: bob.id, seat: 1, kind: "account", is_active: true, seen_at: null },
      { user_id: alice.id, seat: 2, kind: "account", is_active: true, seen_at: null },
    ]);
    expect(await seekerRows(alice)).toBe(0);
    expect(await seekerRows(bob)).toBe(0);
    // The picked one is led to the game by the next read; the picker holds it too.
    expect((await lobby(alice)).currentGame).toEqual({ gameId, status: "active" });
    expect((await lobby(bob)).currentGame).toEqual({ gameId, status: "active" });
    // The seeker's id reveals no account (BR-14).
    expect(JSON.stringify(answered)).not.toContain(alice.id);
  });

  it("lets a user who is not seeking pick (Q2)", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);

    expect((await pick(bob, aliceStatus)).status).toBe(200);
    expect(await lobbyGames()).toBeGreaterThanOrEqual(1);
  });

  it("gives exactly one game when many pick the same seeker at once; the losers get LOBBY_SEEKER_TAKEN and keep their statuses", async () => {
    const seeker = await signedUp();
    const pickers = await Promise.all(Array.from({ length: 8 }, signedUp));
    const seekerId = await seekerIdOf(seeker);
    for (const picker of pickers) await mark(picker);
    const gamesBefore = await lobbyGames();

    const answers = await Promise.all(pickers.map((picker) => pick(picker, seekerId)));

    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409, 409, 409, 409]);
    for (const answer of answers.filter((a) => a.status === 409)) {
      expect(await errorOf(answer.clone())).toMatchObject({ code: "LOBBY_SEEKER_TAKEN" });
    }
    expect((await lobbyGames()) - gamesBefore).toBe(1);
    expect(await slotsOf(seeker)).toBe(1);
    const winners = pickers.filter((_, index) => answers[index]!.status === 200);
    expect(winners).toHaveLength(1);
    // The losers' own statuses survived the rollback; the winner's went with the game.
    for (const picker of pickers) expect(await seekerRows(picker)).toBe(picker === winners[0] ? 0 : 1);
  });

  it("gives exactly one game when A and B pick each other at once", async () => {
    for (let round = 0; round < 4; round++) {
      const [alice, bob] = [await signedUp(), await signedUp()];
      const [aliceStatus, bobStatus] = [await seekerIdOf(alice), await seekerIdOf(bob)];
      const gamesBefore = await lobbyGames();

      const [fromAlice, fromBob] = await Promise.all([pick(alice, bobStatus), pick(bob, aliceStatus)]);

      expect([fromAlice.status, fromBob.status].sort(), `round ${round}`).toEqual([200, 409]);
      const loser = fromAlice.status === 409 ? fromAlice : fromBob;
      expect((await errorOf(loser)).code, `round ${round}`).toBe("LOBBY_SEEKER_TAKEN");
      expect((await lobbyGames()) - gamesBefore, `round ${round}`).toBe(1);
      expect(await slotsOf(alice)).toBe(1);
      expect(await slotsOf(bob)).toBe(1);
    }
  });

  it("never leaves two slots when the seeker creates a game at the same moment (picks vs POST /api/games)", async () => {
    for (let round = 0; round < 4; round++) {
      const [seeker, picker] = [await signedUp(), await signedUp()];
      const seekerId = await seekerIdOf(seeker);

      const [picked, created] = await Promise.all([
        pick(picker, seekerId),
        call("POST", "/api/games", {}, { cookie: seeker.cookie }),
      ]);

      expect([picked.status, created.status].sort(), `round ${round}`).toSatisfy(
        (pair: number[]) => (pair[0] === 200 && pair[1] === 409) || (pair[0] === 201 && pair[1] === 409),
      );
      expect(await slotsOf(seeker), `round ${round}`).toBe(1);
      expect(await slotsOf(picker), `round ${round}`).toBeLessThanOrEqual(1);
      expect(await seekerRows(seeker), `round ${round}`).toBe(0);
    }
  });

  it("answers LOBBY_SEEKER_EXPIRED for a status that ran out, with no game and the picker's status kept", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);
    await mark(bob);
    const gamesBefore = await lobbyGames();
    // Just before the boundary the pick still works for another pair...
    await run(`update lobby_seekers set created_at = now() - interval '301 seconds', expires_at = now() - interval '1 second' where user_id = ?`, [alice.id]);

    const answer = await pick(bob, aliceStatus);

    expect(answer.status).toBe(409);
    expect((await errorOf(answer)).code).toBe("LOBBY_SEEKER_EXPIRED");
    expect(await lobbyGames()).toBe(gamesBefore);
    expect(await seekerRows(bob)).toBe(1);
    expect(await slotsOf(bob)).toBe(0);
  });

  it("accepts a status with seconds left", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);
    await run(`update lobby_seekers set created_at = now() - interval '298 seconds', expires_at = now() + interval '2 seconds' where user_id = ?`, [alice.id]);

    expect((await pick(bob, aliceStatus)).status).toBe(200);
  });

  it("answers LOBBY_SEEKER_TAKEN when the seeker withdrew or the id is unknown, and 404 for a malformed id", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);
    await withdraw(alice);

    // The row is gone: nobody can tell "never existed" from "taken", so both read as taken.
    for (const id of [aliceStatus, "00000000-0000-4000-8000-000000000000"]) {
      const gone = await pick(bob, id);
      expect(gone.status).toBe(409);
      expect((await errorOf(gone)).code).toBe("LOBBY_SEEKER_TAKEN");
    }
    const malformed = await pick(bob, "not-a-uuid");
    expect(malformed.status).toBe(404);
    expect((await errorOf(malformed)).code).toBe("NOT_FOUND");
  });

  it("answers CANNOT_PICK_SELF for one's own status", async () => {
    const alice = await signedUp();
    const own = await seekerIdOf(alice);

    const answer = await pick(alice, own);

    expect(answer.status).toBe(409);
    expect((await errorOf(answer)).code).toBe("CANNOT_PICK_SELF");
    expect(await seekerRows(alice)).toBe(1);
  });

  it("refuses a picker who holds a game (BR-13) with the game, and leaves the seeker's status alone", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const { gameId } = await createGame(bob);
    const aliceStatus = await seekerIdOf(alice);

    const answer = await pick(bob, aliceStatus);

    expect(answer.status).toBe(409);
    expect(await errorOf(answer)).toMatchObject({ code: "ACTIVE_GAME_EXISTS", data: { gameId } });
    expect(await seekerRows(alice)).toBe(1);
    expect(await slotsOf(alice)).toBe(0);
  });

  it("does not let an expired waiting game of the picker block the pick", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const { gameId } = await createGame(bob);
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [gameId]);
    const aliceStatus = await seekerIdOf(alice);

    expect((await pick(bob, aliceStatus)).status).toBe(200);
    expect((await run(`select status from games where id = ?`, [gameId]))[0]!.status).toBe("cancelled");
  });

  it("removes the picked seeker from everybody's list", async () => {
    const [alice, bob, carol] = [await signedUp(), await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);
    await mark(carol);
    expect(namesOf(await lobby(bob)).sort()).toEqual([alice.name, carol.name].sort());

    await pick(bob, aliceStatus);

    expect(namesOf(await lobby(carol))).toEqual([]);
    expect(namesOf(await lobby(bob))).toEqual([carol.name]);
  });

  it("answers 401 without a session and 403 without the CSRF header", async () => {
    const [alice, bob] = [await signedUp(), await signedUp()];
    const aliceStatus = await seekerIdOf(alice);

    expect((await call("POST", `/api/lobby/seekers/${aliceStatus}/pick`)).status).toBe(401);
    expect((await pick(bob, aliceStatus, { "x-gomoku-request": null })).status).toBe(403);
    expect((await pick(bob, aliceStatus, { origin: "https://evil.example" })).status).toBe(403);
    expect(await seekerRows(alice)).toBe(1);
  });

  it("answers 429 with Retry-After after 60 picks in an hour, also when they fail", async () => {
    const who = await signedUp();
    const unknown = "00000000-0000-4000-8000-000000000000";
    for (let i = 0; i < 60; i++) expect((await pick(who, unknown)).status, `pick ${i + 1}`).toBe(409);

    const refused = await pick(who, unknown);

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
