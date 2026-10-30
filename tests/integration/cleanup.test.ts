// Cleanup of expired records on a real PostgreSQL (spec 2026-10-24-expired-records-cleanup):
// thresholds of every rule, batching, parallel runs (`for update skip locked`), foreign keys
// and the `db:cleanup` command (`runCleanup` and the npm script as a process). Runs only on
// the Testcontainers database from global-setup — never point it at another database.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { createOrm, cleanupExpired, type CleanupResult, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { runCleanup } from "../../packages/db/src/cleanup/run-cleanup";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");
const HOUR = 3_600_000;
const SECOND = 1_000;
const DAY = 24 * HOUR;

let orm: Orm;
let counter = 0;

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
// Rows left by an earlier test age relative to a later `now`, so each test starts from a clean slate
// (only this file's rows: its users cascade to sessions and tokens, its buckets have their own key prefix).
beforeEach(async () => {
  await sql(`delete from users where email like 'cleanup-%'`);
  await sql(`delete from rate_limit_buckets where key like 'cleanup-%'`);
});
afterAll(async () => {
  await orm.close();
});

const sql = (text: string, params: unknown[] = []) => orm.em.fork().execute(text, params, "run");
const rows = async (table: string, where = "true") =>
  (await orm.em.fork().execute<{ n: string }[]>(`select count(*)::text as n from ${table} where ${where}`))[0]!.n;

async function insertUser(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const [row] = await orm.em
    .fork()
    .execute<{ id: string }[]>(
      `insert into users (email, display_name, display_name_key, password_hash) values (?, ?, ?, ?) returning id`,
      [`cleanup-${n}@example.com`, `cl_${n}`.slice(0, 24), `cl_${n}`.slice(0, 24), "x".repeat(60)],
    );
  return row!.id;
}

const hash = () => `${"a".repeat(32)}${(++counter).toString(16).padStart(32, "0")}`;

async function insertSession(userId: string, expiresAt: Date) {
  await sql(`insert into sessions (user_id, token_hash, expires_at) values (?, ?, ?)`, [userId, hash(), expiresAt]);
}
async function insertToken(table: string, userId: string, expiresAt: Date, usedAt: Date | null) {
  await sql(`insert into ${table} (user_id, token_hash, expires_at, used_at) values (?, ?, ?, ?)`, [
    userId,
    hash(),
    expiresAt,
    usedAt,
  ]);
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);

describe("cleanup thresholds on PostgreSQL", () => {
  it("sessions: only those expired more than 1 h ago go (the cutoff itself stays)", async () => {
    const now = new Date();
    const userId = await insertUser();
    await insertSession(userId, ago(now, HOUR + SECOND)); // past the threshold
    await insertSession(userId, ago(now, HOUR)); // exactly on it: kept (strict <)
    await insertSession(userId, ago(now, HOUR - SECOND)); // expired, inside the margin
    await insertSession(userId, new Date(now.getTime() + HOUR)); // still valid

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    // The database is shared: other rows may be eligible too, so the count is a lower bound
    // and the assertions below look at this test's own rows only.
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("3");
    expect(await rows("sessions", `user_id = '${userId}' and expires_at < '${ago(now, HOUR).toISOString()}'`)).toBe("0");
  });

  it.each([
    ["rate limit buckets", "cleanup-test"],
    ["daily e-mail pools (email-daily:*, 24 h window)", "cleanup-test:email-daily"],
  ])("%s: only windows older than 48 h go (24 h past the longest window)", async (_name, prefix) => {
    const now = new Date();
    const bucket = async (windowStart: Date) => {
      const key = `${prefix}:${++counter}`;
      await sql(`insert into rate_limit_buckets (key, window_start, count) values (?, ?, 1)`, [key, windowStart]);
      return key;
    };
    const old = await bucket(ago(now, 48 * HOUR + SECOND));
    const edge = await bucket(ago(now, 48 * HOUR));
    const recent = await bucket(ago(now, 48 * HOUR - SECOND));
    const endedDayWindow = await bucket(ago(now, 25 * HOUR)); // its 24 h window ended 1 h ago: kept as a skew margin
    const fresh = await bucket(now);

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.rateLimitBuckets).toBeGreaterThanOrEqual(1);
    const keys = [old, edge, recent, endedDayWindow, fresh];
    const left = await orm.em
      .fork()
      .execute<{ key: string }[]>(`select key from rate_limit_buckets where key in (${keys.map(() => "?").join(", ")})`, keys);
    expect(left.map((r) => r.key).sort()).toEqual([edge, recent, endedDayWindow, fresh].sort());
  });

  it.each([
    ["email_verification_tokens", "emailVerificationTokens"],
    ["password_reset_tokens", "passwordResetTokens"],
  ] as const)("%s: expired or used more than 24 h ago go, the rest stays", async (table, key) => {
    const now = new Date();
    const userId = await insertUser();
    const future = new Date(now.getTime() + HOUR);
    // Gone: expired past the threshold, used past the threshold (also with a still-future expiry).
    await insertToken(table, userId, ago(now, 24 * HOUR + SECOND), null);
    await insertToken(table, userId, future, ago(now, 24 * HOUR + SECOND));
    // Kept: on the threshold, inside it, unused and valid, used recently.
    await insertToken(table, userId, ago(now, 24 * HOUR), null);
    await insertToken(table, userId, ago(now, 24 * HOUR - SECOND), null);
    await insertToken(table, userId, future, null);
    await insertToken(table, userId, future, ago(now, 24 * HOUR));
    await insertToken(table, userId, future, ago(now, HOUR));

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result[key]).toBeGreaterThanOrEqual(2);
    expect(await rows(table, `user_id = '${userId}'`)).toBe("5");
  });

  it("never deletes a confirmed account, however old (BR-28 concerns unconfirmed ones only)", async () => {
    const now = new Date();
    const userId = await insertUser();
    await sql(`update users set email_verified_at = ?, created_at = ? where id = ?`, [ago(now, 40 * DAY), ago(now, 60 * DAY), userId]);
    await insertSession(userId, ago(now, 10 * HOUR));
    await insertToken("email_verification_tokens", userId, ago(now, 48 * HOUR), null);
    await insertToken("password_reset_tokens", userId, ago(now, 48 * HOUR), null);

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.emailVerificationTokens).toBeGreaterThanOrEqual(1);
    expect(result.passwordResetTokens).toBeGreaterThanOrEqual(1);
    expect(await rows("users", `id = '${userId}'`)).toBe("1");
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("0");
  });

  it("a cascade from a deleted user does not conflict with the sweep", async () => {
    const now = new Date();
    const userId = await insertUser();
    await insertSession(userId, ago(now, 5 * HOUR));
    await sql(`delete from users where id = ?`, [userId]);

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.errors).toEqual([]);
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("0");
  });
});

describe("unconfirmed accounts without a game (BR-28, E01-S06 step 8)", () => {
  /** An account created `createdAgo` ms ago; `verified` confirms its e-mail. */
  async function account(now: Date, createdAgo: number, verified = false) {
    const userId = await insertUser();
    await sql(`update users set created_at = ?, email_verified_at = ? where id = ?`, [
      ago(now, createdAgo),
      verified ? ago(now, createdAgo) : null,
      userId,
    ]);
    return userId;
  }
  /** A game the account took part in, with the given status (a creator row is enough for the rule). */
  async function game(userId: string, status: "waiting" | "cancelled" | "finished") {
    const [row] = await orm.em.fork().execute<{ id: string }[]>(
      status === "finished"
        ? `insert into games (origin, status, started_at, finished_at, black_seat, winner_seat, end_reason)
           values ('invite', 'finished', now(), now(), 1, 1, 'timeout') returning id`
        : `insert into games (origin, status) values ('invite', ?) returning id`,
      status === "finished" ? [] : [status],
    );
    await sql(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 1, 'account', ?, false)`, [
      row!.id,
      userId,
    ]);
    return row!.id;
  }
  const userExists = async (id: string) => (await rows("users", `id = '${id}'`)) === "1";

  it("deletes an unconfirmed account older than 14 days with its sessions and tokens, and only past the threshold", async () => {
    const now = new Date();
    const old = await account(now, 14 * DAY + SECOND);
    const onTheEdge = await account(now, 14 * DAY);
    const young = await account(now, 14 * DAY - SECOND);
    for (const id of [old, young]) {
      await insertSession(id, new Date(now.getTime() + DAY));
      await insertToken("email_verification_tokens", id, new Date(now.getTime() + DAY), null);
      await insertToken("password_reset_tokens", id, new Date(now.getTime() + DAY), null);
    }

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.errors).toEqual([]);
    expect(result.unverifiedUsers).toBeGreaterThanOrEqual(1);
    expect(await userExists(old)).toBe(false);
    for (const table of ["sessions", "email_verification_tokens", "password_reset_tokens"]) {
      expect(await rows(table, `user_id = '${old}'`)).toBe("0");
    }
    expect(await userExists(onTheEdge)).toBe(true);
    expect(await userExists(young)).toBe(true);
    expect(await rows("sessions", `user_id = '${young}'`)).toBe("1");
  });

  it("keeps a confirmed account of any age", async () => {
    const now = new Date();
    const confirmed = await account(now, 30 * DAY, true);
    await cleanupExpired({ em: orm.em.fork(), now });
    expect(await userExists(confirmed)).toBe(true);
  });

  it("keeps an account that has a game participant row, whatever the game's status", async () => {
    const now = new Date();
    const withWaiting = await account(now, 30 * DAY);
    const withCancelled = await account(now, 30 * DAY);
    const withFinished = await account(now, 30 * DAY);
    await game(withWaiting, "waiting");
    // A cancelled game is younger than 24 h, so the games rules do not delete it in this run.
    await game(withCancelled, "cancelled");
    await game(withFinished, "finished");

    await cleanupExpired({ em: orm.em.fork(), now });

    expect(await userExists(withWaiting)).toBe(true);
    expect(await userExists(withCancelled)).toBe(true);
    expect(await userExists(withFinished)).toBe(true);
  });

  it("deletes the account in the same run that sweeps its last, old cancelled game (rules run in order)", async () => {
    const now = new Date();
    const userId = await account(now, 30 * DAY);
    const gameId = await game(userId, "cancelled");
    await sql(`update games set created_at = ? where id = ?`, [ago(now, 26 * HOUR), gameId]);

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.cancelledGames).toBeGreaterThanOrEqual(1);
    expect(await rows("games", `id = '${gameId}'`)).toBe("0");
    expect(await userExists(userId)).toBe(false);
  });

  it("an account whose game belonged to a deleted account stays unaffected (user_id NULL rows are not its own)", async () => {
    const now = new Date();
    const orphanGame = await game(await account(now, DAY, true), "finished");
    await sql(`update game_players set user_id = null where game_id = ?`, [orphanGame]);
    const stranger = await account(now, 30 * DAY);

    await cleanupExpired({ em: orm.em.fork(), now });

    expect(await userExists(stranger)).toBe(false);
    expect(await rows("games", `id = '${orphanGame}'`)).toBe("1");
  });
});

describe("games rules (E02-S08, #39)", () => {
  /** A game with a guest creator and an invitation expiring `expiredAgo` ms ago (negative: in the future). */
  async function insertGame(status: string, expiredAgo: number, now: Date) {
    const [game] = await orm.em.fork().execute<{ id: string }[]>(
      `insert into games (origin, status, created_at) values ('invite', ?, ?) returning id`,
      [status, new Date(now.getTime() - expiredAgo - 24 * HOUR)],
    );
    const id = game!.id;
    await sql(`insert into game_players (game_id, seat, kind, guest_token_hash, is_active) values (?, 1, 'guest', ?, ?)`, [
      id,
      hash(),
      status === "waiting",
    ]);
    await sql(`insert into invitations (game_id, code, created_at, expires_at) values (?, ?, ?, ?)`, [
      id,
      new InvitationCodes().generate(),
      new Date(now.getTime() - expiredAgo - 24 * HOUR),
      new Date(now.getTime() - expiredAgo),
    ]);
    return id;
  }
  const exists = async (id: string) => (await rows("games", `id = '${id}'`)) === "1";
  const dependents = async (id: string) =>
    Number(await rows("game_players", `game_id = '${id}'`)) + Number(await rows("invitations", `game_id = '${id}'`));

  it("deletes an unjoined game only after the one-hour window past its invitation's expiry", async () => {
    const now = new Date();
    const open = await insertGame("waiting", -HOUR, now);
    const justExpired = await insertGame("waiting", 5 * SECOND, now);
    const inWindow = await insertGame("waiting", HOUR - 10 * SECOND, now);
    const gone = await insertGame("waiting", HOUR + 10 * SECOND, now);

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.waitingGames).toBeGreaterThanOrEqual(1);
    expect(await exists(open)).toBe(true);
    expect(await exists(justExpired)).toBe(true);
    expect(await exists(inWindow)).toBe(true);
    expect(await exists(gone)).toBe(false);
    // Players and the invitation go with the game (cascade); the others keep theirs.
    expect(await dependents(gone)).toBe(0);
    expect(await dependents(inWindow)).toBe(2);
  });

  it("deletes cancelled games older than 24 h (+ the 1 h window of an unjoined one), with their rows", async () => {
    const now = new Date();
    // Created `expiredAgo + 24 h` ago: the first two are inside 25 h, the last one is past it.
    const inWindow = await insertGame("cancelled", HOUR - 10 * SECOND, now);
    const fresh = await insertGame("cancelled", -HOUR, now);
    const gone = await insertGame("cancelled", HOUR + 10 * SECOND, now);

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.cancelledGames).toBeGreaterThanOrEqual(1);
    expect(await exists(inWindow)).toBe(true);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(gone)).toBe(false);
    expect(await dependents(gone)).toBe(0);
  });

  it("never deletes games in progress or finished ones", async () => {
    const now = new Date();
    const active = await insertGame("waiting", 5 * HOUR, now);
    await sql(`update games set status = 'active', started_at = ?, black_seat = 1 where id = ?`, [ago(now, 5 * HOUR), active]);
    const finished = await insertGame("waiting", 5 * HOUR, now);
    await sql(
      `update games set status = 'finished', started_at = ?, black_seat = 1, winner_seat = 1, end_reason = 'timeout', finished_at = ? where id = ?`,
      [ago(now, 6 * HOUR), ago(now, 5 * HOUR), finished],
    );

    await cleanupExpired({ em: orm.em.fork(), now });

    expect(await exists(active)).toBe(true);
    expect(await exists(finished)).toBe(true);
  });

  it("clears the guest token hash one hour after the game finished, keeping the rows", async () => {
    const now = new Date();
    const finish = async (agoMs: number) => {
      const id = await insertGame("waiting", 5 * HOUR, now);
      await sql(
        `update games set status = 'finished', started_at = ?, black_seat = 1, winner_seat = 1, end_reason = 'timeout', finished_at = ? where id = ?`,
        [ago(now, 6 * HOUR), ago(now, agoMs), id],
      );
      return id;
    };
    const old = await finish(HOUR + 10 * SECOND);
    const recent = await finish(HOUR - 10 * SECOND);
    const hashOf = async (id: string) =>
      (await orm.em.fork().execute<{ h: string | null }[]>(`select guest_token_hash as h from game_players where game_id = ?`, [id]))[0]!.h;

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.guestTokens).toBeGreaterThanOrEqual(1);
    expect(await hashOf(old)).toBeNull();
    expect(await hashOf(recent)).not.toBeNull();
    expect(await exists(old)).toBe(true);
    // A second run clears nothing more (the condition stops matching).
    expect((await cleanupExpired({ em: orm.em.fork(), now })).guestTokens).toBe(0);
  });
});

describe("batching and parallel runs", () => {
  async function seedOld(userId: string, now: Date, count: number) {
    await sql(
      `insert into sessions (user_id, token_hash, expires_at)
         select ?, md5(random()::text || g) || md5(random()::text || g), ? from generate_series(1, ?) g`,
      [userId, ago(now, 3 * HOUR), count],
    );
    await sql(
      `insert into rate_limit_buckets (key, window_start, count)
         select 'cleanup-batch:' || md5(random()::text || g), ?, 1 from generate_series(1, ?) g`,
      [ago(now, 72 * HOUR), count],
    );
  }

  it("deletes everything when there are more rows than the batch size", async () => {
    const now = new Date();
    const userId = await insertUser();
    await seedOld(userId, now, 25);

    const result = await cleanupExpired({ em: orm.em.fork(), now, batchSize: 10 });

    // At least this test's 25 rows (3 batches of 10 needed); other stale rows of the shared database may add to the count.
    expect(result.sessions).toBeGreaterThanOrEqual(25);
    expect(result.rateLimitBuckets).toBeGreaterThanOrEqual(25);
    expect(result.truncated).toBe(false);
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("0");
    expect(await rows("rate_limit_buckets", `key like 'cleanup-batch:%'`)).toBe("0");
  });

  it("is idempotent: a second run finds nothing", async () => {
    const now = new Date();
    await seedOld(await insertUser(), now, 5);
    await cleanupExpired({ em: orm.em.fork(), now });

    const again = await cleanupExpired({ em: orm.em.fork(), now });

    expect(again).toEqual<CleanupResult>({
      sessions: 0,
      rateLimitBuckets: 0,
      emailVerificationTokens: 0,
      passwordResetTokens: 0,
      waitingGames: 0,
      cancelledGames: 0,
      guestTokens: 0,
      unverifiedUsers: 0,
      errors: [],
      truncated: false,
    });
  });

  it("two parallel runs do not fail and together delete every old row exactly once", async () => {
    const now = new Date();
    const userId = await insertUser();
    await seedOld(userId, now, 200);
    // Everything eligible right before the runs (this test's rows plus any stale leftovers of the shared database).
    const eligibleSessions = Number(await rows("sessions", `expires_at < '${ago(now, HOUR).toISOString()}'`));
    const eligibleBuckets = Number(await rows("rate_limit_buckets", `window_start < '${ago(now, 48 * HOUR).toISOString()}'`));

    const [a, b] = await Promise.all([
      cleanupExpired({ em: orm.em.fork(), now, batchSize: 7 }),
      cleanupExpired({ em: orm.em.fork(), now, batchSize: 7 }),
    ]);

    expect(eligibleSessions).toBeGreaterThanOrEqual(200);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect((a.sessions ?? 0) + (b.sessions ?? 0)).toBe(eligibleSessions);
    expect((a.rateLimitBuckets ?? 0) + (b.rateLimitBuckets ?? 0)).toBe(eligibleBuckets);
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("0");
    expect(await rows("rate_limit_buckets", `key like 'cleanup-batch:%'`)).toBe("0");
  });
});

describe("db:cleanup command", () => {
  async function seedForCommand() {
    const userId = await insertUser();
    // The command uses the real clock, so rows are old relative to the present moment.
    await insertSession(userId, new Date(Date.now() - 3 * HOUR));
    await insertSession(userId, new Date(Date.now() + HOUR));
    return userId;
  }

  it("runCleanup prints the JSON result and returns 0", async () => {
    const userId = await seedForCommand();
    let out = "";
    let err = "";

    const code = await runCleanup({
      createOrm: (overrides) => createOrm({ ...overrides, clientUrl: inject("databaseUrl") }),
      stdout: { write: (chunk) => ((out += chunk), true) },
      stderr: { write: (chunk) => ((err += chunk), true) },
    });

    expect(code).toBe(0);
    expect(err).toBe("");
    const result = JSON.parse(out) as CleanupResult;
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.unverifiedUsers).toEqual(expect.any(Number));
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("1");
  });

  it("`npm run -s db:cleanup` exits 0 with the JSON result on stdout", async () => {
    const userId = await seedForCommand();
    // Only the container database: the variable wins over every .env* file.
    const env = { ...process.env, DATABASE_URL: inject("databaseUrl") };

    const { stdout, stderr } = await execFileAsync("npm", ["run", "-s", "db:cleanup"], { cwd: repoRoot, env });

    expect(stderr).toBe("");
    const result = JSON.parse(stdout.trim()) as CleanupResult;
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(Object.keys(result).sort()).toEqual(
      [
        "cancelledGames",
        "emailVerificationTokens",
        "errors",
        "guestTokens",
        "passwordResetTokens",
        "rateLimitBuckets",
        "sessions",
        "truncated",
        "unverifiedUsers",
        "waitingGames",
      ],
    );
    expect(result.errors).toEqual([]);
    expect(await rows("sessions", `user_id = '${userId}'`)).toBe("1");
  });

  it("exits 1 with a masked error on stderr when the database is unreachable", async () => {
    const env = { ...process.env, DATABASE_URL: "postgresql://gomoku:s3cretpw@127.0.0.1:1/gomoku" };

    const failure = await execFileAsync("npm", ["run", "-s", "db:cleanup"], { cwd: repoRoot, env }).catch(
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

    // The lazily connecting ORM fails inside every rule: the (empty) progress still goes to stdout.
    expect(failure).toMatchObject({ code: 1 });
    const { stdout, stderr } = failure as { stdout: string; stderr: string };
    expect(stderr).not.toContain("s3cretpw");
    expect(stdout).not.toContain("s3cretpw");
    expect(JSON.parse(stdout.trim()).errors).toHaveLength(8);
    expect(JSON.parse(stderr.trim().split("\n").at(-1)!)).toMatchObject({ ok: false });
  });
});
