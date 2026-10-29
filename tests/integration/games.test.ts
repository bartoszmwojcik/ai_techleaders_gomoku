// Games on a real PostgreSQL (E02 phase 1): `GameService.create/cancel/getState` and the real
// `GameParticipation` against the Testcontainers database. The BR-13 partial unique index, the
// conditional updates and the lazy closing of stale games (#21 Q16, Q17, Q21) live in SQL, so a
// fake `em` cannot prove them. Services are built like `withRequestScope` builds them.
import { TooManyRequestsError, READY_DEADLINE_MS } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { GameParticipation } from "../../packages/app/src/server/services/auth/game-participation";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
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
    [`games-${n}@example.com`, `Gm_${n}`, `gm_${n}`, "x".repeat(60)],
  );
  return row!.id as string;
}

/** A request scope: its own fork, so nothing is shared through the identity map. */
function scope() {
  const em = orm.em.fork();
  const gameService = new GameService({
    em,
    clock: systemClock,
    rateLimiter: new RateLimiter({ em }),
    invitationCodes: new InvitationCodes(),
    timeoutSettler: new NoopTimeoutSettler(),
    serverConfig: { appOrigin: "https://gomoku.test" } as never,
  });
  return { gameService, participation: new GameParticipation({ em, clock: systemClock }) };
}

async function playerOf(gameId: string, userId: string): Promise<string> {
  const [row] = await run(`select id from game_players where game_id = ? and user_id = ?`, [gameId, userId]);
  return row!.id as string;
}

/** The opponent joins the way #21 step 4 will: seat 2, game becomes active. */
async function join(gameId: string, opponent: string, options: { startedAt?: Date } = {}) {
  await run(
    `insert into game_players (game_id, seat, kind, user_id, is_active, seen_at) values (?, 2, 'account', ?, true, now())`,
    [gameId, opponent],
  );
  await run(`update games set status = 'active', started_at = ?, black_seat = 1 where id = ?`, [options.startedAt ?? new Date(), gameId]);
}

const status = async (gameId: string) =>
  (await run(`select status from games where id = ?`, [gameId]))[0]!.status;

describe("GameService.create", () => {
  it("creates a waiting game with the creator seated and an invitation", async () => {
    const user = await insertUser();
    const { gameService } = scope();

    const { gameId, invitation } = await gameService.create(user);

    expect(invitation.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(invitation.url).toBe(`https://gomoku.test/invite/${invitation.code}`);
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    const [game] = await run(`select origin, status, started_at from games where id = ?`, [gameId]);
    expect(game).toEqual({ origin: "invite", status: "waiting", started_at: null });
    const [player] = await run(
      `select seat, kind, is_active, seen_at from game_players where game_id = ? and user_id = ?`,
      [gameId, user],
    );
    expect(player).toEqual({ seat: 1, kind: "account", is_active: true, seen_at: null });
    const [stored] = await run(`select code, expires_at from invitations where game_id = ?`, [gameId]);
    expect(stored!.code).toBe(invitation.code.replace("-", ""));
  });

  it("refuses a second game while the first one is waiting (BR-13)", async () => {
    const user = await insertUser();
    await scope().gameService.create(user);

    await expect(scope().gameService.create(user)).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
    });
    expect(await run(`select 1 from game_players where user_id = ?`, [user])).toHaveLength(1);
  });

  it("lets exactly one of parallel creates through", async () => {
    const user = await insertUser();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => scope().gameService.create(user)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results.filter((r) => r.status === "rejected")) {
      expect(result).toMatchObject({ reason: { code: "ACTIVE_GAME_EXISTS" } });
    }
    expect(await run(`select 1 from game_players where user_id = ?`, [user])).toHaveLength(1);
  });

  it("closes an expired waiting game before inserting the new one (Q16)", async () => {
    const user = await insertUser();
    const first = await scope().gameService.create(user);
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [first.gameId]);

    const second = await scope().gameService.create(user);

    expect(second.gameId).not.toBe(first.gameId);
    expect(await status(first.gameId)).toBe("cancelled");
    const [old] = await run(`select is_active from game_players where game_id = ?`, [first.gameId]);
    expect(old).toEqual({ is_active: false });
  });

  it("closes an active game nobody opened within 15 minutes before the BR-13 check (Q21)", async () => {
    const user = await insertUser();
    const opponent = await insertUser();
    const first = await scope().gameService.create(user);
    await join(first.gameId, opponent, { startedAt: new Date(Date.now() - READY_DEADLINE_MS - 60_000) });

    const second = await scope().gameService.create(user);

    expect(await status(first.gameId)).toBe("cancelled");
    expect(await status(second.gameId)).toBe("waiting");
    // The opponent's slot is free as well.
    expect(await scope().participation.occupiesSlot(opponent)).toBe(false);
  });

  it("keeps an active game that everybody opened, even a long one", async () => {
    const user = await insertUser();
    const first = await scope().gameService.create(user);
    await join(first.gameId, await insertUser(), { startedAt: new Date(Date.now() - 2 * READY_DEADLINE_MS) });
    await run(`update game_players set seen_at = now() where game_id = ?`, [first.gameId]);

    await expect(scope().gameService.create(user)).rejects.toMatchObject({ code: "ACTIVE_GAME_EXISTS" });
    expect(await status(first.gameId)).toBe("active");
  });

  it("limits creation to 10 games per hour (Q13)", async () => {
    const user = await insertUser();
    for (let i = 0; i < 10; i += 1) {
      const { gameId } = await scope().gameService.create(user);
      await scope().gameService.cancel(user, gameId);
    }
    await expect(scope().gameService.create(user)).rejects.toBeInstanceOf(TooManyRequestsError);
  });
});

describe("GameService.cancel", () => {
  it("cancels a waiting game, frees the slot and the user can start again", async () => {
    const user = await insertUser();
    const { gameId } = await scope().gameService.create(user);

    await scope().gameService.cancel(user, gameId);

    expect(await status(gameId)).toBe("cancelled");
    expect(await scope().participation.occupiesSlot(user)).toBe(false);
    await expect(scope().gameService.create(user)).resolves.toBeTruthy();
  });

  it("answers 409 on a repeated cancel and for an active game, 404 for a stranger", async () => {
    const user = await insertUser();
    const { gameId } = await scope().gameService.create(user);

    await expect(scope().gameService.cancel(await insertUser(), gameId)).rejects.toMatchObject({ status: 404 });
    await expect(scope().gameService.cancel(user, crypto.randomUUID())).rejects.toMatchObject({ status: 404 });

    await join(gameId, await insertUser());
    await expect(scope().gameService.cancel(user, gameId)).rejects.toMatchObject({
      status: 409,
      code: "GAME_NOT_CANCELLABLE",
    });
    expect(await status(gameId)).toBe("active");
    expect(await scope().participation.hasActiveGame(user)).toBe(true);
  });
});

describe("GameService.getState", () => {
  it("sets seen_at once and shows the invitation only to the creator", async () => {
    const user = await insertUser();
    const opponent = await insertUser();
    const { gameId, invitation } = await scope().gameService.create(user);
    const creatorPlayer = await playerOf(gameId, user);

    const first = await scope().gameService.getState({ playerId: creatorPlayer }, gameId);
    expect(first).toMatchObject({
      status: "waiting",
      you: { seat: 1, kind: "account" },
      players: [{ seat: 1, kind: "account", seen: true }],
      invitation: { code: invitation.code, url: invitation.url },
    });
    const [seen] = await run(`select seen_at from game_players where id = ?`, [creatorPlayer]);
    await scope().gameService.getState({ playerId: creatorPlayer }, gameId);
    const [again] = await run(`select seen_at from game_players where id = ?`, [creatorPlayer]);
    expect(again).toEqual(seen);

    await join(gameId, opponent);
    const asOpponent = await scope().gameService.getState({ playerId: await playerOf(gameId, opponent) }, gameId);
    expect(asOpponent.status).toBe("active");
    expect(asOpponent.invitation).toBeUndefined();
    expect(asOpponent.players.map((p) => p.seat)).toEqual([1, 2]);
    expect(asOpponent.players[0]!.displayName).toMatch(/^Gm_/);
  });

  it("answers 404 to somebody else's game", async () => {
    const { gameId } = await scope().gameService.create(await insertUser());
    const other = await scope().gameService.create(await insertUser());
    const otherPlayer = await run(`select id from game_players where game_id = ?`, [other.gameId]);
    await expect(
      scope().gameService.getState({ playerId: otherPlayer[0]!.id as string }, gameId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("reports an expired waiting game as cancelled and frees the slot (Q16)", async () => {
    const user = await insertUser();
    const { gameId } = await scope().gameService.create(user);
    await run(`update invitations set expires_at = now() - interval '1 second' where game_id = ?`, [gameId]);

    const state = await scope().gameService.getState({ playerId: await playerOf(gameId, user) }, gameId);

    expect(state.status).toBe("cancelled");
    expect(state.invitation).toBeUndefined();
    expect(await scope().participation.occupiesSlot(user)).toBe(false);
  });

  it("cancels a game nobody opened in 15 minutes instead of setting seen_at (Q21)", async () => {
    const user = await insertUser();
    const opponent = await insertUser();
    const { gameId } = await scope().gameService.create(user);
    await join(gameId, opponent, { startedAt: new Date(Date.now() - READY_DEADLINE_MS - 1_000) });

    const state = await scope().gameService.getState({ playerId: await playerOf(gameId, opponent) }, gameId);

    expect(state.status).toBe("cancelled");
    const [creatorRow] = await run(`select seen_at, is_active from game_players where game_id = ? and seat = 1`, [gameId]);
    expect(creatorRow).toEqual({ seen_at: null, is_active: false });
  });
});

describe("GameParticipation on PostgreSQL", () => {
  it("tells a game in progress from a waiting one and honours the G5 moment", async () => {
    const user = await insertUser();
    const opponent = await insertUser();
    const { gameId } = await scope().gameService.create(user);

    // Waiting: holds a slot, but no game is in progress.
    expect(await scope().participation.occupiesSlot(user)).toBe(true);
    expect(await scope().participation.hasActiveGame(user)).toBe(false);

    const startedAt = new Date(Date.now() - 60_000);
    await join(gameId, opponent, { startedAt });
    for (const who of [user, opponent]) {
      expect(await scope().participation.hasActiveGame(who)).toBe(true);
      expect(await scope().participation.occupiesSlot(who)).toBe(true);
    }
    // G5: a session that expired before the game started does not count the game.
    expect(
      await scope().participation.hasActiveGame(user, { startedBefore: new Date(startedAt.getTime() - 1) }),
    ).toBe(false);
    expect(await scope().participation.hasActiveGame(user, { startedBefore: new Date() })).toBe(true);

    // Finished: both slots are released (is_active = false by the finishing transaction).
    await run(`update games set status = 'finished', end_reason = 'draw', finished_at = now() where id = ?`, [gameId]);
    await run(`update game_players set is_active = false where game_id = ?`, [gameId]);
    for (const who of [user, opponent]) {
      expect(await scope().participation.hasActiveGame(who)).toBe(false);
      expect(await scope().participation.occupiesSlot(who)).toBe(false);
    }
  });

  it("is false for a user without any game", async () => {
    const user = await insertUser();
    expect(await scope().participation.hasActiveGame(user)).toBe(false);
    expect(await scope().participation.occupiesSlot(user)).toBe(false);
  });
});
