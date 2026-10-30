import {
  REMATCH_OFFER_LIMIT,
  REMATCH_OFFER_WINDOW_MS,
  GUEST_TOKEN_GRACE_MS,
  REMATCH_TTL_MS,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";
import { describe, expect, it, vi } from "vitest";

import { deriveRematchToken, hashOpaqueToken } from "../../http/opaque-token";
import { ACTIVE_SLOT_CONSTRAINT } from "./game-service";
import { RematchService } from "./rematch-service";

const NOW = new Date("2026-10-30T12:00:00Z");

type Row = Record<string, unknown>;
const account = (seat: 1 | 2, userId: string | null = `user-${seat}`): Row => ({
  id: `p${seat}`, seat, kind: "account", user_id: userId, guest_token_hash: null, nickname: null,
});
const guest = (seat: 1 | 2, hash: string | null = `hash-${seat}`, nickname: string | null = null): Row => ({
  id: `p${seat}`, seat, kind: "guest", user_id: null, guest_token_hash: hash, nickname,
});
const finished = (extra: Row = {}): Row => ({
  status: "finished", black_seat: 1, rematch_state: null, rematch_offered_by_seat: null,
  rematch_game_id: null, expired: false, token_fresh: true, ...extra,
});
const pending = (extra: Row = {}) => finished({ rematch_state: "pending", rematch_offered_by_seat: 1, ...extra });

/** Answers each statement by the first matching marker; unmatched statements return no rows. */
function setup(options: {
  players?: Row[];
  game?: Row;
  /** Rows by marker, replacing the defaults. */
  rows?: Record<string, Row[]>;
  failOn?: { marker: string; error: unknown };
} = {}) {
  const log: { sql: string; params: unknown[]; mode?: string }[] = [];
  const answers: Record<string, Row[]> = {
    "from game_players where game_id": options.players ?? [account(1), account(2)],
    "coalesce(rematch_expires_at": [options.game ?? finished()],
    "insert into games": [{ id: "game-2" }],
    "set rematch_state = 'pending'": [{ id: "game-1" }],
    "set rematch_state = 'declined'": [{ id: "game-1" }],
    ...options.rows,
  };
  const em = {
    transactional: vi.fn(async (fn: (tx: unknown) => unknown) => fn(em)),
    execute: vi.fn(async (sql: string, params: unknown[] = [], mode?: string) => {
      log.push({ sql: sql.replace(/\s+/g, " ").trim(), params, mode });
      if (options.failOn && sql.includes(options.failOn.marker)) throw options.failOn.error;
      const marker = Object.keys(answers).find((key) => sql.includes(key));
      return marker ? answers[marker]! : [];
    }),
  };
  const rateLimiter = {
    hit: vi.fn(async () => ({ count: 1, retryAfterSeconds: 1 })),
    release: vi.fn(async () => undefined),
  };
  const timeoutSettler = { settleFor: vi.fn(async () => undefined), settleGame: vi.fn(), settleExpired: vi.fn() };
  const service = new RematchService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    rateLimiter: rateLimiter as never,
    timeoutSettler,
  });
  const ran = (marker: string) => log.filter(({ sql }) => sql.includes(marker));
  return { service, em, log, rateLimiter, timeoutSettler, ran };
}

const me = (playerId: string) => ({ playerId });

describe("RematchService.offer", () => {
  it("offers on the finished game: hits the limit of the player, then one conditional update", async () => {
    const { service, rateLimiter, ran } = setup();

    const view = await service.offer(me("p2"), "game-1");

    const expiresAt = new Date(NOW.getTime() + REMATCH_TTL_MS);
    expect(view).toEqual({ state: "pending", offeredBySeat: 2, expiresAt, gameId: null });
    expect(rateLimiter.hit).toHaveBeenCalledWith(
      `rematch-offer:${hashOpaqueToken("user-2")}`, REMATCH_OFFER_LIMIT, REMATCH_OFFER_WINDOW_MS,
    );
    expect(ran("set rematch_state = 'pending'")[0]!.params).toEqual([2, expiresAt, "game-1", NOW]);
  });

  it("keys a guest's limit by the player, not by the (absent) account", async () => {
    const { service, rateLimiter } = setup({ players: [guest(1), account(2)] });
    await service.offer(me("p1"), "game-1");
    expect(rateLimiter.hit).toHaveBeenCalledWith(`rematch-offer:${hashOpaqueToken("p1")}`, expect.anything(), expect.anything());
  });

  it("answers 404 to a stranger before anything else", async () => {
    const { service, rateLimiter } = setup();
    await expect(service.offer(me("stranger"), "game-1")).rejects.toMatchObject({ status: 404 });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("refuses a game that is not finished, without spending the limit", async () => {
    const { service, rateLimiter } = setup({ game: finished({ status: "active" }) });
    await expect(service.offer(me("p1"), "game-1")).rejects.toMatchObject({ status: 409, code: "GAME_NOT_FINISHED" });
    expect(rateLimiter.hit).not.toHaveBeenCalled();
  });

  it("refuses a second offer while one is open or accepted", async () => {
    const { service } = setup({ rows: { "set rematch_state = 'pending'": [] } });
    await expect(service.offer(me("p1"), "game-1")).rejects.toMatchObject({ status: 409, code: "REMATCH_ALREADY_OFFERED" });
  });

  it("gives the attempt back when the offer is refused, and survives a failing release", async () => {
    const { service, rateLimiter } = setup({ rows: { "set rematch_state = 'pending'": [] } });
    await expect(service.offer(me("p1"), "game-1")).rejects.toMatchObject({ code: "REMATCH_ALREADY_OFFERED" });
    expect(rateLimiter.release).toHaveBeenCalledWith(`rematch-offer:${hashOpaqueToken("user-1")}`, REMATCH_OFFER_WINDOW_MS);

    rateLimiter.release.mockRejectedValue(new Error("db down"));
    await expect(service.offer(me("p1"), "game-1")).rejects.toMatchObject({ code: "REMATCH_ALREADY_OFFERED" });
  });

  it("keeps the attempt after a successful offer", async () => {
    const { service, rateLimiter } = setup();
    await service.offer(me("p1"), "game-1");
    expect(rateLimiter.release).not.toHaveBeenCalled();
  });

  it("does not offer when the rate limit is spent", async () => {
    const { service, rateLimiter, ran } = setup();
    rateLimiter.hit.mockRejectedValue(Object.assign(new Error("slow down"), { status: 429 }));
    await expect(service.offer(me("p1"), "game-1")).rejects.toMatchObject({ status: 429 });
    expect(ran("set rematch_state = 'pending'")).toHaveLength(0);
  });
});

describe("RematchService.decline", () => {
  it("declines in one conditional update", async () => {
    const { service, ran } = setup();
    await service.decline(me("p1"), "game-1");
    expect(ran("set rematch_state = 'declined'")[0]!.params).toEqual(["game-1", NOW]);
  });

  it("answers 404 to a stranger", async () => {
    const { service } = setup();
    await expect(service.decline(me("stranger"), "game-1")).rejects.toMatchObject({ status: 404 });
  });

  it("is idempotent for an offer that is already declined", async () => {
    const { service } = setup({ rows: { "set rematch_state = 'declined'": [] }, game: finished({ rematch_state: "declined" }) });
    await expect(service.decline(me("p1"), "game-1")).resolves.toBeUndefined();
  });

  it("says expired for a pending offer that ran out, and not offered otherwise", async () => {
    const out = setup({ rows: { "set rematch_state = 'declined'": [] }, game: pending({ expired: true }) });
    await expect(out.service.decline(me("p1"), "game-1")).rejects.toMatchObject({ status: 409, code: "REMATCH_EXPIRED" });
    for (const state of [null, "accepted"]) {
      const none = setup({ rows: { "set rematch_state = 'declined'": [] }, game: finished({ rematch_state: state }) });
      await expect(none.service.decline(me("p1"), "game-1")).rejects.toMatchObject({ status: 409, code: "REMATCH_NOT_OFFERED" });
    }
  });
});

describe("RematchService.accept", () => {
  it("creates the game in one transaction: users, then the game, BR-13, rows, mark", async () => {
    const { service, em, log, timeoutSettler, ran } = setup({ game: pending({ black_seat: 1 }) });

    const result = await service.accept(me("p2"), "game-1");

    expect(result).toEqual({ gameId: "game-2" });
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(timeoutSettler.settleFor.mock.calls).toEqual([["user-2"], ["user-1"]]);
    expect(ran("from users")[0]!.params).toEqual(["user-1", "user-2"]);
    const order = (marker: string) => log.findIndex(({ sql }) => sql.includes(marker));
    expect(order("from users")).toBeLessThan(order("from games where id = ? for update"));
    expect(order("from games where id = ? for update")).toBeLessThan(order("insert into games"));
    expect(order("select game_id, user_id from game_players")).toBeLessThan(order("insert into games"));
    // The colours are swapped: seat 1 played black, so seat 2 does now.
    expect(ran("insert into games")[0]!.params).toEqual([NOW, NOW, 2]);
    const inserted = ran("insert into game_players");
    expect(inserted.map(({ params }) => params)).toEqual([
      ["game-2", 1, "account", "user-1", null, null, NOW],
      ["game-2", 2, "account", "user-2", null, null, NOW],
    ]);
    expect(ran("rematch_state = 'accepted'")[0]!.params).toEqual(["game-2", "game-1"]);
    expect(ran("with expired")).toHaveLength(2);
  });

  it("answers 404 to a stranger without touching the game", async () => {
    const { service, em } = setup();
    await expect(service.accept(me("stranger"), "game-1")).rejects.toMatchObject({ status: 404 });
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it("seats a guest with a token derived from theirs, copies the nickname, leaves the other guest to claim", async () => {
    const { service, ran } = setup({
      players: [guest(1, "hash-1", "Kasia"), guest(2, "hash-2", "Olek")],
      game: pending({ black_seat: 2 }),
    });

    const result = await service.accept(me("p2"), "game-1", "old-token");

    const token = deriveRematchToken("old-token", "game-2");
    expect(result).toEqual({ gameId: "game-2", guestToken: token });
    expect(ran("insert into game_players").map(({ params }) => params)).toEqual([
      ["game-2", 1, "guest", null, null, "Kasia", NOW],
      ["game-2", 2, "guest", null, hashOpaqueToken(token), "Olek", NOW],
    ]);
    expect(ran("insert into games")[0]!.params[2]).toBe(1);
    // No accounts: nothing to lock or check for BR-13.
    expect(ran("from users")).toHaveLength(0);
    expect(ran("select game_id, user_id")).toHaveLength(0);
  });

  it("refuses a guest who does not present a token", async () => {
    const { service } = setup({ players: [account(1), guest(2)], game: pending() });
    await expect(service.accept(me("p2"), "game-1")).rejects.toMatchObject({ status: 404 });
  });

  it("returns the same game to a repeated accept of the acceptor (and the guest the same token)", async () => {
    const accepted = finished({ rematch_state: "accepted", rematch_offered_by_seat: 1, rematch_game_id: "game-2" });
    const asAccount = setup({ game: accepted });
    expect(await asAccount.service.accept(me("p2"), "game-1")).toEqual({ gameId: "game-2" });
    expect(asAccount.ran("insert into games")).toHaveLength(0);

    const asGuest = setup({ players: [account(1), guest(2)], game: accepted });
    expect(await asGuest.service.accept(me("p2"), "game-1", "old")).toEqual({
      gameId: "game-2", guestToken: deriveRematchToken("old", "game-2"),
    });
  });

  it.each([
    ["no offer", finished(), "REMATCH_NOT_OFFERED"],
    ["a declined offer", finished({ rematch_state: "declined" }), "REMATCH_NOT_OFFERED"],
    ["an accepted offer whose game was cleaned up", finished({ rematch_state: "accepted", rematch_offered_by_seat: 1 }), "REMATCH_NOT_OFFERED"],
    ["the caller's own offer", pending({ rematch_offered_by_seat: 2 }), "REMATCH_NOT_OFFERED"],
    ["an accepted offer, asked by the proposer", finished({ rematch_state: "accepted", rematch_offered_by_seat: 2, rematch_game_id: "game-2" }), "REMATCH_NOT_OFFERED"],
    ["an expired offer", pending({ expired: true }), "REMATCH_EXPIRED"],
    ["a game that is not finished", pending({ status: "active" }), "GAME_NOT_FINISHED"],
  ])("refuses %s", async (_name, game, code) => {
    const { service, ran } = setup({ game });
    await expect(service.accept(me("p2"), "game-1")).rejects.toMatchObject({ status: 409, code });
    expect(ran("insert into games")).toHaveLength(0);
  });

  it.each([
    ["a deleted account", [account(1, null), account(2)], pending(), "token"],
    ["a guest whose token was cleared", [guest(1, null), account(2)], pending(), "token"],
    ["a guest whose token expired", [guest(1), account(2)], pending({ token_fresh: false }), "token"],
  ])("refuses when the other player is gone: %s", async (_name, players, game, token) => {
    const { service, ran } = setup({ players, game });
    await expect(service.accept(me("p2"), "game-1", token)).rejects.toMatchObject({ status: 409, code: "REMATCH_UNAVAILABLE" });
    expect(ran("insert into games")).toHaveLength(0);
  });

  it("judges the guest token with a margin of one offer window before it dies", async () => {
    const { service, ran } = setup({ players: [guest(1), account(2)], game: pending() });
    await service.accept(me("p2"), "game-1");
    const [, cutoff] = ran("coalesce(rematch_expires_at")[0]!.params as [Date, Date];
    expect(cutoff).toEqual(new Date(NOW.getTime() - (GUEST_TOKEN_GRACE_MS - REMATCH_TTL_MS)));
  });

  it("refuses with the link when the caller has another game (BR-13)", async () => {
    const { service, ran } = setup({
      game: pending(),
      rows: { "select game_id, user_id": [{ game_id: "game-9", user_id: "user-2" }] },
    });
    await expect(service.accept(me("p2"), "game-1")).rejects.toMatchObject({
      status: 409, code: "ACTIVE_GAME_EXISTS", data: { gameId: "game-9" },
    });
    expect(ran("insert into games")).toHaveLength(0);
  });

  it("refuses without the link when only the opponent has another game", async () => {
    const { service } = setup({
      game: pending(),
      rows: { "select game_id, user_id": [{ game_id: "game-9", user_id: "user-1" }] },
    });
    const error = await service.accept(me("p2"), "game-1").catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 409, code: "ACTIVE_GAME_EXISTS" });
    expect((error as { data?: unknown }).data).toBeUndefined();
  });

  it("turns the BR-13 index violation of a racing game into ACTIVE_GAME_EXISTS", async () => {
    const violation = Object.assign(new Error("duplicate"), { code: "23505", constraint: ACTIVE_SLOT_CONSTRAINT });
    const { service } = setup({ game: pending(), failOn: { marker: "insert into game_players", error: violation } });
    await expect(service.accept(me("p2"), "game-1")).rejects.toMatchObject({ status: 409, code: "ACTIVE_GAME_EXISTS" });
  });

  it("does not hide other failures", async () => {
    const other = Object.assign(new Error("duplicate"), { code: "23505", constraint: "something_else" });
    const { service } = setup({ game: pending(), failOn: { marker: "insert into game_players", error: other } });
    await expect(service.accept(me("p2"), "game-1")).rejects.toBe(other);
    const plain = new Error("boom");
    const second = setup({ game: pending(), failOn: { marker: "insert into game_players", error: plain } });
    await expect(second.service.accept(me("p2"), "game-1")).rejects.toBe(plain);
  });
});

describe("RematchService.claimGuestSeat", () => {
  it("stores the hash of the derived token on the guest's seat of the new game", async () => {
    const { service, ran } = setup({
      rows: { "from game_players p join games g": [{ rematch_game_id: "game-2", seat: 1 }], "update game_players set guest_token_hash": [{ id: "x" }] },
    });
    const token = await service.claimGuestSeat(me("p1"), "game-1", "old");
    const derived = deriveRematchToken("old", "game-2");
    expect(token).toBe(derived);
    expect(ran("update game_players set guest_token_hash")[0]!.params).toEqual([
      hashOpaqueToken(derived), "game-2", 1, hashOpaqueToken(derived),
    ]);
  });

  it("does nothing without an accepted rematch for a guest", async () => {
    const { service, ran } = setup({ rows: { "from game_players p join games g": [] } });
    expect(await service.claimGuestSeat(me("p1"), "game-1", "old")).toBeUndefined();
    expect(ran("update game_players set guest_token_hash")).toHaveLength(0);
  });

  it("returns nothing when the seat already holds another token", async () => {
    const { service } = setup({
      rows: { "from game_players p join games g": [{ rematch_game_id: "game-2", seat: 1 }], "update game_players set guest_token_hash": [] },
    });
    expect(await service.claimGuestSeat(me("p1"), "game-1", "old")).toBeUndefined();
  });
});
