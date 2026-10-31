// Cleanup of expired records on a real PostgreSQL (spec 2026-10-24-expired-records-cleanup):
// thresholds of every rule, batching, parallel runs (`for update skip locked`), foreign keys
// and the `db:cleanup` command (`runCleanup` and the npm script as a process). Runs only on
// the Testcontainers database from global-setup — never point it at another database.
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { INITIAL_CLOCK_MS, READY_DEADLINE_MS, seatOutOfTime, type Seat } from "@gomoku/core";
import { createOrm, cleanupExpired, type CleanupResult, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { runCleanup } from "../../packages/db/src/cleanup/run-cleanup";

const baseUrl = inject("baseUrl");
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

  it("lobby_seekers: statuses expired more than 1 h ago go, the rest stays (#25)", async () => {
    const now = new Date();
    const seeker = async (expiresAt: Date) => {
      const userId = await insertUser();
      await sql(`insert into lobby_seekers (user_id, created_at, expires_at) values (?, ?, ?)`, [
        userId,
        new Date(expiresAt.getTime() - 5 * 60_000),
        expiresAt,
      ]);
      return userId;
    };
    const gone = await seeker(ago(now, HOUR + SECOND));
    const onEdge = await seeker(ago(now, HOUR)); // exactly on the cutoff: kept (strict <)
    const expiredInMargin = await seeker(ago(now, HOUR - SECOND));
    const valid = await seeker(new Date(now.getTime() + 60_000));

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.lobbySeekers).toBeGreaterThanOrEqual(1);
    expect(await rows("lobby_seekers", `user_id = '${gone}'`)).toBe("0");
    for (const kept of [onEdge, expiredInMargin, valid]) {
      expect(await rows("lobby_seekers", `user_id = '${kept}'`)).toBe("1");
    }
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

  /** Seat 2 of a game as an account, so the game is no longer "guests only" (history of an account). */
  async function withAccountSeat2(id: string) {
    const userId = await insertUser();
    await sql(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 2, 'account', ?, false)`, [id, userId]);
  }

  it("never deletes games in progress or finished ones that have an account", async () => {
    const now = new Date();
    const active = await insertGame("waiting", 5 * HOUR, now);
    await withAccountSeat2(active);
    await sql(`update games set status = 'active', started_at = ?, black_seat = 1 where id = ?`, [ago(now, 5 * HOUR), active]);
    const finished = await insertGame("waiting", 5 * HOUR, now);
    await withAccountSeat2(finished);
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
      await withAccountSeat2(id); // a guest + an account: kept as history, only the guest hash goes
      await sql(
        `update games set status = 'finished', started_at = ?, black_seat = 1, winner_seat = 1, end_reason = 'timeout', finished_at = ? where id = ?`,
        [ago(now, 6 * HOUR), ago(now, agoMs), id],
      );
      return id;
    };
    const old = await finish(HOUR + 10 * SECOND);
    const recent = await finish(HOUR - 10 * SECOND);
    const hashOf = async (id: string) =>
      (await orm.em.fork().execute<{ h: string | null }[]>(`select guest_token_hash as h from game_players where game_id = ? and kind = 'guest'`, [id]))[0]!.h;

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.guestTokens).toBeGreaterThanOrEqual(1);
    expect(await hashOf(old)).toBeNull();
    expect(await hashOf(recent)).not.toBeNull();
    expect(await exists(old)).toBe(true);
    // A second run clears nothing more (the condition stops matching).
    expect((await cleanupExpired({ em: orm.em.fork(), now })).guestTokens).toBe(0);
  });
});

describe("guest-only games rules (#102, spec 2026-10-30-guest-only-games-cleanup)", () => {
  type Kind = "guest" | "account" | "deleted-account";
  type Spec = {
    kinds?: [Kind, Kind];
    status?: "active" | "finished";
    moveCount?: number;
    blackSeat?: Seat;
    clocks?: [number, number];
    /** `turn_started_at`; `null` = the clock never started. */
    turnStartedAt?: Date | null;
    startedAt?: Date;
    finishedAt?: Date;
  };

  /** Bit string of a board with `count` stones from cell `offset` (disjoint boards, matching `move_count`). */
  const board = (count: number, offset: number) =>
    "0".repeat(offset) + "1".repeat(count) + "0".repeat(225 - offset - count);

  async function insertDuel(now: Date, spec: Spec = {}): Promise<string> {
    const { kinds = ["guest", "guest"], status = "active", moveCount = 0, blackSeat = 1, clocks = [INITIAL_CLOCK_MS, INITIAL_CLOCK_MS] } = spec;
    const black = Math.ceil(moveCount / 2);
    const white = Math.floor(moveCount / 2);
    const finished = status === "finished";
    const [game] = await orm.em.fork().execute<{ id: string }[]>(
      `insert into games (origin, status, created_at, started_at, black_seat, move_count, stones_black, stones_white, moves,
                          clock_ms_1, clock_ms_2, turn_started_at, finished_at, winner_seat, end_reason)
       values ('invite', ?, ?, ?, ?, ?, ?::bit(225), ?::bit(225), decode(repeat('00', ?::int), 'hex'), ?, ?, ?, ?, ?, ?) returning id`,
      [
        status,
        ago(now, 30 * HOUR),
        spec.startedAt ?? ago(now, 29 * HOUR),
        blackSeat,
        moveCount,
        board(black, 0),
        board(white, black),
        moveCount,
        clocks[0],
        clocks[1],
        finished ? null : (spec.turnStartedAt === undefined ? ago(now, 29 * HOUR) : spec.turnStartedAt),
        finished ? (spec.finishedAt ?? ago(now, 2 * HOUR)) : null,
        finished ? 1 : null,
        finished ? "timeout" : null,
      ],
    );
    const id = game!.id;
    for (const [index, kind] of kinds.entries()) {
      if (kind === "guest") {
        await sql(`insert into game_players (game_id, seat, kind, guest_token_hash, is_active) values (?, ?, 'guest', ?, false)`, [id, index + 1, hash()]);
      } else {
        const userId = kind === "account" ? await insertUser() : null;
        await sql(`insert into game_players (game_id, seat, kind, user_id, is_active) values (?, ?, 'account', ?, false)`, [id, index + 1, userId]);
      }
    }
    await sql(`insert into invitations (game_id, code, created_at, expires_at) values (?, ?, ?, ?)`, [
      id,
      new InvitationCodes().generate(),
      ago(now, 30 * HOUR),
      ago(now, 6 * HOUR),
    ]);
    return id;
  }
  const exists = async (id: string) => (await rows("games", `id = '${id}'`)) === "1";
  const dependents = async (id: string) =>
    Number(await rows("game_players", `game_id = '${id}'`)) + Number(await rows("invitations", `game_id = '${id}'`));

  /** An active guests-only game whose clock (the player on turn) ran out `deadlineAgo` ms before `now`. */
  const expiredAt = (now: Date, deadlineAgo: number, onTurn = INITIAL_CLOCK_MS) => ago(now, deadlineAgo + onTurn);

  it("active: removes a game only more than 1 h past the clock deadline (the boundary stays)", async () => {
    const now = new Date();
    const past = await insertDuel(now, { turnStartedAt: expiredAt(now, HOUR + SECOND) });
    const onTheLine = await insertDuel(now, { turnStartedAt: expiredAt(now, HOUR) });
    const inWindow = await insertDuel(now, { turnStartedAt: expiredAt(now, HOUR - SECOND) });
    const alive = await insertDuel(now, { turnStartedAt: ago(now, SECOND) });

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.guestOnlyActiveGames).toBeGreaterThanOrEqual(1);
    expect(await exists(past)).toBe(false);
    expect(await dependents(past)).toBe(0); // players and invitation went with it (cascade)
    expect(await exists(onTheLine)).toBe(true);
    expect(await exists(inWindow)).toBe(true);
    expect(await exists(alive)).toBe(true);
  });

  it("active: a clock that never started uses the ready deadline (15 min) plus 1 h", async () => {
    const now = new Date();
    const gone = await insertDuel(now, { turnStartedAt: null, startedAt: ago(now, HOUR + READY_DEADLINE_MS + SECOND) });
    const onTheLine = await insertDuel(now, { turnStartedAt: null, startedAt: ago(now, HOUR + READY_DEADLINE_MS) });
    const waiting = await insertDuel(now, { turnStartedAt: null, startedAt: ago(now, 74 * 60 * SECOND) });

    await cleanupExpired({ em: orm.em.fork(), now });

    expect(await exists(gone)).toBe(false);
    expect(await exists(onTheLine)).toBe(true);
    expect(await exists(waiting)).toBe(true);
  });

  it("never touches a game with an account, a deleted account or a guest next to an account", async () => {
    const now = new Date();
    const dead = { turnStartedAt: expiredAt(now, 5 * HOUR) };
    const kinds: [Kind, Kind][] = [["account", "account"], ["guest", "account"], ["account", "guest"], ["deleted-account", "guest"], ["guest", "deleted-account"]];
    const ids: string[] = [];
    for (const pair of kinds) {
      ids.push(await insertDuel(now, { ...dead, kinds: pair }));
      ids.push(await insertDuel(now, { kinds: pair, status: "finished", finishedAt: ago(now, 5 * HOUR) }));
    }
    const guests = await insertDuel(now, dead);

    await cleanupExpired({ em: orm.em.fork(), now });

    for (const id of ids) expect(await exists(id), id).toBe(true);
    expect(await exists(guests)).toBe(false);
    // The guest-only deletion leaves the slots of accounts untouched (BR-13): none of those rows was removed.
    expect(await rows("game_players", `game_id in (${ids.map((id) => `'${id}'`).join(",")})`)).toBe(String(ids.length * 2));
  });

  it("finished: removes a guests-only game 1 h after the end, keeps the boundary and games with an account", async () => {
    const now = new Date();
    const gone = await insertDuel(now, { status: "finished", finishedAt: ago(now, HOUR + SECOND) });
    const onTheLine = await insertDuel(now, { status: "finished", finishedAt: ago(now, HOUR) });
    const recent = await insertDuel(now, { status: "finished", finishedAt: ago(now, HOUR - SECOND) });
    const history = await insertDuel(now, { status: "finished", kinds: ["guest", "account"], finishedAt: ago(now, 30 * HOUR) });

    const result = await cleanupExpired({ em: orm.em.fork(), now });

    expect(result.guestOnlyFinishedGames).toBeGreaterThanOrEqual(1);
    expect(await exists(gone)).toBe(false);
    expect(await dependents(gone)).toBe(0);
    expect(await exists(onTheLine)).toBe(true);
    expect(await exists(recent)).toBe(true);
    expect(await exists(history)).toBe(true);
    // The token of the surviving game's guest is still cleared by its own rule once old enough.
    expect(await rows("game_players", `game_id = '${history}' and guest_token_hash is null and kind = 'guest'`)).toBe("1");
  });

  it("a rematch pointer to a removed game is cleared, and a second run removes nothing more", async () => {
    const now = new Date();
    const old = await insertDuel(now, { status: "finished", finishedAt: ago(now, 5 * HOUR) });
    const next = await insertDuel(now, { turnStartedAt: ago(now, SECOND) });
    await sql(`update games set rematch_game_id = ? where id = ?`, [next, old]);
    const link = await insertDuel(now, { status: "finished", kinds: ["guest", "account"], finishedAt: ago(now, 5 * HOUR) });
    await sql(`update games set rematch_game_id = ? where id = ?`, [old, link]);

    await cleanupExpired({ em: orm.em.fork(), now });

    expect(await exists(old)).toBe(false);
    expect(await exists(next)).toBe(true);
    expect((await orm.em.fork().execute<{ r: string | null }[]>(`select rematch_game_id as r from games where id = ?`, [link]))[0]!.r).toBeNull();
    const second = await cleanupExpired({ em: orm.em.fork(), now });
    expect(second.guestOnlyActiveGames).toBe(0);
  });

  it("the SQL clock agrees with seatOutOfTime of @gomoku/core (parity, both seats, clocks 0 and full)", async () => {
    const now = new Date();
    const cutoffMs = now.getTime() - HOUR;
    const cases: { moveCount: number; blackSeat: Seat; clocks: [number, number]; offset: number }[] = [];
    for (const moveCount of [0, 1, 2, 3]) {
      for (const blackSeat of [1, 2] as Seat[]) {
        for (const clocks of [[0, INITIAL_CLOCK_MS], [INITIAL_CLOCK_MS, 0], [123_456, 654_321 - 100_000]] as [number, number][]) {
          for (const offset of [-5 * SECOND, 5 * SECOND]) cases.push({ moveCount, blackSeat, clocks, offset });
        }
      }
    }
    for (const { moveCount, blackSeat, clocks, offset } of cases) {
      const turnSeat: Seat = moveCount % 2 === 0 ? blackSeat : ((3 - blackSeat) as Seat);
      // The deadline of the seat on turn falls `offset` ms before the cutoff (negative: after it).
      const turnStartedAt = new Date(cutoffMs - offset - clocks[turnSeat - 1]!);
      const id = await insertDuel(now, { moveCount, blackSeat, clocks, turnStartedAt });
      const expected = seatOutOfTime({ clockMs: clocks, turnStartedAtMs: turnStartedAt.getTime(), turnSeat }, cutoffMs - 1) !== null;

      await cleanupExpired({ em: orm.em.fork(), now });

      expect(await exists(id), JSON.stringify({ moveCount, blackSeat, clocks, offset })).toBe(!expected);
    }
  });
});

describe("guest-only games rules: races with the application (#102)", () => {
  let addressCounter = 0;
  const nextAddress = () => `198.21.${Math.floor(addressCounter / 250)}.${(addressCounter++ % 250) + 1}`;
  type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const call = (method: "GET" | "POST", path: string, cookie?: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-gomoku-request": "1",
        "x-forwarded-for": nextAddress(),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  /** Two guests, both have opened the page (the clock runs). Returns the game and each seat's cookie. */
  async function guestGame() {
    const created = await call("POST", "/api/games", undefined, { acknowledgedGuestWarning: true });
    expect(created.status).toBe(201);
    const data = ((await created.json()) as { data: Json }).data;
    const creator = cookieOf(created);
    const joined = await call("POST", `/api/invitations/${data.invitation.code}/accept`, undefined, { acknowledgedGuestWarning: true, as: "guest" });
    expect(joined.status).toBe(200);
    const joiner = cookieOf(joined);
    const gameId = data.gameId as string;
    expect((await call("GET", `/api/games/${gameId}`, creator)).status).toBe(200);
    expect((await call("GET", `/api/games/${gameId}`, joiner)).status).toBe(200);
    const [row] = await orm.em.fork().execute<{ black_seat: 1 | 2 }[]>(`select black_seat from games where id = ?`, [gameId]);
    const [black, white] = row!.black_seat === 1 ? [creator, joiner] : [joiner, creator];
    return { gameId, creator, joiner, black, white };
  }
  const exists = async (id: string) => (await rows("games", `id = '${id}'`)) === "1";
  const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
  /** Holds `work` inside an open transaction until `release()`; resolves `ready` once `work` ran. */
  function heldTransaction<T>(work: (tx: Orm["em"]) => Promise<T>) {
    let release!: () => void;
    let ready!: () => void;
    const gate = new Promise<void>((resolveGate) => (release = resolveGate));
    const readyPromise = new Promise<void>((resolveReady) => (ready = resolveReady));
    const done = orm.em.fork().transactional(async (tx) => {
      const value = await work(tx as unknown as Orm["em"]);
      ready();
      await gate;
      return value;
    });
    return { ready: readyPromise, release, done };
  }
  const expireClock = (gameId: string, agoMs: number) =>
    sql(`update games set turn_started_at = now() - ? * interval '1 millisecond' where id = ?`, [agoMs + INITIAL_CLOCK_MS, gameId]);

  it("a player reading a game while the cleanup deletes it gets a 404, never a 500", async () => {
    const game = await guestGame();
    await expireClock(game.gameId, 2 * HOUR);
    const cleanup = heldTransaction((tx) => cleanupExpired({ em: tx, now: new Date() }));
    await cleanup.ready;

    const reading = call("GET", `/api/games/${game.gameId}`, game.black);
    await sleep(500); // the read is waiting for the lock of the row the cleanup deleted
    cleanup.release();
    await cleanup.done;
    const response = await reading;

    expect(response.status).toBe(404);
    expect(await exists(game.gameId)).toBe(false);
    expect((await call("GET", `/api/games/${game.gameId}`, game.black)).status).toBe(404);
    expect((await call("GET", `/api/games/${game.gameId}`, game.white)).status).toBe(404);
  });

  it("a move arriving while the cleanup deletes the game gets a 404, never a 500", async () => {
    const game = await guestGame();
    await expireClock(game.gameId, 2 * HOUR);
    const cleanup = heldTransaction((tx) => cleanupExpired({ em: tx, now: new Date() }));
    await cleanup.ready;

    const moving = call("POST", `/api/games/${game.gameId}/moves`, game.black, { x: 7, y: 7, moveNumber: 1 });
    await sleep(500);
    cleanup.release();
    await cleanup.done;

    expect((await moving).status).toBe(404);
    expect(await exists(game.gameId)).toBe(false);
  });

  it("skips a game locked by a settlement and removes it in the next run", async () => {
    const game = await guestGame();
    await expireClock(game.gameId, 2 * HOUR);
    const lock = heldTransaction((tx) => tx.execute(`select id from games where id = ? for update`, [game.gameId]));
    await lock.ready;

    await cleanupExpired({ em: orm.em.fork(), now: new Date() });
    expect(await exists(game.gameId)).toBe(true); // skipped, not waited for

    lock.release();
    await lock.done;
    await cleanupExpired({ em: orm.em.fork(), now: new Date() });
    expect(await exists(game.gameId)).toBe(false);
  });

  it("a move made just before the cutoff moves the deadline and protects the game", async () => {
    const game = await guestGame();
    await expireClock(game.gameId, -(60 * SECOND)); // one minute of the black clock left
    expect((await call("POST", `/api/games/${game.gameId}/moves`, game.black, { x: 7, y: 7, moveNumber: 1 })).status).toBe(200);
    const later = new Date(Date.now() + HOUR + 5 * 60 * SECOND); // the old deadline is 1 h 4 min behind `later`

    await cleanupExpired({ em: orm.em.fork(), now: later });

    expect(await exists(game.gameId)).toBe(true); // white's deadline is 10 min after the move
    await cleanupExpired({ em: orm.em.fork(), now: new Date(Date.now() + 3 * HOUR) });
    expect(await exists(game.gameId)).toBe(false);
  });

  it("two parallel runs remove every game and report each row once", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const game = await guestGame();
      await expireClock(game.gameId, 2 * HOUR);
      ids.push(game.gameId);
    }
    const now = new Date();

    const [first, second] = await Promise.all([
      cleanupExpired({ em: orm.em.fork(), now, batchSize: 1 }),
      cleanupExpired({ em: orm.em.fork(), now, batchSize: 1 }),
    ]);

    for (const id of ids) expect(await exists(id), id).toBe(false);
    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(first.guestOnlyActiveGames! + second.guestOnlyActiveGames!).toBeGreaterThanOrEqual(ids.length);
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
      lobbySeekers: 0,
      waitingGames: 0,
      cancelledGames: 0,
      guestOnlyActiveGames: 0,
      guestOnlyFinishedGames: 0,
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
        "guestOnlyActiveGames",
        "guestOnlyFinishedGames",
        "guestTokens",
        "lobbySeekers",
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
    expect(JSON.parse(stdout.trim()).errors).toHaveLength(11);
    expect(JSON.parse(stderr.trim().split("\n").at(-1)!)).toMatchObject({ ok: false });
  });
});
