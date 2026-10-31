import {
  ConflictError,
  GUEST_TOKEN_GRACE_MS,
  NotFoundError,
  REMATCH_OFFER_LIMIT,
  REMATCH_OFFER_WINDOW_MS,
  REMATCH_TTL_MS,
  rematchBlackSeat,
  type ParticipantKind,
  type RematchView,
  type Seat,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import { deriveRematchToken, hashOpaqueToken } from "../../http/opaque-token";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  ACTIVE_GAME_EXISTS_MESSAGE,
  ACTIVE_SLOT_CONSTRAINT,
  GAME_NOT_FOUND_MESSAGE,
  type GameParticipant,
} from "./game-service";
import { closeStaleSlotsOfUser } from "./lazy-closing";
import { deleteSeekersSql } from "./lobby-seeker-sql";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  timeoutSettler: TimeoutSettler;
};

export const GAME_NOT_FINISHED_MESSAGE = "Rewanż jest możliwy dopiero po zakończeniu partii.";
export const REMATCH_ALREADY_OFFERED_MESSAGE = "Rewanż został już zaproponowany.";
export const REMATCH_NOT_OFFERED_MESSAGE = "Nie ma propozycji rewanżu do rozstrzygnięcia.";
export const REMATCH_EXPIRED_MESSAGE = "Propozycja rewanżu wygasła.";
export const REMATCH_UNAVAILABLE_MESSAGE = "Przeciwnik nie jest już dostępny, rewanż jest niemożliwy.";

/** A player of the finished game, as the rematch needs them. */
type PlayerRow = {
  id: string;
  seat: Seat;
  kind: ParticipantKind;
  user_id: string | null;
  guest_token_hash: string | null;
  nickname: string | null;
};

const PLAYERS_SQL = `
  select id, seat, kind, user_id, guest_token_hash, nickname
  from game_players where game_id = ? order by seat`;

type GameRow = {
  status: string;
  black_seat: Seat | null;
  rematch_state: string | null;
  rematch_offered_by_seat: Seat | null;
  rematch_game_id: string | null;
  /** Computed in SQL: raw `em.execute` returns timestamps as strings, not `Date`s. */
  expired: boolean;
  /**
   * Whether the guest tokens of this game will still work for a whole offer window from now
   * (BR-22), see `TOKEN_MARGIN_MS`.
   */
  token_fresh: boolean;
};

// A guest token dies `GUEST_TOKEN_GRACE_MS` after the end. The guest who proposed claims their
// seat in the new game with the OLD token (`claimGuestSeat`), so an acceptance must leave them
// at least one offer window to do it: accept only while `finished_at > now - (grace - TTL)`.
// Simpler than capping `rematch_expires_at` at offer time (no change to the offer, the view and
// `isRematchOpen`), and it holds for every offer, whenever it was made. Account-only games
// ignore it. An offer in that last window simply reads as unavailable at accept time.
const TOKEN_MARGIN_MS = GUEST_TOKEN_GRACE_MS - REMATCH_TTL_MS;

const READ_GAME_SQL = `
  select status, black_seat, rematch_state, rematch_offered_by_seat, rematch_game_id,
    coalesce(rematch_expires_at <= ?, false) as expired,
    coalesce(finished_at > ?, false) as token_fresh
  from games where id = ?`;

// One conditional update decides the offer: of two simultaneous offers exactly one writes.
const OFFER_SQL = `
  update games
  set rematch_state = 'pending', rematch_offered_by_seat = ?, rematch_expires_at = ?,
    rematch_game_id = null
  where id = ? and status = 'finished'
    and (rematch_state is null or rematch_state = 'declined'
      or (rematch_state = 'pending' and rematch_expires_at <= ?))
  returning id`;

const DECLINE_SQL = `
  update games set rematch_state = 'declined'
  where id = ? and status = 'finished' and rematch_state = 'pending' and rematch_expires_at > ?
  returning id`;

// Row locks in a fixed order (users by id, then the game), like the join of an invitation.
const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");
const lockUsersSql = (count: number) =>
  `select id from users where id in (${placeholders(count)}) order by id for no key update`;
const LOCK_GAME_SQL = `select id from games where id = ? for update`;

const ACTIVE_SLOTS_SQL_OF = (count: number) =>
  `select game_id, user_id from game_players where user_id in (${placeholders(count)}) and is_active`;

const INSERT_GAME_SQL = `
  insert into games (origin, status, created_at, started_at, black_seat)
  values ('rematch', 'active', ?, ?, ?)
  returning id`;

// `seen_at` stays NULL: the clock starts when both open the page (#21 Q20), Q21 applies.
const INSERT_PLAYER_SQL = `
  insert into game_players (game_id, seat, kind, user_id, guest_token_hash, nickname, is_active, joined_at)
  values (?, ?, ?, ?, ?, ?, true, ?)`;

const MARK_ACCEPTED_SQL = `
  update games set rematch_state = 'accepted', rematch_game_id = ?
  where id = ? and rematch_state = 'pending'`;

const CLAIM_SOURCE_SQL = `
  select g.rematch_game_id, p.seat
  from game_players p join games g on g.id = p.game_id
  where p.id = ? and g.id = ? and p.kind = 'guest'
    and g.rematch_state = 'accepted' and g.rematch_game_id is not null`;

const CLAIM_SEAT_SQL = `
  update game_players set guest_token_hash = ?
  where game_id = ? and seat = ? and kind = 'guest'
    and (guest_token_hash is null or guest_token_hash = ?)
  returning id`;

export type AcceptedRematch = {
  gameId: string;
  /** Only for a guest: the token of the new game for the cookie (never in the JSON answer). */
  guestToken?: string;
};

function constraintOf(error: unknown): string | undefined {
  const { code, constraint } = error as { code?: string; constraint?: string };
  return code === "23505" ? constraint : undefined;
}

/**
 * Rematch after a finished game (rematch spec). The offer lives in the finished game's row
 * (`rematch_*`); accepting creates the new `active` game in one transaction. Request-scoped.
 */
export class RematchService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #rateLimiter: RateLimiter;
  readonly #timeoutSettler: TimeoutSettler;

  constructor({ em, clock, rateLimiter, timeoutSettler }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#timeoutSettler = timeoutSettler;
  }

  /**
   * Offers a rematch of a finished game; either participant may, one offer at a time. An
   * expired or declined offer can be replaced. The limit counts per player, not per game.
   * @throws AppError 404 for a stranger; 409 `GAME_NOT_FINISHED`, `REMATCH_ALREADY_OFFERED`,
   * `REMATCH_UNAVAILABLE` (the other player deleted their account); 429 `RATE_LIMITED`
   */
  async offer(participant: GameParticipant, gameId: string): Promise<RematchView> {
    const players = await this.#players(this.#em, gameId);
    const me = this.#find(players, participant);
    const now = this.#clock.now();
    const game = await this.#game(this.#em, gameId, now);
    if (game.status !== "finished") throw gameNotFinished();
    // Nobody to play against: no offer for a game with a deleted account (#37) or with an agent
    // (BR-31: a rematch has no code to hand over, so the agent could not follow), and no attempt spent.
    if (players.some((player) => isDeletedAccount(player) || isAgent(player))) throw rematchUnavailable();

    // The attempt is reserved BEFORE the write (so the limit cannot be raced) and given back when
    // the conditional update refuses: a double click or `REMATCH_ALREADY_OFFERED` is no offer.
    // The key is `hash(user id)` for an account, but `hash(participant row id)` for a guest, so a
    // guest's limit is per game row, not per person (known limitation, see the spec).
    const limitKey = `rematch-offer:${hashOpaqueToken(me.user_id ?? me.id)}`;
    await this.#rateLimiter.hit(limitKey, REMATCH_OFFER_LIMIT, REMATCH_OFFER_WINDOW_MS);
    const expiresAt = new Date(now.getTime() + REMATCH_TTL_MS);
    const written = await this.#em.execute<{ id: string }[]>(OFFER_SQL, [
      me.seat,
      expiresAt,
      gameId,
      now,
    ]);
    if (written.length === 0) {
      await this.#rateLimiter
        .release(limitKey, REMATCH_OFFER_WINDOW_MS)
        .catch(() => undefined);
      throw new ConflictError(REMATCH_ALREADY_OFFERED_MESSAGE, {
        code: "REMATCH_ALREADY_OFFERED",
      });
    }
    return { state: "pending", offeredBySeat: me.seat, expiresAt, gameId: null };
  }

  /**
   * Declines the open offer; the proposer withdrawing it and the opponent leaving to the panel
   * (Q3) both come here. Repeating it is fine.
   * @throws AppError 404 for a stranger; 409 `REMATCH_NOT_OFFERED`, `REMATCH_EXPIRED`
   */
  async decline(participant: GameParticipant, gameId: string): Promise<void> {
    await this.#me(this.#em, participant, gameId);
    const now = this.#clock.now();
    const written = await this.#em.execute<{ id: string }[]>(DECLINE_SQL, [gameId, now]);
    if (written.length > 0) return;
    const game = await this.#game(this.#em, gameId, now);
    if (game.rematch_state === "declined") return;
    if (game.rematch_state === "pending") throw expired();
    throw notOffered();
  }

  /**
   * Accepts the opponent's open offer: in ONE transaction the players and the game are locked
   * (users by id, then the game), the offer is judged, BR-13 is checked for both accounts (Q4)
   * and the new game is created - `active`, `origin = 'rematch'`, same seats, colours swapped,
   * no invitation, `seen_at` empty. A repeated call of the acceptor returns the same game.
   * `guestToken` is the cookie the caller carries; a guest gets the token for the new game
   * derived from it (the other guest claims theirs through `claimGuestSeat`).
   * @throws AppError 404 for a stranger; 409 `REMATCH_NOT_OFFERED`, `REMATCH_EXPIRED`,
   * `REMATCH_UNAVAILABLE`, `ACTIVE_GAME_EXISTS` (`data.gameId` only for the caller's own game)
   */
  async accept(
    participant: GameParticipant,
    gameId: string,
    guestToken?: string,
  ): Promise<AcceptedRematch> {
    const players = await this.#players(this.#em, gameId);
    const me = this.#find(players, participant);
    if (me.kind === "guest" && guestToken === undefined) {
      throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
    }

    // BR-13 looks at the other games of both accounts: finish those whose time ran out first.
    for (const player of [me, ...players.filter((other) => other !== me)]) {
      if (player.user_id) await this.#timeoutSettler.settleFor(player.user_id);
    }

    const userIds = players
      .map((player) => player.user_id)
      .filter((id): id is string => id !== null)
      .sort();
    try {
      return await this.#em.transactional((tx) =>
        this.#accept(tx, gameId, me, userIds, guestToken),
      );
    } catch (error) {
      if (constraintOf(error) === ACTIVE_SLOT_CONSTRAINT) {
        throw new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, { code: "ACTIVE_GAME_EXISTS" });
      }
      throw error;
    }
  }

  async #accept(
    tx: EntityManager,
    gameId: string,
    me: PlayerRow,
    userIds: string[],
    guestToken: string | undefined,
  ): Promise<AcceptedRematch> {
    if (userIds.length > 0) await tx.execute(lockUsersSql(userIds.length), userIds, "run");
    await tx.execute(LOCK_GAME_SQL, [gameId], "run");

    const now = this.#clock.now();
    const game = await this.#game(tx, gameId, now);
    if (game.status !== "finished") throw gameNotFinished();
    const own = game.rematch_offered_by_seat === me.seat;
    if (game.rematch_state === "accepted" && game.rematch_game_id && !own) {
      return this.#result(game.rematch_game_id, me, guestToken);
    }
    if (game.rematch_state !== "pending" || own) throw notOffered();
    if (game.expired) throw expired();

    // Everybody must still be reachable: an account may be deleted, a guest token may be gone.
    const players = await this.#players(tx, gameId);
    if (players.some((player) => this.#unavailable(player, game))) {
      throw rematchUnavailable();
    }

    await this.#assertNoActiveGame(tx, userIds, me, now);

    const [created] = await tx.execute<{ id: string }[]>(INSERT_GAME_SQL, [
      now,
      now,
      rematchBlackSeat(game.black_seat!),
    ]);
    const newGameId = created!.id;
    for (const player of players) {
      await tx.execute(
        INSERT_PLAYER_SQL,
        [
          newGameId,
          player.seat,
          player.kind,
          player.user_id,
          // Only the caller's token is known now; the other guest claims theirs later.
          player.kind === "guest" && player.id === me.id
            ? hashOpaqueToken(deriveRematchToken(guestToken!, newGameId))
            : null,
          player.nickname,
          now,
        ],
        "run",
      );
    }
    // Both accounts are in a game now: neither stays on the lobby list (#25 Q5).
    if (userIds.length > 0) await tx.execute(deleteSeekersSql(userIds.length), userIds, "run");
    await tx.execute(MARK_ACCEPTED_SQL, [newGameId, gameId], "run");
    return this.#result(newGameId, me, guestToken);
  }

  /**
   * The guest who proposed the rematch has no token for the new game yet. Called while they poll
   * the finished game after the acceptance: derives the token from the one they carry and
   * stores its hash on their seat of the new game (idempotent: the same call gives the same token).
   * @returns the token to put in the cookie, or `undefined` when there is nothing to claim
   */
  async claimGuestSeat(
    participant: GameParticipant,
    gameId: string,
    guestToken: string,
  ): Promise<string | undefined> {
    const [source] = await this.#em.execute<{ rematch_game_id: string; seat: Seat }[]>(
      CLAIM_SOURCE_SQL,
      [participant.playerId, gameId],
    );
    if (!source) return undefined;
    const token = deriveRematchToken(guestToken, source.rematch_game_id);
    const hash = hashOpaqueToken(token);
    const claimed = await this.#em.execute<{ id: string }[]>(CLAIM_SEAT_SQL, [
      hash,
      source.rematch_game_id,
      source.seat,
      hash,
    ]);
    return claimed.length > 0 ? token : undefined;
  }

  #result(gameId: string, me: PlayerRow, guestToken: string | undefined): AcceptedRematch {
    return me.kind === "guest"
      ? { gameId, guestToken: deriveRematchToken(guestToken!, gameId) }
      : { gameId };
  }

  // An account that was deleted, an agent (BR-31), or a guest whose token is gone or about to expire (BR-22), so
  // that no seat of the new game is left without a way to be claimed.
  #unavailable(player: PlayerRow, game: GameRow): boolean {
    switch (player.kind) {
      case "account":
        return isDeletedAccount(player);
      case "agent":
        return true;
      case "guest":
        return player.guest_token_hash === null || !game.token_fresh;
    }
  }

  // BR-13 (Q4): neither account may hold a slot in another game. Stale slots are closed first.
  async #assertNoActiveGame(
    tx: EntityManager,
    userIds: string[],
    me: PlayerRow,
    now: Date,
  ): Promise<void> {
    if (userIds.length === 0) return;
    for (const userId of userIds) await closeStaleSlotsOfUser(tx, userId, now);
    const slots = await tx.execute<{ game_id: string; user_id: string }[]>(
      ACTIVE_SLOTS_SQL_OF(userIds.length),
      userIds,
    );
    if (slots.length === 0) return;
    // A link only to the caller's own game; the opponent's is none of their business.
    const own = slots.find((slot) => slot.user_id === me.user_id);
    throw new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
      code: "ACTIVE_GAME_EXISTS",
      data: own ? { gameId: own.game_id } : undefined,
    });
  }

  async #players(em: EntityManager, gameId: string): Promise<PlayerRow[]> {
    return em.execute<PlayerRow[]>(PLAYERS_SQL, [gameId]);
  }

  #find(players: PlayerRow[], participant: GameParticipant): PlayerRow {
    const me = players.find((player) => player.id === participant.playerId);
    if (!me) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
    return me;
  }

  async #me(em: EntityManager, participant: GameParticipant, gameId: string): Promise<PlayerRow> {
    return this.#find(await this.#players(em, gameId), participant);
  }

  async #game(em: EntityManager, gameId: string, now: Date): Promise<GameRow> {
    const [game] = await em.execute<GameRow[]>(READ_GAME_SQL, [
      now,
      new Date(now.getTime() - TOKEN_MARGIN_MS),
      gameId,
    ]);
    return game!;
  }
}

// A deleted account keeps its row with `user_id NULL` (#37); a guest has `user_id NULL` too.
const isDeletedAccount = (player: PlayerRow) => player.kind === "account" && player.user_id === null;
const isAgent = (player: PlayerRow) => player.kind === "agent";
const rematchUnavailable = () =>
  new ConflictError(REMATCH_UNAVAILABLE_MESSAGE, { code: "REMATCH_UNAVAILABLE" });
const gameNotFinished = () =>
  new ConflictError(GAME_NOT_FINISHED_MESSAGE, { code: "GAME_NOT_FINISHED" });
const notOffered = () =>
  new ConflictError(REMATCH_NOT_OFFERED_MESSAGE, { code: "REMATCH_NOT_OFFERED" });
const expired = () =>
  new ConflictError(REMATCH_EXPIRED_MESSAGE, { code: "REMATCH_EXPIRED" });
