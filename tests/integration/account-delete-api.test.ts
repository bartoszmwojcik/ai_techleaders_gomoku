// Account deletion over HTTP against the built app and a real PostgreSQL (E01-S06, #37, step 5):
// the 200 (the session stops working everywhere, no login, the same e-mail registers again, the
// guest cookie is untouched), the 400/401/403 answers, 409 ACTIVE_GAME with the game id and the
// way out through resigning, the limit (429) and how attempts are counted, a waiting game that
// disappears with its invitation, and the opponent who sees "Usunięty gracz".
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");
const PASSWORD = "secret123";

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
const nextAddress = () => `198.21.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
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

async function signedUp() {
  const n = `${Date.now().toString(36)}${++userCounter}`;
  const input = { email: `acc-del-${n}@example.com`, displayName: `Del_${n}`, password: PASSWORD };
  const response = await call("POST", "/api/auth/register", input);
  expect(response.status).toBe(201);
  const body = await json(response);
  return { ...input, id: body.data.user.id as string, cookie: cookieOf(response) };
}
type Account = Awaited<ReturnType<typeof signedUp>>;

const deleteAccount = (cookie: string | undefined, body: unknown = { password: PASSWORD, confirm: true }, headers: Record<string, string | null> = {}) =>
  call("POST", "/api/account/delete", body, cookie, headers);
const userExists = async (id: string) => (await run(`select 1 from users where id = ?`, [id])).length === 1;
const gameOf = async (creator: Account) => {
  const created = await json(await call("POST", "/api/games", {}, creator.cookie));
  expect(created.ok).toBe(true);
  return { gameId: created.data.gameId as string, code: created.data.invitation.code as string };
};
/** Two accounts in a game in progress; `first` created it. */
async function playingPair() {
  const first = await signedUp();
  const second = await signedUp();
  const { gameId, code } = await gameOf(first);
  expect((await call("POST", `/api/invitations/${code}/accept`, { as: "user" }, second.cookie)).status).toBe(200);
  return { first, second, gameId };
}

describe("POST /api/account/delete: success", () => {
  it("deletes the account for good: every session stops working, login and the old data are gone", async () => {
    const me = await signedUp();
    // A second browser: another session of the same account.
    const otherLogin = await call("POST", "/api/auth/login", { email: me.email, password: PASSWORD });
    const otherCookie = cookieOf(otherLogin);
    expect(otherCookie).not.toBe("");
    expect((await call("POST", "/api/auth/password", {}, otherCookie)).status).toBe(400);

    const response = await deleteAccount(me.cookie);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ ok: true, data: null });
    // The session cookie is removed (Max-Age=0), the guest cookie is not mentioned.
    const setCookie = response.headers.getSetCookie?.() ?? [];
    expect(setCookie.some((line) => line.startsWith("gomoku_session=;") && /max-age=0/i.test(line))).toBe(true);
    expect(setCookie.some((line) => line.startsWith("gomoku_guest="))).toBe(false);

    expect(await userExists(me.id)).toBe(false);
    expect(await run(`select 1 from sessions where user_id = ?`, [me.id])).toHaveLength(0);
    // Neither session works any more.
    for (const cookie of [me.cookie, otherCookie]) {
      expect((await call("POST", "/api/auth/password", {}, cookie)).status).toBe(401);
    }
    // Logging in with the deleted data is the same answer as for an unknown e-mail.
    const login = await call("POST", "/api/auth/login", { email: me.email, password: PASSWORD });
    expect(login.status).toBe(401);
    expect((await json(login)).error.code).toBe("INVALID_CREDENTIALS");
    // The second call finds no session at all.
    expect((await deleteAccount(me.cookie)).status).toBe(401);
  });

  it("lets the same e-mail and name register again right away (Q4)", async () => {
    const me = await signedUp();
    expect((await deleteAccount(me.cookie)).status).toBe(200);

    const again = await call("POST", "/api/auth/register", { email: me.email, displayName: me.displayName, password: "other-secret1" });

    expect(again.status).toBe(201);
    expect((await json(again)).data.user.id).not.toBe(me.id);
  });

  it("does not touch the guest cookie of the browser", async () => {
    const me = await signedUp();
    const response = await deleteAccount(`${me.cookie}; gomoku_guest=some-guest-token`);
    expect(response.status).toBe(200);
    expect((response.headers.getSetCookie?.() ?? []).some((line) => line.startsWith("gomoku_guest="))).toBe(false);
  });

  it("removes a waiting game with its invitation: the link becomes invalid", async () => {
    const me = await signedUp();
    const other = await signedUp();
    const { gameId, code } = await gameOf(me);

    expect((await deleteAccount(me.cookie)).status).toBe(200);

    expect(await run(`select 1 from games where id = ?`, [gameId])).toHaveLength(0);
    expect(await run(`select 1 from invitations where game_id = ?`, [gameId])).toHaveLength(0);
    const accept = await call("POST", `/api/invitations/${code}/accept`, { as: "user" }, other.cookie);
    expect(accept.status).toBe(410);
    expect((await json(accept)).error.code).toBe("INVALID_INVITATION");
  });

  it("leaves a finished game to the opponent, who sees a deleted player (displayName null, kind account)", async () => {
    const { first, second, gameId } = await playingPair();
    expect((await call("GET", `/api/games/${gameId}`, undefined, first.cookie)).status).toBe(200);
    expect((await call("GET", `/api/games/${gameId}`, undefined, second.cookie)).status).toBe(200);
    expect((await call("POST", `/api/games/${gameId}/resign`, undefined, first.cookie)).status).toBe(200);
    const [before] = await run(`select status, winner_seat, end_reason, move_count from games where id = ?`, [gameId]);

    expect((await deleteAccount(first.cookie)).status).toBe(200);

    const state = await json(await call("GET", `/api/games/${gameId}`, undefined, second.cookie));
    expect(state.data.status).toBe("finished");
    expect(state.data.players).toEqual(
      expect.arrayContaining([expect.objectContaining({ seat: 1, kind: "account", displayName: null })]),
    );
    expect(state.data.players.find((p: Json) => p.seat === 2).displayName).toBe(second.displayName);
    expect(state.data.result).toMatchObject({ reason: "resignation" });
    const [after] = await run(`select status, winner_seat, end_reason, move_count from games where id = ?`, [gameId]);
    expect(after).toEqual(before);
  });
});

describe("POST /api/account/delete: refusals", () => {
  it("answers 401 without a session", async () => {
    expect((await deleteAccount(undefined)).status).toBe(401);
  });

  it("answers 403 without the CSRF header and for a foreign Origin, and deletes nothing", async () => {
    const me = await signedUp();
    expect((await deleteAccount(me.cookie, undefined, { "x-gomoku-request": null })).status).toBe(403);
    expect((await deleteAccount(me.cookie, undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect(await userExists(me.id)).toBe(true);
  });

  it("answers 400 VALIDATION for a missing confirmation or an empty password, without spending an attempt", async () => {
    const me = await signedUp();
    const noConfirm = await deleteAccount(me.cookie, { password: PASSWORD, confirm: false });
    expect(noConfirm.status).toBe(400);
    const body = await json(noConfirm);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fieldErrors.confirm).toBeDefined();
    const noPassword = await deleteAccount(me.cookie, { password: "", confirm: true });
    expect((await json(noPassword)).error.fieldErrors.password).toBeDefined();
    expect(await run(`select 1 from rate_limit_buckets where key = ?`, [`account-delete:user:${me.id}`])).toHaveLength(0);
    expect(await userExists(me.id)).toBe(true);
  });

  it("answers 400 INVALID_PASSWORD with a field error and keeps the account", async () => {
    const me = await signedUp();
    const response = await deleteAccount(me.cookie, { password: "wrong-password", confirm: true });
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.error.code).toBe("INVALID_PASSWORD");
    expect(body.error.fieldErrors.password).toEqual(["Nieprawidłowe hasło."]);
    expect(body.error.data).toBeUndefined();
    expect(await userExists(me.id)).toBe(true);
    // The session works after the refusal.
    expect((await call("POST", "/api/auth/password", {}, me.cookie)).status).toBe(400);
  });

  it("answers 429 after 10 wrong passwords, with Retry-After, even for the right one afterwards", async () => {
    const me = await signedUp();
    for (let i = 0; i < 10; i++) {
      expect((await deleteAccount(me.cookie, { password: `wrong-${i}-password`, confirm: true })).status).toBe(400);
    }
    const limited = await deleteAccount(me.cookie);
    expect(limited.status).toBe(429);
    expect((await json(limited)).error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(await userExists(me.id)).toBe(true);
  });

  it("does not count a success, a 409 or a validation error as a wrong password", async () => {
    const { first, second } = await playingPair();
    // Twelve refusals because of the game never exhaust the limit of ten.
    for (let i = 0; i < 12; i++) expect((await deleteAccount(first.cookie)).status).toBe(409);
    const buckets = await run(`select count from rate_limit_buckets where key = ?`, [`account-delete:user:${first.id}`]);
    expect(buckets.every((bucket) => Number(bucket.count) === 0)).toBe(true);
    // Wrong passwords do count, and the counter was not inflated by the 409s.
    for (let i = 0; i < 10; i++) expect((await deleteAccount(first.cookie, { password: `wrong-${i}-password`, confirm: true })).status).toBe(400);
    expect((await deleteAccount(first.cookie, { password: "wrong-again-1", confirm: true })).status).toBe(429);
    expect(await userExists(second.id)).toBe(true);
  });
});

describe("POST /api/account/delete: a game in progress (BR-21)", () => {
  it("answers 409 ACTIVE_GAME with the game id, changes nothing, and passes after resigning", async () => {
    const { first, second, gameId } = await playingPair();

    const refused = await deleteAccount(first.cookie);

    expect(refused.status).toBe(409);
    const body = await json(refused);
    expect(body.error).toMatchObject({
      code: "ACTIVE_GAME",
      message: "Najpierw dokończ albo poddaj partię.",
      data: { gameId },
    });
    expect(await userExists(first.id)).toBe(true);
    // The session still works and the cookie was not removed.
    expect((refused.headers.getSetCookie?.() ?? []).some((line) => line.startsWith("gomoku_session=;"))).toBe(false);
    expect((await call("GET", `/api/games/${gameId}`, undefined, first.cookie)).status).toBe(200);
    expect((await run(`select status from games where id = ?`, [gameId]))[0]).toEqual({ status: "active" });

    // The way out: resigning (possible before the first move), then the deletion goes through.
    expect((await call("POST", `/api/games/${gameId}/resign`, undefined, first.cookie)).status).toBe(200);
    expect((await deleteAccount(first.cookie)).status).toBe(200);
    expect(await userExists(first.id)).toBe(false);
    // The opponent of the finished game is untouched.
    expect(await userExists(second.id)).toBe(true);
    expect((await run(`select status, end_reason from games where id = ?`, [gameId]))[0]).toEqual({
      status: "finished",
      end_reason: "resignation",
    });
  });

  it("closes a game whose clock ran out first, so the deletion passes (lazy loss on time)", async () => {
    const { first, gameId } = await playingPair();
    // Both opened the page and the clock ran out 11 minutes ago.
    await run(`update game_players set seen_at = now() where game_id = ?`, [gameId]);
    await run(`update games set turn_started_at = now() - interval '11 minutes' where id = ?`, [gameId]);

    expect((await deleteAccount(first.cookie)).status).toBe(200);

    expect((await run(`select status, end_reason from games where id = ?`, [gameId]))[0]).toEqual({
      status: "finished",
      end_reason: "timeout",
    });
  });
});
