// Account deletion on a real PostgreSQL (E01-S06, #37): the cascades, the games that stay with
// the opponent, the rollback through `tx`, BR-21 and the locking against concurrent writers.
// The concurrency tests are deterministic: a second connection (`pg`) holds a lock, the service
// under test is started, and `pg_stat_activity` proves it is waiting for that lock before the
// holder commits. A fake `em` or `Promise.all` cannot show any of this.
import { INVITATION_TTL_MS } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AccountService } from "../../packages/app/src/server/services/auth/account-service";
import { PasswordHasher } from "../../packages/app/src/server/services/auth/password-hasher";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { ColorDraw } from "../../packages/app/src/server/services/games/color-draw";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { InvitationService } from "../../packages/app/src/server/services/games/invitation-service";
import { SqlTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
import { RematchService } from "../../packages/app/src/server/services/games/rematch-service";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";

const PASSWORD = "secret123";
const hasher = new PasswordHasher({ passwordHashCost: 4 });
let orm: Orm;
let hash: string;
let counter = 0;
const clients: Client[] = [];

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
  hash = await hasher.hash(PASSWORD);
});
afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, unknown>[]>(text, params);

async function connect(): Promise<Client> {
  const client = new Client({ connectionString: inject("databaseUrl") });
  await client.connect();
  clients.push(client);
  return client;
}

function scope(overrides: { passwordHasher?: Pick<PasswordHasher, "verify"> } = {}) {
  const em = orm.em.fork();
  const rateLimiter = new RateLimiter({ em });
  const timeoutSettler = new SqlTimeoutSettler({ em, clock: systemClock });
  return {
    accounts: new AccountService({
      em,
      passwordHasher: (overrides.passwordHasher ?? hasher) as PasswordHasher,
      timeoutSettler,
      clock: systemClock,
    }),
    invitations: new InvitationService({
      em,
      clock: systemClock,
      rateLimiter,
      timeoutSettler,
      colorDraw: new ColorDraw(),
    }),
    rematches: new RematchService({ em, clock: systemClock, rateLimiter, timeoutSettler }),
    games: new GameService({
      em,
      clock: systemClock,
      rateLimiter,
      invitationCodes: new InvitationCodes(),
      timeoutSettler,
      serverConfig: { appOrigin: "https://gomoku.test" } as never,
    }),
  };
}

async function user(name = "Gracz") {
  const n = `${Date.now().toString(36)}${++counter}`;
  const [row] = await run(
    `insert into users (email, display_name, display_name_key, password_hash, email_verified_at)
     values (?, ?, ?, ?, now()) returning id`,
    [`del-${n}@example.com`, `${name}_${n}`.slice(0, 24), `${name}_${n}`.toLowerCase().slice(0, 24), hash],
  );
  return { id: row!.id as string, email: `del-${n}@example.com`, name: `${name}_${n}`.slice(0, 24) };
}

/** A waiting game of an account with its invitation. */
async function waitingGame(userId: string) {
  const [game] = await run(`insert into games (origin, status) values ('invite', 'waiting') returning id`);
  const gameId = game!.id as string;
  await run(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 1, 'account', ?, true)`, [
    gameId,
    userId,
  ]);
  const code = new InvitationCodes().generate();
  await run(`insert into invitations (game_id, code, expires_at) values (?, ?, now() + ?::interval)`, [
    gameId,
    code,
    `${INVITATION_TTL_MS / 1000} seconds`,
  ]);
  return { gameId, code };
}

/** A game in progress; `turnAgoMs` null = clock not started, `seen` = both opened the page. */
async function activeGame(a: string, b: string, options: { startedAgo?: string; seen?: boolean; turnAgo?: string | null } = {}) {
  const [game] = await run(
    `insert into games (origin, status, started_at, black_seat, turn_started_at)
     values ('invite', 'active', now() - ?::interval, 1, ${options.turnAgo ? "now() - ?::interval" : "null"}) returning id`,
    options.turnAgo ? [options.startedAgo ?? "1 minute", options.turnAgo] : [options.startedAgo ?? "1 minute"],
  );
  const gameId = game!.id as string;
  const seen = options.seen === false ? "null" : "now()";
  await run(
    `insert into game_players (game_id, seat, kind, user_id, is_active, seen_at) values (?, 1, 'account', ?, true, ${seen}), (?, 2, 'account', ?, true, ${seen})`,
    [gameId, a, gameId, b],
  );
  return gameId;
}

/** A finished game (resignation of seat 2, so seat 1 wins), optionally with a pending rematch offer. */
async function finishedGame(a: string, b: string, options: { pendingRematch?: boolean } = {}) {
  const [game] = await run(
    `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason,
       rematch_state, rematch_offered_by_seat, rematch_expires_at)
     values ('invite', 'finished', now() - interval '5 minutes', now() - interval '1 minute', 1, 1, 'resignation',
       ${options.pendingRematch ? "'pending', 2, now() + interval '1 minute'" : "null, null, null"}) returning id`,
  );
  const gameId = game!.id as string;
  await run(
    `insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 1, 'account', ?, false), (?, 2, 'account', ?, false)`,
    [gameId, a, gameId, b],
  );
  return gameId;
}

const userExists = async (id: string) => ((await run(`select 1 from users where id = ?`, [id])).length ? true : false);
const gameExists = async (id: string) => ((await run(`select 1 from games where id = ?`, [id])).length ? true : false);

/** The invariant of every test: no ghost participant (an active slot of a deleted account). */
async function expectNoGhost() {
  const [row] = await run(
    `select count(*)::int as n from game_players where kind = 'account' and user_id is null and is_active`,
  );
  expect(row!.n).toBe(0);
}

/** Waits until some backend waits for a lock held by another one, with `fragment` in its query. */
async function waitForLockWait(fragment: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const rows = await run(
      `select 1 from pg_stat_activity
       where datname = current_database() and wait_event_type = 'Lock' and query ilike ?`,
      [`%${fragment}%`],
    );
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`nobody waits for a lock in a query containing "${fragment}"`);
}

/** Starts `promise`, lets the caller prove it blocks, and reports whether it settled meanwhile. */
function track<T>(promise: Promise<T>) {
  const state: { settled: boolean; result?: PromiseSettledResult<T> } = { settled: false };
  const done = promise.then(
    (value) => ((state.settled = true), (state.result = { status: "fulfilled", value })),
    (reason) => ((state.settled = true), (state.result = { status: "rejected", reason })),
  );
  return { state, done };
}

describe("schema guards", () => {
  it("every foreign key to users is `cascade` or `set null`", async () => {
    const rows = await run(
      `select conrelid::regclass::text as tbl, confdeltype::text as rule
       from pg_constraint where contype = 'f' and confrelid = 'users'::regclass order by 1`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const { tbl, rule } of rows) expect(["c", "n"], `FK from ${String(tbl)}`).toContain(rule);
  });

  it("game_players has an index on user_id", async () => {
    const rows = await run(`select indexdef from pg_indexes where indexname = 'game_players_user_id_index'`);
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.indexdef)).toContain("(user_id)");
  });
});

describe("AccountService.delete on PostgreSQL", () => {
  it("removes the account with its sessions and tokens and keeps the finished games of the opponent", async () => {
    const me = await user("Ja");
    const opponent = await user("Rywal");
    await run(`insert into sessions (user_id, token_hash, expires_at) values (?, ?, now() + interval '1 day')`, [
      me.id,
      `s${Date.now()}${++counter}`.padEnd(64, "0"),
    ]);
    await run(`insert into email_verification_tokens (user_id, token_hash, expires_at) values (?, ?, now() + interval '1 day')`, [
      me.id,
      `v${Date.now()}${++counter}`.padEnd(64, "0"),
    ]);
    await run(`insert into password_reset_tokens (user_id, token_hash, expires_at) values (?, ?, now() + interval '1 day')`, [
      me.id,
      `r${Date.now()}${++counter}`.padEnd(64, "0"),
    ]);
    const waiting = await waitingGame(me.id);
    const finishedId = await finishedGame(me.id, opponent.id);
    const [before] = await run(`select status, winner_seat, end_reason, move_count, finished_at::text as finished from games where id = ?`, [finishedId]);

    await scope().accounts.delete(me.id, PASSWORD);

    expect(await userExists(me.id)).toBe(false);
    for (const table of ["sessions", "email_verification_tokens", "password_reset_tokens"]) {
      expect(await run(`select 1 from ${table} where user_id = ?`, [me.id])).toHaveLength(0);
    }
    // The waiting game goes with its player and invitation.
    expect(await gameExists(waiting.gameId)).toBe(false);
    expect(await run(`select 1 from invitations where code = ?`, [waiting.code])).toHaveLength(0);
    // The finished game is untouched; my seat shows a deleted account.
    const [after] = await run(`select status, winner_seat, end_reason, move_count, finished_at::text as finished from games where id = ?`, [finishedId]);
    expect(after).toEqual(before);
    const seats = await run(`select seat, kind, user_id, is_active from game_players where game_id = ? order by seat`, [finishedId]);
    expect(seats).toEqual([
      { seat: 1, kind: "account", user_id: null, is_active: false },
      { seat: 2, kind: "account", user_id: opponent.id, is_active: false },
    ]);
    expect(await userExists(opponent.id)).toBe(true);
    await expectNoGhost();
  });

  it("two deleted accounts in one game do not collide", async () => {
    const a = await user();
    const b = await user();
    const gameId = await finishedGame(a.id, b.id);
    await scope().accounts.delete(a.id, PASSWORD);
    await scope().accounts.delete(b.id, PASSWORD);
    const seats = await run(`select user_id from game_players where game_id = ?`, [gameId]);
    expect(seats).toEqual([{ user_id: null }, { user_id: null }]);
  });

  it("allows registering the same e-mail and name right after the deletion", async () => {
    const me = await user();
    await scope().accounts.delete(me.id, PASSWORD);
    const [again] = await run(
      `insert into users (email, display_name, display_name_key, password_hash) values (?, ?, ?, ?) returning id`,
      [me.email, me.name, me.name.toLowerCase(), hash],
    );
    expect(again!.id).not.toBe(me.id);
  });

  it("closes a pending rematch offer as declined for the opponent too", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await finishedGame(me.id, opponent.id, { pendingRematch: true });
    await scope().accounts.delete(me.id, PASSWORD);
    const [game] = await run(`select rematch_state, status from games where id = ?`, [gameId]);
    expect(game).toEqual({ rematch_state: "declined", status: "finished" });
  });

  it("refuses a game in progress with its id and changes nothing (BR-21)", async () => {
    const me = await user();
    const opponent = await user();
    const waiting = await waitingGame(me.id).catch(() => null);
    // BR-13 allows only one slot: the waiting game above is cancelled to make room for the active one.
    if (waiting) await run(`delete from games where id = ?`, [waiting.gameId]);
    const gameId = await activeGame(me.id, opponent.id);
    await run(`insert into sessions (user_id, token_hash, expires_at) values (?, ?, now() + interval '1 day')`, [
      me.id,
      `a${Date.now()}${++counter}`.padEnd(64, "0"),
    ]);

    await expect(scope().accounts.delete(me.id, PASSWORD)).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME",
      data: { gameId },
    });

    expect(await userExists(me.id)).toBe(true);
    expect(await run(`select 1 from sessions where user_id = ?`, [me.id])).toHaveLength(1);
    expect((await run(`select status from games where id = ?`, [gameId]))[0]).toEqual({ status: "active" });
  });

  it("does not delete with a wrong password", async () => {
    const me = await user();
    await expect(scope().accounts.delete(me.id, "wrong-password")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_PASSWORD",
    });
    expect(await userExists(me.id)).toBe(true);
  });

  it("an account that is already gone answers 401", async () => {
    const me = await user();
    await scope().accounts.delete(me.id, PASSWORD);
    await expect(scope().accounts.delete(me.id, PASSWORD)).rejects.toMatchObject({ status: 401 });
  });

  it("lets the deletion through when the clock of the game ran out (lazy loss on time)", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await activeGame(me.id, opponent.id, { turnAgo: "11 minutes", startedAgo: "11 minutes" });
    await scope().accounts.delete(me.id, PASSWORD);
    expect(await userExists(me.id)).toBe(false);
    expect((await run(`select status, end_reason from games where id = ?`, [gameId]))[0]).toEqual({
      status: "finished",
      end_reason: "timeout",
    });
    await expectNoGhost();
  });

  it("lets the deletion through when nobody opened the game within 15 minutes", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await activeGame(me.id, opponent.id, { startedAgo: "16 minutes", seen: false });
    await scope().accounts.delete(me.id, PASSWORD);
    expect(await userExists(me.id)).toBe(false);
    expect((await run(`select status from games where id = ?`, [gameId]))[0]).toEqual({ status: "cancelled" });
    await expectNoGhost();
  });

  it("rolls everything back when the password changed after it was verified", async () => {
    const me = await user();
    const opponent = await user();
    const waiting = await waitingGame(me.id);
    const finishedId = await finishedGame(me.id, opponent.id, { pendingRematch: true });
    // The "concurrent change" lands between the verification and the transaction.
    const racing = {
      verify: async (password: string, passwordHash: string) => {
        const ok = await hasher.verify(password, passwordHash);
        await run(`update users set password_hash = ? where id = ?`, [await hasher.hash("other-pass1"), me.id]);
        return ok;
      },
    };

    await expect(scope({ passwordHasher: racing }).accounts.delete(me.id, PASSWORD)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_PASSWORD",
    });

    expect(await userExists(me.id)).toBe(true);
    expect(await gameExists(waiting.gameId)).toBe(true);
    expect((await run(`select rematch_state from games where id = ?`, [finishedId]))[0]).toEqual({ rematch_state: "pending" });
  });

  it("rolls back the writes when the delete statement itself fails", async () => {
    const me = await user();
    const waiting = await waitingGame(me.id);
    // A trigger makes the final `delete from users` fail after the waiting game was deleted.
    const admin = await connect();
    const name = `fail_${Date.now().toString(36)}${++counter}`;
    await admin.query(`create function ${name}() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`);
    await admin.query(`create trigger ${name} before delete on users for each row when (old.id = '${me.id}') execute function ${name}()`);
    try {
      await expect(scope().accounts.delete(me.id, PASSWORD)).rejects.toThrow();
      expect(await userExists(me.id)).toBe(true);
      expect(await gameExists(waiting.gameId)).toBe(true);
    } finally {
      await admin.query(`drop trigger ${name} on users`);
      await admin.query(`drop function ${name}()`);
    }
  });
});

describe("a rematch against a deleted account (E02-S06 x E01-S06)", () => {
  const playerOf = async (gameId: string, userId: string) =>
    (await run(`select id from game_players where game_id = ? and user_id = ?`, [gameId, userId]))[0]!.id as string;

  it("closes the pending offer of the deleted account, and the opponent can neither accept nor offer again", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await finishedGame(me.id, opponent.id, { pendingRematch: true });
    const opponentPlayer = await playerOf(gameId, opponent.id);

    await scope().accounts.delete(me.id, PASSWORD);

    expect((await run(`select rematch_state from games where id = ?`, [gameId]))[0]).toEqual({ rematch_state: "declined" });
    await expect(scope().rematches.accept({ playerId: opponentPlayer }, gameId)).rejects.toMatchObject({ status: 409, code: "REMATCH_NOT_OFFERED" });
    await expect(scope().rematches.offer({ playerId: opponentPlayer }, gameId)).rejects.toMatchObject({
      status: 409,
      code: "REMATCH_UNAVAILABLE",
    });
    expect((await run(`select rematch_state from games where id = ?`, [gameId]))[0]).toEqual({ rematch_state: "declined" });
    expect((await run(`select rematch_game_id from games where id = ?`, [gameId]))[0]).toEqual({ rematch_game_id: null });
    await expectNoGhost();
  });

  it("refuses a first offer after the deletion and spends no attempt", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await finishedGame(me.id, opponent.id);
    const opponentPlayer = await playerOf(gameId, opponent.id);
    await scope().accounts.delete(me.id, PASSWORD);

    await expect(scope().rematches.offer({ playerId: opponentPlayer }, gameId)).rejects.toMatchObject({
      status: 409,
      code: "REMATCH_UNAVAILABLE",
    });
    expect((await run(`select rematch_state from games where id = ?`, [gameId]))[0]).toEqual({ rematch_state: null });
  });

  it("still lets two living accounts offer (the check looks only at deleted accounts)", async () => {
    const a = await user();
    const b = await user();
    const gameId = await finishedGame(a.id, b.id);
    await expect(scope().rematches.offer({ playerId: await playerOf(gameId, a.id) }, gameId)).resolves.toMatchObject({ state: "pending" });
  });
});

describe("AccountService.delete against concurrent writers", () => {
  it("create a game || delete: the game is created first, so the deletion removes it (no ghost)", async () => {
    const me = await user();
    const holder = await connect();
    // The statements of `GameService.create`, uncommitted.
    await holder.query("begin");
    await holder.query(`select id from users where id = $1 for no key update`, [me.id]);
    const { rows } = await holder.query(`insert into games (origin, status) values ('invite', 'waiting') returning id`);
    const gameId = rows[0].id as string;
    await holder.query(`insert into game_players (game_id, seat, kind, user_id, is_active) values ($1, 1, 'account', $2, true)`, [gameId, me.id]);
    await holder.query(`insert into invitations (game_id, code, expires_at) values ($1, $2, now() + interval '1 day')`, [
      gameId,
      new InvitationCodes().generate(),
    ]);

    const deletion = track(scope().accounts.delete(me.id, PASSWORD));
    await waitForLockWait("from users where id");
    expect(deletion.state.settled).toBe(false);
    await holder.query("commit");
    await deletion.done;

    expect(deletion.state.result).toMatchObject({ status: "fulfilled" });
    expect(await userExists(me.id)).toBe(false);
    expect(await gameExists(gameId)).toBe(false);
    await expectNoGhost();
  });

  it("create a game || delete: the deletion is first, so create answers 401 and creates nothing", async () => {
    const me = await user();
    const holder = await connect();
    await holder.query("begin");
    await holder.query(`select id from users where id = $1 for no key update`, [me.id]);
    await holder.query(`delete from users where id = $1`, [me.id]);

    const creation = track(scope().games.create({ kind: "account", userId: me.id }));
    await waitForLockWait("from users where id");
    expect(creation.state.settled).toBe(false);
    await holder.query("commit");
    await creation.done;

    expect(creation.state.result).toMatchObject({ status: "rejected", reason: { status: 401 } });
    await expectNoGhost();
  });

  it("join || delete: the deletion is first, so the join answers INVALID_INVITATION", async () => {
    const creator = await user();
    const joiner = await user();
    const waiting = await waitingGame(creator.id);
    const holder = await connect();
    await holder.query("begin");
    await holder.query(`select id from users where id = $1 for no key update`, [creator.id]);
    await holder.query(`select id from games where id = $1 for update`, [waiting.gameId]);
    await holder.query(`delete from games where id = $1`, [waiting.gameId]);
    await holder.query(`delete from users where id = $1`, [creator.id]);

    const join = track(
      scope().invitations.accept(waiting.code, { userId: joiner.id }, { as: "user" }, { key: `del-join:${counter}:${Date.now()}`, limit: 1000 }),
    );
    await waitForLockWait("for");
    expect(join.state.settled).toBe(false);
    await holder.query("commit");
    await join.done;

    expect(join.state.result).toMatchObject({ status: "rejected", reason: { status: 410, code: "INVALID_INVITATION" } });
    expect(await run(`select 1 from game_players where user_id = ?`, [joiner.id])).toHaveLength(0);
    await expectNoGhost();
  });

  it("join || delete: the join is first, so the deletion sees a game in progress (409)", async () => {
    const creator = await user();
    const joiner = await user();
    const waiting = await waitingGame(creator.id);
    const [low, high] = [creator.id, joiner.id].sort();
    const holder = await connect();
    // The statements of the join, uncommitted: users by id, then the game.
    await holder.query("begin");
    await holder.query(`select id from users where id in ($1, $2) order by id for no key update`, [low, high]);
    await holder.query(`select id from games where id = $1 for update`, [waiting.gameId]);
    await holder.query(`update games set status = 'active', started_at = now(), black_seat = 1 where id = $1`, [waiting.gameId]);
    await holder.query(`insert into game_players (game_id, seat, kind, user_id, is_active) values ($1, 2, 'account', $2, true)`, [
      waiting.gameId,
      joiner.id,
    ]);

    const deletion = track(scope().accounts.delete(creator.id, PASSWORD));
    await waitForLockWait("from users where id");
    expect(deletion.state.settled).toBe(false);
    await holder.query("commit");
    await deletion.done;

    expect(deletion.state.result).toMatchObject({
      status: "rejected",
      reason: { status: 409, code: "ACTIVE_GAME", data: { gameId: waiting.gameId } },
    });
    expect(await userExists(creator.id)).toBe(true);
    await expectNoGhost();
  });

  it("delete || delete of the same account: the loser answers 401", async () => {
    const me = await user();
    const holder = await connect();
    await holder.query("begin");
    await holder.query(`select id from users where id = $1 for no key update`, [me.id]);
    await holder.query(`delete from users where id = $1`, [me.id]);

    const second = track(scope().accounts.delete(me.id, PASSWORD));
    await waitForLockWait("from users where id");
    await holder.query("commit");
    await second.done;

    expect(second.state.result).toMatchObject({ status: "rejected", reason: { status: 401 } });
  });

  it("delete || password change: the new hash fails the condition and nothing is deleted", async () => {
    const me = await user();
    const waiting = await waitingGame(me.id);
    const holder = await connect();
    await holder.query("begin");
    await holder.query(`update users set password_hash = $1 where id = $2`, [await hasher.hash("changed-pass1"), me.id]);

    const deletion = track(scope().accounts.delete(me.id, PASSWORD));
    await waitForLockWait("from users where id");
    await holder.query("commit");
    await deletion.done;

    expect(deletion.state.result).toMatchObject({ status: "rejected", reason: { status: 400, code: "INVALID_PASSWORD" } });
    expect(await userExists(me.id)).toBe(true);
    expect(await gameExists(waiting.gameId)).toBe(true);
  });

  it("delete || resignation: the finished game no longer blocks and the deletion goes through", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await activeGame(me.id, opponent.id);
    const holder = await connect();
    // A resignation of the opponent in flight: the game is locked and already finished.
    await holder.query("begin");
    await holder.query(`select id from games where id = $1 for update`, [gameId]);
    await holder.query(
      `update games set status = 'finished', finished_at = now(), winner_seat = 1, end_reason = 'resignation' where id = $1`,
      [gameId],
    );
    await holder.query(`update game_players set is_active = false where game_id = $1`, [gameId]);

    const deletion = track(scope().accounts.delete(me.id, PASSWORD));
    await waitForLockWait("for update of g");
    expect(deletion.state.settled).toBe(false);
    await holder.query("commit");
    await deletion.done;

    expect(deletion.state.result).toMatchObject({ status: "fulfilled" });
    expect(await userExists(me.id)).toBe(false);
    expect((await run(`select status from games where id = ?`, [gameId]))[0]).toEqual({ status: "finished" });
    await expectNoGhost();
  });

  it("delete || a move in a game in progress: the move holds the game, the deletion then answers 409", async () => {
    const me = await user();
    const opponent = await user();
    const gameId = await activeGame(me.id, opponent.id);
    const holder = await connect();
    await holder.query("begin");
    await holder.query(`select id from games where id = $1 for update`, [gameId]);

    const deletion = track(scope().accounts.delete(me.id, PASSWORD));
    await waitForLockWait("for update of g");
    await holder.query("commit");
    await deletion.done;

    expect(deletion.state.result).toMatchObject({ status: "rejected", reason: { status: 409, data: { gameId } } });
    expect(await userExists(me.id)).toBe(true);
  });
});
