// Rematch on a real PostgreSQL (E02-S06, #88): `RematchService` against the Testcontainers
// database. The races, BR-13, the rollback through `tx`, the lazy expiry and the guest tokens
// live in SQL, so a fake `em` cannot prove them. Services are built like `withRequestScope`
// builds them.
import { REMATCH_OFFER_LIMIT, TooManyRequestsError } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { RematchService } from "../../packages/app/src/server/services/games/rematch-service";
import { SqlTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";
import { deriveRematchToken, hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";

let orm: Orm;
let counter = 0;

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, any>[]>(text, params); // eslint-disable-line @typescript-eslint/no-explicit-any

async function insertUser(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const [row] = await run(
    `insert into users (email, display_name, display_name_key, password_hash) values (?, ?, ?, ?) returning id`,
    [`rematch-${n}@example.com`, `Rm_${n}`, `rm_${n}`, "x".repeat(60)],
  );
  return row!.id as string;
}

type Seated = { userId: string } | { guestToken: string; nickname?: string };

/** A finished draw between two players (no slot is held), black = `blackSeat`. */
async function finishedGame(
  seats: [Seated, Seated],
  { blackSeat = 1, finishedAt = new Date() }: { blackSeat?: 1 | 2; finishedAt?: Date } = {},
): Promise<{ gameId: string; players: string[] }> {
  const [game] = await run(
    `insert into games (origin, status, started_at, finished_at, black_seat, end_reason)
     values ('invite', 'finished', ?, ?, ?, 'draw') returning id`,
    [new Date(finishedAt.getTime() - 60_000), finishedAt, blackSeat],
  );
  const players: string[] = [];
  for (const [index, seated] of seats.entries()) {
    const [player] = await run(
      "userId" in seated
        ? `insert into game_players (game_id, seat, kind, user_id, is_active, seen_at) values (?, ?, 'account', ?, false, now()) returning id`
        : `insert into game_players (game_id, seat, kind, guest_token_hash, nickname, is_active, seen_at) values (?, ?, 'guest', ?, ?, false, now()) returning id`,
      "userId" in seated
        ? [game!.id, index + 1, seated.userId]
        : [game!.id, index + 1, hashOpaqueToken(seated.guestToken), seated.nickname ?? null],
    );
    players.push(player!.id as string);
  }
  return { gameId: game!.id as string, players };
}

type Em = ReturnType<Orm["em"]["fork"]>;

function scope(configure?: (em: Em) => void) {
  const em = orm.em.fork();
  configure?.(em);
  const timeoutSettler = new SqlTimeoutSettler({ em, clock: systemClock });
  const rateLimiter = new RateLimiter({ em });
  return {
    rematch: new RematchService({ em, clock: systemClock, rateLimiter, timeoutSettler }),
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

const gameRow = async (id: string) => (await run(`select * from games where id = ?`, [id]))[0]!;
const playersOf = (gameId: string) =>
  run(`select seat, kind, user_id, guest_token_hash, nickname, is_active, seen_at from game_players where game_id = ? order by seat`, [gameId]);

/** Two accounts with a finished game; `p1` / `p2` are the player ids by seat. */
async function accountsGame(options: { blackSeat?: 1 | 2 } = {}) {
  const [u1, u2] = [await insertUser(), await insertUser()];
  const { gameId, players } = await finishedGame([{ userId: u1 }, { userId: u2 }], options);
  return { gameId, u1, u2, p1: { playerId: players[0]! }, p2: { playerId: players[1]! } };
}

describe("RematchService.offer", () => {
  it("writes a pending offer for five minutes on the finished game", async () => {
    const { gameId, p2 } = await accountsGame();

    const view = await scope().rematch.offer(p2, gameId);

    const row = await gameRow(gameId);
    expect(view).toMatchObject({ state: "pending", offeredBySeat: 2, gameId: null });
    expect([row.rematch_state, row.rematch_offered_by_seat]).toEqual(["pending", 2]);
    const ttl = new Date(row.rematch_expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);
  });

  it("refuses a game that is still running", async () => {
    const [u1, u2] = [await insertUser(), await insertUser()];
    const { gameId, players } = await finishedGame([{ userId: u1 }, { userId: u2 }]);
    await run(`update games set status = 'active', finished_at = null, end_reason = null where id = ?`, [gameId]);
    await expect(scope().rematch.offer({ playerId: players[0]! }, gameId)).rejects.toMatchObject({ code: "GAME_NOT_FINISHED" });
  });

  it("lets exactly one of two simultaneous offers win", async () => {
    const { gameId, p1, p2 } = await accountsGame();

    const results = await Promise.allSettled([scope().rematch.offer(p1, gameId), scope().rematch.offer(p2, gameId)]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const loser = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ status: 409, code: "REMATCH_ALREADY_OFFERED" });
  });

  it("allows a new offer once the old one expired or was declined, not while it is open", async () => {
    const { gameId, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p1, gameId);
    await expect(scope().rematch.offer(p2, gameId)).rejects.toMatchObject({ code: "REMATCH_ALREADY_OFFERED" });

    await run(`update games set rematch_expires_at = now() - interval '1 second' where id = ?`, [gameId]);
    await expect(scope().rematch.offer(p2, gameId)).resolves.toMatchObject({ offeredBySeat: 2 });

    await scope().rematch.decline(p1, gameId);
    await expect(scope().rematch.offer(p1, gameId)).resolves.toMatchObject({ offeredBySeat: 1 });
  });

  it("answers 404 to a stranger", async () => {
    const { gameId } = await accountsGame();
    const other = await accountsGame();
    await expect(scope().rematch.offer(other.p1, gameId)).rejects.toMatchObject({ status: 404 });
  });

  it("limits a player to ten offers per hour", async () => {
    const { gameId, p1 } = await accountsGame();
    const { rematch } = scope();
    for (let i = 0; i < REMATCH_OFFER_LIMIT; i++) {
      await rematch.offer(p1, gameId);
      await rematch.decline(p1, gameId);
    }
    await expect(rematch.offer(p1, gameId)).rejects.toBeInstanceOf(TooManyRequestsError);
  });
});

describe("RematchService.accept", () => {
  it("creates an active rematch with swapped colours, the same seats and no invitation", async () => {
    const { gameId, u1, u2, p1, p2 } = await accountsGame({ blackSeat: 1 });
    await scope().rematch.offer(p1, gameId);

    const { gameId: newId, guestToken } = await scope().rematch.accept(p2, gameId);

    expect(guestToken).toBeUndefined();
    const game = await gameRow(newId);
    expect(game).toMatchObject({ origin: "rematch", status: "active", black_seat: 2, move_count: 0 });
    expect(game.turn_started_at).toBeNull();
    const players = await playersOf(newId);
    expect(players.map(({ seat, user_id, is_active, seen_at }) => [seat, user_id, is_active, seen_at])).toEqual([
      [1, u1, true, null],
      [2, u2, true, null],
    ]);
    expect(await run(`select 1 from invitations where game_id = ?`, [newId])).toHaveLength(0);
    const old = await gameRow(gameId);
    expect([old.rematch_state, old.rematch_game_id]).toEqual(["accepted", newId]);
    // The new game is readable by its players and shows the swapped colours.
    expect(await scope().games.getState((await scope().games.findParticipant({ userId: u1 }, newId))!, newId)).toMatchObject({
      status: "active", blackSeat: 2, you: { seat: 1 },
    });
  });

  it("swaps the other way round as well", async () => {
    const { gameId, p1, p2 } = await accountsGame({ blackSeat: 2 });
    await scope().rematch.offer(p2, gameId);
    const { gameId: newId } = await scope().rematch.accept(p1, gameId);
    expect((await gameRow(newId)).black_seat).toBe(1);
  });

  it("refuses the proposer, a missing offer and a stranger", async () => {
    const { gameId, p1, p2 } = await accountsGame();
    await expect(scope().rematch.accept(p2, gameId)).rejects.toMatchObject({ code: "REMATCH_NOT_OFFERED" });
    await scope().rematch.offer(p1, gameId);
    await expect(scope().rematch.accept(p1, gameId)).rejects.toMatchObject({ code: "REMATCH_NOT_OFFERED" });
    await expect(scope().rematch.accept((await accountsGame()).p1, gameId)).rejects.toMatchObject({ status: 404 });
  });

  it("creates the game once for two simultaneous accepts, both get it", async () => {
    const { gameId, u1, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p1, gameId);

    const [a, b] = await Promise.all([scope().rematch.accept(p2, gameId), scope().rematch.accept(p2, gameId)]);

    expect(a.gameId).toBe(b.gameId);
    const games = await run(`select g.id from games g join game_players p on p.game_id = g.id where p.user_id = ? and g.origin = 'rematch'`, [u1]);
    expect(games).toHaveLength(1);
  });

  it("lets exactly one of accept and decline win, and leaves a consistent row", async () => {
    for (let round = 0; round < 5; round++) {
      const { gameId, u1, p1, p2 } = await accountsGame();
      await scope().rematch.offer(p1, gameId);

      const [accept, decline] = await Promise.allSettled([scope().rematch.accept(p2, gameId), scope().rematch.decline(p2, gameId)]);

      const row = await gameRow(gameId);
      const created = await run(`select g.id from games g join game_players p on p.game_id = g.id where p.user_id = ? and g.origin = 'rematch'`, [u1]);
      if (row.rematch_state === "accepted") {
        expect(accept.status).toBe("fulfilled");
        expect(decline).toMatchObject({ status: "rejected", reason: { code: "REMATCH_NOT_OFFERED" } });
        expect(created).toHaveLength(1);
      } else {
        expect(row.rematch_state).toBe("declined");
        expect(decline.status).toBe("fulfilled");
        expect(accept).toMatchObject({ status: "rejected", reason: { code: "REMATCH_NOT_OFFERED" } });
        expect(created).toHaveLength(0);
      }
    }
  });

  it("refuses an expired offer by the database clock and creates nothing", async () => {
    const { gameId, u1, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p1, gameId);
    await run(`update games set rematch_expires_at = now() - interval '1 second' where id = ?`, [gameId]);

    await expect(scope().rematch.accept(p2, gameId)).rejects.toMatchObject({ status: 409, code: "REMATCH_EXPIRED" });
    await expect(scope().rematch.decline(p2, gameId)).rejects.toMatchObject({ code: "REMATCH_EXPIRED" });

    expect(await run(`select 1 from game_players p join games g on g.id = p.game_id where p.user_id = ? and g.origin = 'rematch'`, [u1])).toHaveLength(0);
    // The state is read as expired, lazily.
    const state = await scope().games.getState((await scope().games.findParticipant({ userId: u1 }, gameId))!, gameId);
    expect(state.rematch).toMatchObject({ state: "expired", offeredBySeat: 1, gameId: null });
  });

  it("refuses when the caller already has a game (BR-13) with a link, the offer stays", async () => {
    const { gameId, u2, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p1, gameId);
    const { gameId: other } = await scope().games.create(u2);

    await expect(scope().rematch.accept(p2, gameId)).rejects.toMatchObject({
      status: 409, code: "ACTIVE_GAME_EXISTS", data: { gameId: other },
    });

    expect((await gameRow(gameId)).rematch_state).toBe("pending");
    // Once the game is cancelled the same offer can be accepted.
    await scope().games.cancel(u2, other);
    await expect(scope().rematch.accept(p2, gameId)).resolves.toMatchObject({ gameId: expect.any(String) });
  });

  it("refuses without a link when only the proposer has a game", async () => {
    const { gameId, u1, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p1, gameId);
    await scope().games.create(u1);

    const error = await scope().rematch.accept(p2, gameId).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 409, code: "ACTIVE_GAME_EXISTS" });
    expect((error as { data?: unknown }).data).toBeUndefined();
  });

  it("rolls the whole acceptance back when the last step fails", async () => {
    const { gameId, u1, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p1, gameId);
    const failing = scope((em) => {
      const transactional = em.transactional.bind(em);
      (em as any).transactional = (fn: (tx: Em) => unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
        transactional(async (tx: Em) => {
          const execute = tx.execute.bind(tx);
          (tx as any).execute = async (sql: string, ...rest: unknown[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (sql.includes("rematch_state = 'accepted'")) throw new Error("forced failure");
            return (execute as any)(sql, ...rest); // eslint-disable-line @typescript-eslint/no-explicit-any
          };
          return fn(tx);
        });
    });

    await expect(failing.rematch.accept(p2, gameId)).rejects.toThrow("forced failure");

    expect((await gameRow(gameId)).rematch_state).toBe("pending");
    expect(await run(`select 1 from game_players p join games g on g.id = p.game_id where p.user_id = ? and g.origin = 'rematch'`, [u1])).toHaveLength(0);
    // Nothing is left behind: the retry succeeds.
    await expect(scope().rematch.accept(p2, gameId)).resolves.toMatchObject({ gameId: expect.any(String) });
  });

  it("refuses when the proposer's account is gone", async () => {
    const { gameId, p1, p2 } = await accountsGame();
    await scope().rematch.offer(p2, gameId);
    await run(`update game_players set user_id = null where id = ?`, [p2.playerId]);
    await expect(scope().rematch.accept(p1, gameId)).rejects.toMatchObject({ status: 409, code: "REMATCH_UNAVAILABLE" });
  });
});

describe("rematch with a guest", () => {
  it("gives a guest acceptor a derived token, copies the nickname and swaps the colours", async () => {
    const u1 = await insertUser();
    const old = `old-${Date.now()}-${++counter}`;
    const { gameId, players } = await finishedGame([{ userId: u1 }, { guestToken: old, nickname: "Olek" }], { blackSeat: 2 });
    await scope().rematch.offer({ playerId: players[0]! }, gameId);

    const result = await scope().rematch.accept({ playerId: players[1]! }, gameId, old);

    expect(result.guestToken).toBe(deriveRematchToken(old, result.gameId));
    const seats = await playersOf(result.gameId);
    expect(seats.map(({ kind, nickname, guest_token_hash, is_active }) => [kind, nickname, guest_token_hash, is_active])).toEqual([
      ["account", null, null, true],
      ["guest", "Olek", hashOpaqueToken(result.guestToken!), true],
    ]);
    expect((await gameRow(result.gameId)).black_seat).toBe(1);
    // The new token opens the new game; the old one does not.
    expect(await scope().games.findParticipant({ guestTokenHash: hashOpaqueToken(result.guestToken!) }, result.gameId)).not.toBeNull();
    expect(await scope().games.findParticipant({ guestTokenHash: hashOpaqueToken(old) }, result.gameId)).toBeNull();
    // Repeating the accept (a lost response) gives the same token.
    expect(await scope().rematch.accept({ playerId: players[1]! }, gameId, old)).toEqual(result);
  });

  it("lets the guest who proposed claim the same seat's token, once and repeatably", async () => {
    const u1 = await insertUser();
    const old = `old-${Date.now()}-${++counter}`;
    const { gameId, players } = await finishedGame([{ userId: u1 }, { guestToken: old }]);
    const guestPlayer = { playerId: players[1]! };
    await scope().rematch.offer(guestPlayer, gameId);
    const { gameId: newId } = await scope().rematch.accept({ playerId: players[0]! }, gameId);

    // Before the claim the guest's seat has no token.
    expect((await playersOf(newId))[1]!.guest_token_hash).toBeNull();
    const token = await scope().rematch.claimGuestSeat(guestPlayer, gameId, old);
    expect(token).toBe(deriveRematchToken(old, newId));
    expect(await scope().rematch.claimGuestSeat(guestPlayer, gameId, old)).toBe(token);
    expect(await scope().games.findParticipant({ guestTokenHash: hashOpaqueToken(token!) }, newId)).not.toBeNull();
    // An account has nothing to claim, and a seat held by another token is not taken over.
    expect(await scope().rematch.claimGuestSeat({ playerId: players[0]! }, gameId, old)).toBeUndefined();
    await run(`update game_players set guest_token_hash = ? where game_id = ? and seat = 2`, [hashOpaqueToken("somebody-else"), newId]);
    expect(await scope().rematch.claimGuestSeat(guestPlayer, gameId, old)).toBeUndefined();
  });

  it("refuses when a guest's token no longer works (an hour after the end)", async () => {
    const u1 = await insertUser();
    const old = `old-${Date.now()}-${++counter}`;
    const { gameId, players } = await finishedGame([{ userId: u1 }, { guestToken: old }]);
    await scope().rematch.offer({ playerId: players[1]! }, gameId);
    await run(`update games set finished_at = now() - interval '2 hours' where id = ?`, [gameId]);
    await expect(scope().rematch.accept({ playerId: players[0]! }, gameId)).rejects.toMatchObject({ status: 409, code: "REMATCH_UNAVAILABLE" });
  });

  it("accepts only while the proposing guest still has a whole offer window to claim (last minutes of the token)", async () => {
    const minutesAgo = (m: number) => `update games set finished_at = now() - interval '${m} minutes' where id = ?`;
    // 54 minutes after the end: the old token still has 6 minutes, longer than the 5-minute offer.
    const early = `old-${Date.now()}-${++counter}`;
    const a = await finishedGame([{ guestToken: early }, { userId: await insertUser() }]);
    await scope().rematch.offer({ playerId: a.players[0]! }, a.gameId);
    await run(minutesAgo(54), [a.gameId]);
    const { gameId: newId } = await scope().rematch.accept({ playerId: a.players[1]! }, a.gameId);
    // The proposer can still claim their seat in that window.
    expect(await scope().rematch.claimGuestSeat({ playerId: a.players[0]! }, a.gameId, early)).toBe(deriveRematchToken(early, newId));

    // 56 minutes after the end: an acceptance would leave a seat nobody can claim.
    const late = `old-${Date.now()}-${++counter}`;
    const b = await finishedGame([{ guestToken: late }, { userId: await insertUser() }]);
    await scope().rematch.offer({ playerId: b.players[0]! }, b.gameId);
    await run(minutesAgo(56), [b.gameId]);
    await expect(scope().rematch.accept({ playerId: b.players[1]! }, b.gameId)).rejects.toMatchObject({ status: 409, code: "REMATCH_UNAVAILABLE" });
    expect(await run(`select id from games where origin = 'rematch' and id in (select rematch_game_id from games where id = ?)`, [b.gameId])).toHaveLength(0);
  });

  it("works between two guests: each gets a token of their own", async () => {
    const [a, b] = [`ga-${Date.now()}-${++counter}`, `gb-${Date.now()}-${++counter}`];
    const { gameId, players } = await finishedGame([{ guestToken: a, nickname: "Ala" }, { guestToken: b }]);
    await scope().rematch.offer({ playerId: players[0]! }, gameId);
    const { gameId: newId, guestToken } = await scope().rematch.accept({ playerId: players[1]! }, gameId, b);
    const claimed = await scope().rematch.claimGuestSeat({ playerId: players[0]! }, gameId, a);
    expect(new Set([guestToken, claimed]).size).toBe(2);
    expect((await playersOf(newId)).map(({ nickname }) => nickname)).toEqual(["Ala", null]);
  });
});
