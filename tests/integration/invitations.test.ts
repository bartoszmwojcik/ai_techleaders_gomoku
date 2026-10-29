// InvitationService on a real PostgreSQL (E02 phase 2): the atomic join, races and BR-13.
// The conditional updates, the row locks and the unique indexes live in SQL, so a fake `em`
// cannot prove them. Services are built like `withRequestScope` builds them.
import { INVITATION_LOOKUP_LIMIT, normalizeInvitationCode } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import {
  InvitationService,
  type LookupGuard,
} from "../../packages/app/src/server/services/games/invitation-service";
import { NoopTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
import { RateLimiter } from "../../packages/app/src/server/services/rate-limit/rate-limiter";

let orm: Orm;
let counter = 0;

beforeAll(async () => {
  orm = await createOrm({ clientUrl: inject("databaseUrl") });
});
afterAll(async () => {
  await orm.close();
});

const run = (text: string, params: unknown[] = []) =>
  orm.em.fork().execute<Record<string, unknown>[]>(text, params);

async function insertUser(): Promise<string> {
  const n = `${Date.now().toString(36)}${++counter}`;
  const [row] = await run(
    `insert into users (email, display_name, display_name_key, password_hash)
     values (?, ?, ?, ?) returning id`,
    [`inv-${n}@example.com`, `Inv_${n}`, `inv_${n}`, "x".repeat(60)],
  );
  return row!.id as string;
}

/** A fresh lookup pool per test, so a test never spends another's budget. */
const guard = (limit = 1000): LookupGuard => ({
  key: `invitation-lookup:test:${Date.now()}:${++counter}`,
  limit,
});

function scope() {
  const em = orm.em.fork();
  const rateLimiter = new RateLimiter({ em });
  const timeoutSettler = new NoopTimeoutSettler();
  return {
    invitations: new InvitationService({ em, clock: systemClock, rateLimiter, timeoutSettler }),
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

/** A creator with a waiting game; returns the dashed code as the user would type it. */
async function newGame() {
  const creator = await insertUser();
  const { gameId, invitation } = await scope().games.create(creator);
  return { creator, gameId, code: invitation.code };
}

const asUser = { as: "user" } as const;
const status = async (gameId: string) =>
  (await run(`select status from games where id = ?`, [gameId]))[0]!.status;
const players = (gameId: string) =>
  run(`select seat, user_id, is_active, seen_at from game_players where game_id = ? order by seat`, [gameId]);

describe("InvitationService.accept", () => {
  it("seats the second player, starts the game and consumes the invitation", async () => {
    const { creator, gameId, code } = await newGame();
    const joiner = await insertUser();

    const result = await scope().invitations.accept(code, { userId: joiner }, asUser, guard());

    expect(result).toEqual({ gameId });
    expect(await status(gameId)).toBe("active");
    const [game] = await run(`select started_at from games where id = ?`, [gameId]);
    expect(game!.started_at).not.toBeNull();
    const [first, second] = await players(gameId);
    expect(first).toMatchObject({ seat: 1, user_id: creator, is_active: true });
    expect(second).toMatchObject({ seat: 2, user_id: joiner, is_active: true });
    expect(second!.seen_at).not.toBeNull();
    const [invitation] = await run(
      `select i.consumed_at, p.seat from invitations i join game_players p on p.id = i.consumed_by_id where i.game_id = ?`,
      [gameId],
    );
    expect(invitation).toMatchObject({ seat: 2 });
    expect(invitation!.consumed_at).not.toBeNull();
  });

  it("accepts the code in any case, without the dash", async () => {
    const { code, gameId } = await newGame();
    const joiner = await insertUser();
    const typed = normalizeInvitationCode(code)!.toLowerCase();
    expect(await scope().invitations.accept(typed, { userId: joiner }, asUser, guard())).toEqual({ gameId });
  });

  it("returns the game to the joiner who calls again, and keeps one seat 2", async () => {
    const { code, gameId } = await newGame();
    const joiner = await insertUser();
    await scope().invitations.accept(code, { userId: joiner }, asUser, guard());

    const again = await scope().invitations.accept(code, { userId: joiner }, asUser, guard());

    expect(again).toEqual({ gameId });
    expect(await players(gameId)).toHaveLength(2);
  });

  it("refuses a third person with the uniform 410 and the game stays as it was", async () => {
    const { code, gameId } = await newGame();
    await scope().invitations.accept(code, { userId: await insertUser() }, asUser, guard());

    await expect(
      scope().invitations.accept(code, { userId: await insertUser() }, asUser, guard()),
    ).rejects.toMatchObject({ status: 410, code: "INVALID_INVITATION" });
    expect(await players(gameId)).toHaveLength(2);
  });

  it("refuses the creator's own invitation without consuming it", async () => {
    const { creator, code, gameId } = await newGame();
    await expect(
      scope().invitations.accept(code, { userId: creator }, asUser, guard()),
    ).rejects.toMatchObject({ status: 409, code: "OWN_INVITATION", data: { gameId } });
    expect(await status(gameId)).toBe("waiting");
  });

  it("refuses an expired invitation (the lazy closing is left to the next read of the game)", async () => {
    const { code, gameId } = await newGame();
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [gameId]);

    await expect(
      scope().invitations.accept(code, { userId: await insertUser() }, asUser, guard()),
    ).rejects.toMatchObject({ status: 410, code: "INVALID_INVITATION" });
    expect(await players(gameId)).toHaveLength(1);
  });

  it("refuses a cancelled game's invitation", async () => {
    const { creator, code, gameId } = await newGame();
    await scope().games.cancel(creator, gameId);
    await expect(
      scope().invitations.accept(code, { userId: await insertUser() }, asUser, guard()),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION" });
  });

  it("refuses an unknown code like any invalid one", async () => {
    await expect(
      scope().invitations.accept("ZZZZ-ZZZZ", { userId: await insertUser() }, asUser, guard()),
    ).rejects.toMatchObject({ status: 410, code: "INVALID_INVITATION" });
  });

  it("enforces BR-13 for the joiner: a game in progress blocks joining", async () => {
    const first = await newGame();
    const busy = await insertUser();
    await scope().invitations.accept(first.code, { userId: busy }, asUser, guard());
    const second = await newGame();

    await expect(
      scope().invitations.accept(second.code, { userId: busy }, asUser, guard()),
    ).rejects.toMatchObject({ status: 409, code: "ACTIVE_GAME_EXISTS", data: { gameId: first.gameId } });
    expect(await status(second.gameId)).toBe("waiting");
  });

  it("offers an own waiting game, and gives it up on request in the same transaction (Q18)", async () => {
    const mine = await newGame();
    const theirs = await newGame();

    await expect(
      scope().invitations.accept(theirs.code, { userId: mine.creator }, asUser, guard()),
    ).rejects.toMatchObject({ status: 409, code: "OWN_WAITING_GAME", data: { gameId: mine.gameId } });
    expect(await status(mine.gameId)).toBe("waiting");

    const result = await scope().invitations.accept(
      theirs.code,
      { userId: mine.creator },
      { as: "user", cancelOwnWaitingGame: true },
      guard(),
    );

    expect(result).toEqual({ gameId: theirs.gameId });
    expect(await status(mine.gameId)).toBe("cancelled");
    expect(await status(theirs.gameId)).toBe("active");
    expect((await players(mine.gameId))[0]).toMatchObject({ is_active: false });
  });

  it("does not deadlock when two friends exchanged links and both give up their own game", async () => {
    const a = await newGame();
    const b = await newGame();
    const flags = { as: "user", cancelOwnWaitingGame: true } as const;

    const outcomes = await Promise.allSettled([
      scope().invitations.accept(b.code, { userId: a.creator }, flags, guard()),
      scope().invitations.accept(a.code, { userId: b.creator }, flags, guard()),
    ]);

    // Exactly one wins (the other game was cancelled under it); neither fails with a deadlock.
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: expect.any(Number) });
    expect(rejected.reason.status).not.toBe(500);
    const finals = [await status(a.gameId), await status(b.gameId)].sort();
    expect(finals).toEqual(["active", "cancelled"]);
  });

  it("lets exactly one of many parallel accepts win", async () => {
    const { code, gameId } = await newGame();
    const joiners = await Promise.all(Array.from({ length: 8 }, () => insertUser()));

    const outcomes = await Promise.allSettled(
      joiners.map((userId) => scope().invitations.accept(code, { userId }, asUser, guard())),
    );

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        expect(outcome.reason).toMatchObject({ status: 410, code: "INVALID_INVITATION" });
      }
    }
    expect(await players(gameId)).toHaveLength(2);
    expect(await status(gameId)).toBe("active");
  });

  it("lets one user join only one of two games accepted at the same moment (BR-13)", async () => {
    const one = await newGame();
    const two = await newGame();
    const joiner = await insertUser();

    const outcomes = await Promise.allSettled([
      scope().invitations.accept(one.code, { userId: joiner }, asUser, guard()),
      scope().invitations.accept(two.code, { userId: joiner }, asUser, guard()),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409, code: "ACTIVE_GAME_EXISTS" });
    const [row] = await run(`select count(*)::int as n from game_players where user_id = ? and is_active`, [joiner]);
    expect(row!.n).toBe(1);
    const statuses = [await status(one.gameId), await status(two.gameId)].sort();
    expect(statuses).toEqual(["active", "waiting"]);
  });

  it("races accept against cancel: never an active game after cancelled", async () => {
    for (let round = 0; round < 6; round += 1) {
      const { creator, code, gameId } = await newGame();
      const joiner = await insertUser();

      const [joined, cancelled] = await Promise.allSettled([
        scope().invitations.accept(code, { userId: joiner }, asUser, guard()),
        scope().games.cancel(creator, gameId),
      ]);

      const finalStatus = await status(gameId);
      if (joined.status === "fulfilled") {
        expect(cancelled.status).toBe("rejected");
        expect((cancelled as PromiseRejectedResult).reason).toMatchObject({ code: "GAME_NOT_CANCELLABLE" });
        expect(finalStatus).toBe("active");
        expect(await players(gameId)).toHaveLength(2);
      } else {
        expect(cancelled.status).toBe("fulfilled");
        expect(joined.reason).toMatchObject({ status: 410, code: "INVALID_INVITATION" });
        expect(finalStatus).toBe("cancelled");
        expect(await players(gameId)).toHaveLength(1);
        // The cancelled game released the creator's slot.
        expect(await players(gameId)).toEqual([expect.objectContaining({ is_active: false })]);
      }
    }
  });

  it("counts failed lookups and then refuses even a valid code (429, Q13)", async () => {
    const { code } = await newGame();
    const pool = guard(INVITATION_LOOKUP_LIMIT);
    const user = await insertUser();
    for (let attempt = 0; attempt < INVITATION_LOOKUP_LIMIT; attempt += 1) {
      await expect(
        scope().invitations.accept("ZZZZ-ZZZZ", { userId: user }, asUser, pool),
      ).rejects.toMatchObject({ status: 410 });
    }

    const error = await scope()
      .invitations.accept(code, { userId: user }, asUser, pool)
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    await expect(scope().invitations.preview(code, {}, pool)).rejects.toMatchObject({ status: 429 });
    // A successful join does not spend the pool of failures.
    const other = guard(INVITATION_LOOKUP_LIMIT);
    await scope().invitations.accept(code, { userId: user }, asUser, other);
    const [bucket] = await run(`select coalesce(sum("count"), 0)::int as n from rate_limit_buckets where "key" = ?`, [other.key]);
    expect(bucket!.n).toBe(0);
  });
});

const GUEST = { as: "guest", acknowledgedGuestWarning: true } as const;

describe("InvitationService.accept as a guest", () => {
  it("seats the guest with only the hash of the token, seen at once, without a user", async () => {
    const { creator, code, gameId } = await newGame();

    const result = await scope().invitations.accept(code, {}, GUEST, guard());

    expect(result.gameId).toBe(gameId);
    expect(result.guestToken).toMatch(/^[\w-]{43}$/);
    expect(await status(gameId)).toBe("active");
    const [first, second] = await players(gameId);
    expect(first).toMatchObject({ user_id: creator });
    expect(second).toMatchObject({ seat: 2, user_id: null, is_active: true });
    expect(second!.seen_at).not.toBeNull();
    const [row] = await run(
      `select kind, guest_token_hash from game_players where game_id = ? and seat = 2`,
      [gameId],
    );
    expect(row).toEqual({ kind: "guest", guest_token_hash: hashOpaqueToken(result.guestToken!) });
  });

  it("returns a returning guest to the game without a new token, and refuses a third person", async () => {
    const { code, gameId } = await newGame();
    const { guestToken } = await scope().invitations.accept(code, {}, GUEST, guard());
    const viewer = { guestTokenHash: hashOpaqueToken(guestToken!) };

    expect(await scope().invitations.accept(code, viewer, GUEST, guard())).toEqual({ gameId });
    expect(await scope().invitations.preview(code, viewer, guard())).toMatchObject({
      state: "participant",
      gameId,
    });
    await expect(scope().invitations.accept(code, {}, GUEST, guard())).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      scope().invitations.accept(code, { userId: await insertUser() }, asUser, guard()),
    ).rejects.toMatchObject({ status: 410 });
    expect(await players(gameId)).toHaveLength(2);
  });

  it("refuses a signed-in visitor as a guest", async () => {
    const { code } = await newGame();
    await expect(
      scope().invitations.accept(code, { userId: await insertUser() }, GUEST, guard()),
    ).rejects.toMatchObject({ status: 409, code: "GUEST_NOT_ALLOWED" });
  });

  it("enforces BR-13 for a browser whose token holds a game in progress (Q7)", async () => {
    const first = await newGame();
    const { guestToken } = await scope().invitations.accept(first.code, {}, GUEST, guard());
    const viewer = { guestTokenHash: hashOpaqueToken(guestToken!) };
    const second = await newGame();

    await expect(scope().invitations.accept(second.code, viewer, GUEST, guard())).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
      data: { gameId: first.gameId },
    });
    expect(await scope().invitations.preview(second.code, viewer, guard())).toMatchObject({
      state: "has-active-game",
      gameId: first.gameId,
    });
    expect(await status(second.gameId)).toBe("waiting");

    // Once the first game is over the same browser may join again, with a fresh token.
    await run(`update games set status = 'finished', finished_at = now() where id = ?`, [first.gameId]);
    await run(`update game_players set is_active = false where game_id = ?`, [first.gameId]);
    const again = await scope().invitations.accept(second.code, viewer, GUEST, guard());
    expect(again.gameId).toBe(second.gameId);
    expect(again.guestToken).not.toBe(guestToken);
  });

  it("closes a held game nobody opened for 15 minutes, so a dead game does not block the guest (Q21)", async () => {
    const first = await newGame();
    const { guestToken } = await scope().invitations.accept(first.code, {}, GUEST, guard());
    await run(`update game_players set seen_at = null where game_id = ? and seat = 1`, [first.gameId]);
    await run(`update games set started_at = now() - interval '16 minutes' where id = ?`, [first.gameId]);
    const second = await newGame();

    const joined = await scope().invitations.accept(
      second.code,
      { guestTokenHash: hashOpaqueToken(guestToken!) },
      GUEST,
      guard(),
    );

    expect(joined.gameId).toBe(second.gameId);
    expect(await status(first.gameId)).toBe("cancelled");
  });

  it("lets exactly one of many parallel guests win", async () => {
    const { code, gameId } = await newGame();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () => scope().invitations.accept(code, {}, GUEST, guard())),
    );

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") expect(outcome.reason).toMatchObject({ status: 410 });
    }
    expect(await players(gameId)).toHaveLength(2);
  });
});

describe("GameService.findParticipant for guests", () => {
  it("honours the token while the game runs and for one hour after it finished", async () => {
    const { code, gameId } = await newGame();
    const { guestToken } = await scope().invitations.accept(code, {}, GUEST, guard());
    const identity = { guestTokenHash: hashOpaqueToken(guestToken!) };
    const { games } = scope();

    expect(await games.findParticipant(identity, gameId)).not.toBeNull();
    expect(await games.findParticipant({ guestTokenHash: "0".repeat(64) }, gameId)).toBeNull();
    expect(await games.findParticipant(identity, "00000000-0000-4000-8000-000000000000")).toBeNull();

    await run(`update games set status = 'finished', finished_at = now() - interval '59 minutes' where id = ?`, [gameId]);
    expect(await games.findParticipant(identity, gameId)).not.toBeNull();
    await run(`update games set finished_at = now() - interval '61 minutes' where id = ?`, [gameId]);
    expect(await games.findParticipant(identity, gameId)).toBeNull();
  });

  it("rejects a token cleared by the cleanup (NULL hash) and a token of another game", async () => {
    const one = await newGame();
    const two = await newGame();
    const { guestToken } = await scope().invitations.accept(one.code, {}, GUEST, guard());
    await scope().invitations.accept(two.code, {}, GUEST, guard());
    const identity = { guestTokenHash: hashOpaqueToken(guestToken!) };

    expect(await scope().games.findParticipant(identity, two.gameId)).toBeNull();
    await run(`update game_players set guest_token_hash = null where game_id = ? and seat = 2`, [one.gameId]);
    expect(await scope().games.findParticipant(identity, one.gameId)).toBeNull();
  });
});

describe("unique violations from raw SQL", () => {
  it("carry the SQLSTATE and constraint name that InvitationService maps", async () => {
    const { gameId } = await newGame();
    const user = await insertUser();
    const insert = `insert into game_players (game_id, seat, kind, user_id, is_active) values (?, 2, 'account', ?, true)`;
    await run(insert, [gameId, user]);
    const error = await run(insert, [gameId, user]).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "23505", constraint: expect.stringMatching(/^game_players_/) });
  });
});

describe("InvitationService.preview", () => {
  it("shows every state without changing anything", async () => {
    const { creator, code, gameId } = await newGame();
    const viewer = await insertUser();
    const { invitations } = scope();

    expect(await invitations.preview(code, {}, guard())).toMatchObject({ state: "joinable" });
    expect(await invitations.preview(code, { userId: viewer }, guard())).toMatchObject({ state: "joinable" });
    expect(await invitations.preview(code, { userId: creator }, guard())).toEqual({
      creatorName: expect.stringMatching(/^Inv_/),
      state: "own-invitation",
      gameId,
    });
    expect(await status(gameId)).toBe("waiting");

    await scope().invitations.accept(code, { userId: viewer }, asUser, guard());
    expect(await invitations.preview(code, { userId: viewer }, guard())).toMatchObject({
      state: "participant",
      gameId,
    });
    await expect(invitations.preview(code, { userId: await insertUser() }, guard())).rejects.toMatchObject({
      status: 410,
    });
  });

  it("flags a viewer who is busy or has an own waiting game", async () => {
    const busyGame = await newGame();
    const busy = await insertUser();
    await scope().invitations.accept(busyGame.code, { userId: busy }, asUser, guard());
    const mine = await newGame();
    const target = await newGame();
    const { invitations } = scope();

    expect(await invitations.preview(target.code, { userId: busy }, guard())).toMatchObject({
      state: "has-active-game",
      gameId: busyGame.gameId,
    });
    expect(await invitations.preview(target.code, { userId: mine.creator }, guard())).toMatchObject({
      state: "has-own-waiting-game",
      gameId: mine.gameId,
    });
  });
});
