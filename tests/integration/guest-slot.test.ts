// The guest slot on a real PostgreSQL (E02-S08, step 2): the guest token of a creator, the lazy
// expiry of an unjoined game with the one-hour window (L29), the loss on time of a guest browser
// and the cancel by a guest creator. The SQL (`GUEST_TOKEN_VALID_SQL`, the conditional updates)
// is what is under test, so a fake `em` cannot prove it. A guest creator is inserted by hand:
// `GameService.create` for guests is covered by `guest-create.test.ts`.
import { GUEST_TOKEN_GRACE_MS, INVITATION_TTL_MS } from "@gomoku/core";
import { createOrm, type Orm } from "@gomoku/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { hashOpaqueToken } from "../../packages/app/src/server/http/opaque-token";
import { systemClock } from "../../packages/app/src/server/services/email/email-sender";
import { ColorDraw } from "../../packages/app/src/server/services/games/color-draw";
import { GameService } from "../../packages/app/src/server/services/games/game-service";
import { InvitationCodes } from "../../packages/app/src/server/services/games/invitation-codes";
import { InvitationService, type LookupGuard } from "../../packages/app/src/server/services/games/invitation-service";
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

const guard = (): LookupGuard => ({ key: `invitation-lookup:guest-slot:${Date.now()}:${++counter}`, limit: 1000 });

function scope() {
  const em = orm.em.fork();
  const rateLimiter = new RateLimiter({ em });
  const timeoutSettler = new SqlTimeoutSettler({ em, clock: systemClock });
  return {
    timeoutSettler,
    invitations: new InvitationService({ em, clock: systemClock, rateLimiter, timeoutSettler, colorDraw: new ColorDraw() }),
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

/** A waiting game created by a guest browser, the way `GameService.create` will store it. */
async function guestGame() {
  const token = `tok-${Date.now().toString(36)}-${++counter}`;
  const hash = hashOpaqueToken(token);
  const code = new InvitationCodes().generate();
  const [game] = await run(`insert into games (origin, status) values ('invite', 'waiting') returning id`);
  const gameId = game!.id as string;
  const [player] = await run(
    `insert into game_players (game_id, seat, kind, guest_token_hash, is_active) values (?, 1, 'guest', ?, true) returning id`,
    [gameId, hash],
  );
  await run(`insert into invitations (game_id, code, expires_at) values (?, ?, now() + ?::interval)`, [
    gameId,
    code,
    `${INVITATION_TTL_MS / 1000} seconds`,
  ]);
  return { gameId, hash, code, playerId: player!.id as string };
}

/** Moves the invitation expiry `minutes` into the past (negative: into the future). */
const expireAgo = (gameId: string, minutes: number) =>
  run(`update invitations set expires_at = now() - ?::interval where game_id = ?`, [`${minutes} minutes`, gameId]);

const row = async (gameId: string) =>
  (
    await run(
      `select g.status, p.is_active, i.consumed_at is not null as voided
       from games g join game_players p on p.game_id = g.id and p.seat = 1
       join invitations i on i.game_id = g.id where g.id = ?`,
      [gameId],
    )
  )[0]!;

describe("guest token of a creator (GUEST_TOKEN_VALID_SQL, L29)", () => {
  const find = (hash: string, gameId: string) => scope().games.findParticipant({ guestTokenHash: hash }, gameId);

  it("is valid while the game waits with an open invitation", async () => {
    const { gameId, hash, playerId } = await guestGame();
    expect(await find(hash, gameId)).toEqual({ playerId });
    expect(await find(hashOpaqueToken("other"), gameId)).toBeNull();
  });

  it("stays valid for an hour after the invitation expired, in both the waiting and the cancelled row", async () => {
    const { gameId, hash, playerId } = await guestGame();
    await expireAgo(gameId, 59);
    expect(await find(hash, gameId)).toEqual({ playerId });
    await run(`update games set status = 'cancelled' where id = ?`, [gameId]);
    expect(await find(hash, gameId)).toEqual({ playerId });
    await expireAgo(gameId, 61);
    expect(await find(hash, gameId)).toBeNull();
    await run(`update games set status = 'waiting' where id = ?`, [gameId]);
    expect(await find(hash, gameId)).toBeNull();
  });

  it("is void once the creator cancelled (invitation consumed) or a joined game was closed unplayed", async () => {
    const cancelled = await guestGame();
    await scope().games.cancel({ playerId: cancelled.playerId }, cancelled.gameId);
    expect(await find(cancelled.hash, cancelled.gameId)).toBeNull();

    const notOpened = await guestGame();
    await run(`update invitations set consumed_at = now() where game_id = ?`, [notOpened.gameId]);
    await run(`update games set status = 'cancelled' where id = ?`, [notOpened.gameId]);
    expect(await find(notOpened.hash, notOpened.gameId)).toBeNull();
  });

  it("keeps the old rules for a played game: active, and finished for one hour", async () => {
    const { gameId, hash, playerId } = await guestGame();
    await run(`update invitations set consumed_at = now() where game_id = ?`, [gameId]);
    await run(`update games set status = 'active', started_at = now(), black_seat = 1 where id = ?`, [gameId]);
    expect(await find(hash, gameId)).toEqual({ playerId });
    const endedAt = new Date(Date.now() - GUEST_TOKEN_GRACE_MS + 60_000);
    await run(`update games set status = 'finished', winner_seat = 1, end_reason = 'timeout', finished_at = ? where id = ?`, [endedAt, gameId]);
    expect(await find(hash, gameId)).toEqual({ playerId });
    await run(`update games set finished_at = ? where id = ?`, [new Date(Date.now() - GUEST_TOKEN_GRACE_MS - 60_000), gameId]);
    expect(await find(hash, gameId)).toBeNull();
  });
});

describe("lazy expiry of an unjoined guest game", () => {
  it("cancels it and frees the slot on read, leaving the invitation (and the one-hour window) alone", async () => {
    const { gameId, hash, playerId } = await guestGame();
    await expireAgo(gameId, 5);

    const { games } = scope();
    const state = await games.getState({ playerId }, gameId);

    expect(state.status).toBe("cancelled");
    expect(state.closedReason).toBe("expired");
    expect(await row(gameId)).toEqual({ status: "cancelled", is_active: false, voided: false });
    expect(await games.findParticipant({ guestTokenHash: hash }, gameId)).toEqual({ playerId });
  });

  it("frees the slot of a guest browser on preview and accept of another invitation (BR-13)", async () => {
    const mine = await guestGame();
    await expireAgo(mine.gameId, 5);
    const other = await guestGame();

    const preview = await scope().invitations.preview(other.code, { guestTokenHash: mine.hash }, guard());
    expect(preview.state).toBe("joinable");
    expect((await row(mine.gameId)).status).toBe("cancelled");
    expect((await row(mine.gameId)).is_active).toBe(false);

    const again = await guestGame();
    await expireAgo(again.gameId, 5);
    const joined = await scope().invitations.accept(
      other.code,
      { guestTokenHash: again.hash },
      { as: "guest", acknowledgedGuestWarning: true },
      guard(),
    );
    expect(joined.gameId).toBe(other.gameId);
    expect((await row(again.gameId)).status).toBe("cancelled");
  });

  it("does not touch a game whose invitation is still open", async () => {
    const { gameId, hash, code } = await guestGame();
    const preview = await scope().invitations.preview(code, { guestTokenHash: hash }, guard());
    expect(preview).toMatchObject({ state: "own-invitation", gameId });
    expect((await row(gameId)).status).toBe("waiting");
  });

  it("detects the own invitation by token (OWN_INVITATION) while it is open, and answers 410 once expired", async () => {
    const { gameId, hash, code } = await guestGame();
    await expect(
      scope().invitations.accept(code, { guestTokenHash: hash }, { as: "guest", acknowledgedGuestWarning: true }, guard()),
    ).rejects.toMatchObject({ status: 409, code: "OWN_INVITATION", data: { gameId } });
    await expireAgo(gameId, 5);
    await expect(
      scope().invitations.accept(code, { guestTokenHash: hash }, { as: "guest", acknowledgedGuestWarning: true }, guard()),
    ).rejects.toMatchObject({ status: 410 });
  });
});

describe("SqlTimeoutSettler.settleForGuest", () => {
  it("finishes a running game of the browser that ran out of time and frees its slot", async () => {
    const { gameId, hash } = await guestGame();
    await run(`update invitations set consumed_at = now() where game_id = ?`, [gameId]);
    await run(`update games set status = 'active', started_at = now() - interval '1 hour', black_seat = 1,
      turn_started_at = now() - interval '1 hour' where id = ?`, [gameId]);

    await scope().timeoutSettler.settleForGuest(hash);

    const [game] = await run(`select status, winner_seat, end_reason from games where id = ?`, [gameId]);
    expect(game).toEqual({ status: "finished", winner_seat: 2, end_reason: "timeout" });
    expect((await row(gameId)).is_active).toBe(false);
  });

  it("leaves a game with time left, and a browser without games, alone", async () => {
    const { gameId, hash } = await guestGame();
    await run(`update games set status = 'active', started_at = now(), black_seat = 1, turn_started_at = now() where id = ?`, [gameId]);
    await scope().timeoutSettler.settleForGuest(hash);
    await scope().timeoutSettler.settleForGuest(hashOpaqueToken("nobody"));
    expect((await row(gameId)).status).toBe("active");
  });
});

describe("GameService.cancel by a participant", () => {
  it("lets a guest creator cancel a waiting game, voiding the invitation and freeing the slot", async () => {
    const { gameId, playerId } = await guestGame();
    await scope().games.cancel({ playerId }, gameId);
    expect(await row(gameId)).toEqual({ status: "cancelled", is_active: false, voided: true });
    await expect(scope().games.cancel({ playerId }, gameId)).rejects.toMatchObject({ status: 409, code: "GAME_NOT_CANCELLABLE" });
  });

  it("answers 404 for the joiner and for a participant of another game", async () => {
    const mine = await guestGame();
    const theirs = await guestGame();
    const [joiner] = await run(
      `insert into game_players (game_id, seat, kind, guest_token_hash, is_active) values (?, 2, 'guest', ?, true) returning id`,
      [mine.gameId, hashOpaqueToken("joiner")],
    );
    await expect(scope().games.cancel({ playerId: joiner!.id as string }, mine.gameId)).rejects.toMatchObject({ status: 404 });
    await expect(scope().games.cancel({ playerId: theirs.playerId }, mine.gameId)).rejects.toMatchObject({ status: 404 });
    expect((await row(mine.gameId)).status).toBe("waiting");
  });

  it("lets exactly one of a concurrent accept and cancel win", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { gameId, code, playerId } = await guestGame();
      const results = await Promise.allSettled([
        scope().games.cancel({ playerId }, gameId),
        scope().invitations.accept(code, {}, { as: "guest", acknowledgedGuestWarning: true }, guard()),
      ]);
      const [cancel, accept] = results;
      expect([cancel!.status, accept!.status].filter((s) => s === "fulfilled")).toHaveLength(1);
      const { status } = await row(gameId);
      expect(status).toBe(cancel!.status === "fulfilled" ? "cancelled" : "active");
    }
  });
});
