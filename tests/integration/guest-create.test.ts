// `GameService.create` for a visitor without an account on a real PostgreSQL (E02-S08, step 4):
// BR-13 by the browser's token, the advisory lock, the move of the token to the new game, the
// per-address limit, the rollback through `tx` and the guest's "my game" read. The advisory lock,
// the unique token index and the transactions live in the database, so a fake `em` cannot prove them.
import { CREATE_GAME_LIMIT } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { GameParticipation } from "../../packages/app/src/server/services/auth/game-participation";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import {
  GameService,
  type GuestCreator,
} from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { SqlTimeoutSettler } from "../../packages/app/src/server/services/games/timeout-settler";
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

function scope(codes: { generate(): string } = new InvitationCodes()) {
  const em = orm.em.fork();
  return {
    games: new GameService({
      em,
      clock: systemClock,
      rateLimiter: new RateLimiter({ em }),
      invitationCodes: codes as never,
      timeoutSettler: new SqlTimeoutSettler({ em, clock: systemClock }),
      serverConfig: { appOrigin: "https://gomoku.test" } as never,
    }),
    participation: new GameParticipation({ em, clock: systemClock }),
  };
}

const newToken = () => `tok-${Date.now().toString(36)}-${++counter}`;
const limitKey = () => `games-create-guest:test:${Date.now()}:${++counter}`;
const guest = (token: string, extra: Partial<GuestCreator> = {}): GuestCreator => ({
  kind: "guest",
  tokenHash: hashOpaqueToken(token),
  limitKey: limitKey(),
  ...extra,
});
const heldBy = (token: string) =>
  run(
    `select g.id, g.status, p.is_active, p.kind, p.seat, p.nickname from game_players p
     join games g on g.id = p.game_id where p.guest_token_hash = ?`,
    [hashOpaqueToken(token)],
  );
const rowsOf = (gameId: string) =>
  run(`select kind, seat, user_id, guest_token_hash, nickname, is_active from game_players where game_id = ?`, [gameId]);

/** Makes the game of a token an `active` one (somebody joined). */
async function activate(token: string) {
  const [held] = await heldBy(token);
  const gameId = held!.id as string;
  await run(`update invitations set consumed_at = now() where game_id = ?`, [gameId]);
  await run(
    `insert into game_players (game_id, seat, kind, guest_token_hash, is_active, seen_at) values (?, 2, 'guest', ?, true, now())`,
    [gameId, hashOpaqueToken(newToken())],
  );
  await run(`update games set status = 'active', started_at = now(), black_seat = 1 where id = ?`, [gameId]);
  return gameId;
}

describe("GameService.create for a guest", () => {
  it("creates a waiting game with a guest creator holding the token, no account, and the nickname", async () => {
    const token = newToken();
    const { games } = scope();

    const { gameId, invitation } = await games.create(guest(token, { nickname: "Ala" }));

    expect(invitation.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(await rowsOf(gameId)).toEqual([
      { kind: "guest", seat: 1, user_id: null, guest_token_hash: hashOpaqueToken(token), nickname: "Ala", is_active: true },
    ]);
    const [game] = await run(`select origin, status from games where id = ?`, [gameId]);
    expect(game).toEqual({ origin: "invite", status: "waiting" });
    // The token reaches the game, with the creator's invitation visible to them.
    const me = (await games.findParticipant({ guestTokenHash: hashOpaqueToken(token) }, gameId))!;
    const state = await scope().games.getState(me, gameId);
    expect(state).toMatchObject({ status: "waiting", you: { seat: 1, kind: "guest" } });
    expect(state.players[0]).toMatchObject({ kind: "guest", displayName: "Ala" });
    expect(state.invitation?.code).toBe(invitation.code);
  });

  it("names a guest creator without a nickname by the default", async () => {
    const token = newToken();
    const { gameId } = await scope().games.create(guest(token));
    const me = (await scope().games.findParticipant({ guestTokenHash: hashOpaqueToken(token) }, gameId))!;
    expect((await scope().games.getState(me, gameId)).players[0]).toMatchObject({ displayName: "Gracz 1" });
  });

  it("refuses a second game of the browser while the first one waits, naming it (BR-13)", async () => {
    const token = newToken();
    const first = await scope().games.create(guest(token));

    await expect(scope().games.create(guest(token))).rejects.toMatchObject({
      status: 409,
      code: "OWN_WAITING_GAME",
      data: { gameId: first.gameId },
    });
    expect(await heldBy(token)).toHaveLength(1);
  });

  it("cancels the own waiting game and creates a new one in one go, moving the token", async () => {
    const token = newToken();
    const first = await scope().games.create(guest(token, { nickname: "Ala" }));

    const second = await scope().games.create(guest(token, { cancelOwnWaitingGame: true, nickname: "Ola" }));

    expect(second.gameId).not.toBe(first.gameId);
    const [oldGame] = await run(`select status from games where id = ?`, [first.gameId]);
    expect(oldGame).toEqual({ status: "cancelled" });
    expect(await rowsOf(first.gameId)).toEqual([
      { kind: "guest", seat: 1, user_id: null, guest_token_hash: null, nickname: "Ala", is_active: false },
    ]);
    expect(await heldBy(token)).toEqual([
      { id: second.gameId, status: "waiting", is_active: true, kind: "guest", seat: 1, nickname: "Ola" },
    ]);
    // The old invitation is void for good.
    const [voided] = await run(`select consumed_at is not null as v from invitations where game_id = ?`, [first.gameId]);
    expect(voided).toEqual({ v: true });
  });

  it("refuses a browser in a game in progress, even when asked to cancel", async () => {
    const token = newToken();
    await scope().games.create(guest(token));
    const gameId = await activate(token);

    await expect(scope().games.create(guest(token, { cancelOwnWaitingGame: true }))).rejects.toMatchObject({
      status: 409,
      code: "ACTIVE_GAME_EXISTS",
      data: { gameId },
    });
    const [game] = await run(`select status from games where id = ?`, [gameId]);
    expect(game).toEqual({ status: "active" });
  });

  it("frees the slot of an unjoined game whose invitation expired, before BR-13 is checked", async () => {
    const token = newToken();
    const first = await scope().games.create(guest(token));
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [first.gameId]);

    const second = await scope().games.create(guest(token));

    expect(second.gameId).not.toBe(first.gameId);
    const [oldGame] = await run(`select status from games where id = ?`, [first.gameId]);
    expect(oldGame).toEqual({ status: "cancelled" });
    expect(await heldBy(token)).toHaveLength(1);
  });

  it("finishes a game the browser lost on time before BR-13 is checked", async () => {
    const token = newToken();
    await scope().games.create(guest(token));
    const gameId = await activate(token);
    await run(`update games set turn_started_at = now() - interval '1 hour' where id = ?`, [gameId]);

    const next = await scope().games.create(guest(token));

    const [old] = await run(`select status, end_reason from games where id = ?`, [gameId]);
    expect(old).toEqual({ status: "finished", end_reason: "timeout" });
    expect(next.gameId).not.toBe(gameId);
  });

  it("closes a game nobody opened in time (Q21) and then creates", async () => {
    const token = newToken();
    await scope().games.create(guest(token));
    const gameId = await activate(token);
    await run(`update game_players set seen_at = null where game_id = ? and seat = 1`, [gameId]);
    await run(`update games set started_at = now() - interval '1 hour' where id = ?`, [gameId]);

    await scope().games.create(guest(token));

    const [old] = await run(`select status from games where id = ?`, [gameId]);
    expect(old).toEqual({ status: "cancelled" });
  });

  it("lets exactly one of parallel creates with the same cookie through; the others see its game", async () => {
    // The cookie of a browser whose last game ended long ago is still carried.
    const token = newToken();
    await scope().games.create(guest(token));
    const [held] = await heldBy(token);
    await run(`update games set status = 'finished', started_at = now() - interval '3 hours', black_seat = 1,
      winner_seat = 1, end_reason = 'timeout', finished_at = now() - interval '2 hours' where id = ?`, [held!.id]);
    await run(`update game_players set is_active = false where game_id = ?`, [held!.id]);

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => scope().games.create(guest(token))));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results.filter((r) => r.status === "rejected")) {
      expect(result).toMatchObject({ reason: { status: 409, code: "OWN_WAITING_GAME" } });
    }
    expect((await heldBy(token)).filter((r) => r.is_active)).toHaveLength(1);
  });

  it("leaves one active waiting game when parallel creates with the same cookie all ask to cancel the own one", async () => {
    const token = newToken();
    await scope().games.create(guest(token));

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => scope().games.create(guest(token, { cancelOwnWaitingGame: true }))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    const held = await heldBy(token);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ status: "waiting", is_active: true });
  });

  it("gives two games to parallel creates without a cookie (different tokens), as documented", async () => {
    const results = await Promise.all([scope().games.create(guest(newToken())), scope().games.create(guest(newToken()))]);
    expect(new Set(results.map((r) => r.gameId)).size).toBe(2);
  });

  it("rolls everything back when the insert fails: the old game stays waiting and keeps its token", async () => {
    const token = newToken();
    const first = await scope().games.create(guest(token));
    const [{ code }] = (await run(`select code from invitations where game_id = ?`, [first.gameId])) as { code: string }[];

    // The new invitation collides with the existing code: the flush fails after the cancel.
    await expect(
      scope({ generate: () => code }).games.create(guest(token, { cancelOwnWaitingGame: true })),
    ).rejects.toBeTruthy();

    const [game] = await run(`select status from games where id = ?`, [first.gameId]);
    expect(game).toEqual({ status: "waiting" });
    expect(await heldBy(token)).toEqual([
      { id: first.gameId, status: "waiting", is_active: true, kind: "guest", seat: 1, nickname: null },
    ]);
  });

  it("limits the creates per address key, without touching the games table once spent", async () => {
    const key = limitKey();
    for (let i = 0; i < CREATE_GAME_LIMIT; i += 1) {
      await scope().games.create(guest(newToken(), { limitKey: key }));
    }
    const before = await run(`select count(*)::int as n from games`);

    await expect(scope().games.create(guest(newToken(), { limitKey: key }))).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });
    expect(await run(`select count(*)::int as n from games`)).toEqual(before);
  });
});

describe("GameParticipation.currentGameOfGuest", () => {
  it("returns the waiting game of a guest creator, and nothing after it was cancelled", async () => {
    const token = newToken();
    const { gameId } = await scope().games.create(guest(token));
    const { participation, games } = scope();

    expect(await participation.currentGameOfGuest(hashOpaqueToken(token))).toEqual({ gameId, status: "waiting", seat: 1 });
    const me = (await games.findParticipant({ guestTokenHash: hashOpaqueToken(token) }, gameId))!;
    await games.cancel(me, gameId);
    expect(await scope().participation.currentGameOfGuest(hashOpaqueToken(token))).toBeNull();
  });

  it("closes an expired unjoined game instead of reporting it", async () => {
    const token = newToken();
    const { gameId } = await scope().games.create(guest(token));
    await run(`update invitations set expires_at = now() - interval '1 minute' where game_id = ?`, [gameId]);
    expect(await scope().participation.currentGameOfGuest(hashOpaqueToken(token))).toBeNull();
    const [game] = await run(`select status from games where id = ?`, [gameId]);
    expect(game).toEqual({ status: "cancelled" });
  });

  it("is null for an unknown token", async () => {
    expect(await scope().participation.currentGameOfGuest(hashOpaqueToken("nobody"))).toBeNull();
  });
});
