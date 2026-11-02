import {
  ConflictError,
  NotFoundError,
  SPECTATORS_MAX,
  SPECTATOR_ACCESS_MS,
  SPECTATOR_TOUCH_INTERVAL_MS,
  ValidationError,
  normalizeInvitationCode,
} from "@gomoku/core";
import { Game, GamePlayer, type EntityManager } from "@gomoku/db";

import { countPresentSpectators, readAudience } from "./audience";
import { createOpaqueToken, hashOpaqueToken } from "../../http/opaque-token";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import { GAME_NOT_FOUND_MESSAGE, watchableState, type WatchableState } from "./game-service";
import { NICKNAME_GUEST_ONLY_MESSAGE } from "./invitation-service";
import {
  invalidInvitation,
  withLookupAttempt,
  type LookupGuard,
} from "./join-core";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  timeoutSettler: TimeoutSettler;
};

export const SPECTATORS_FULL_MESSAGE = "Partia ma komplet widzów";

/** Who asks to watch: the signed-in account (it wins) and/or the hash of the spectator token cookie. */
export type SpectatorIdentity = { userId?: string; tokenHash?: string };

/** A spectator resolved for one game; the only thing the reads need. */
export type SpectatorAccess = { spectatorId: string };

export type SpectateInput = { nickname?: string };

export type SpectateResult = {
  gameId: string;
  /**
   * Only when a visitor has just become a spectator: the fresh token for the cookie (never stored
   * in plain, never in the JSON answer). A spectator coming back keeps the cookie they have.
   */
  spectatorToken?: string;
};

/**
 * What a spectator sees (E10-S02, S2-6): the board, both clocks, the seats with their names and
 * the result. Not: the invitation code, the agent token, the chat settings, e-mail addresses, who
 * opened the page (`seen`), the rematch.
 */
export type SpectatorState = Omit<WatchableState, "players"> & {
  players: Omit<WatchableState["players"][number], "seen">[];
  /** Only for a finished game: when it ended. */
  finishedAt?: Date;
  /** The spectator has a name to write under (a nickname or an account), so the chat has a composer (BR-41). */
  canChat: boolean;
};

// One lock per game for the whole join (the count and the insert), released at the commit. A key of
// its own, so it never meets the chat's lock of the same game.
const LOCK_SQL = `select pg_advisory_xact_lock(hashtextextended(?::text, 0))`;

// The game behind a code and whether it may be watched now: public and in progress (BR-39, BR-40).
const READ_TARGET_SQL = `
  select g.id as game_id, g.status, g.is_public
  from invitations i join games g on g.id = i.game_id
  where i.code = ?`;

const READ_GAME_SQL = `select status, is_public from games where id = ?`;

const IS_PLAYER_SQL = `select 1 as one from game_players where game_id = ? and user_id = ?`;

// Alive or expired alike: a returning spectator is admitted again, whatever the limit says.
const FIND_ROW_OF_USER_SQL = `select id from game_spectators where game_id = ? and user_id = ?`;
const FIND_ROW_OF_TOKEN_SQL = `select id from game_spectators where game_id = ? and token_hash = ?`;

const FIND_ALIVE_OF_USER_SQL = `select id from game_spectators where game_id = ? and user_id = ? and expires_at > ?`;
const FIND_ALIVE_OF_TOKEN_SQL = `select id from game_spectators where game_id = ? and token_hash = ? and expires_at > ?`;

const INSERT_SQL = `
  insert into game_spectators (game_id, user_id, nickname, token_hash, created_at, last_seen_at, expires_at)
  values (?, ?, ?, ?, ?, ?, ?)`;

const SLIDE_SQL = `update game_spectators set last_seen_at = ?, expires_at = ? where id = ?`;

// Is the presence older than the write interval? Computed in SQL: raw dates come back as text.
const READ_ROW_SQL = `
  select last_seen_at <= ? as stale, (nickname is not null or user_id is not null) as can_chat
  from game_spectators
  where id = ? and game_id = ? and expires_at > ?`;

/**
 * Spectators of public games (E10-S02, D-33): joining by the invitation code once both seats are
 * taken (BR-39), the limit of 20 (BR-42) and the read-only state. A spectator is not a participant:
 * this service writes only to `game_spectators` (and the lazy loss on time every reader does), and no
 * other service knows a spectator, so a move, a resignation, a rematch or a chat message of a player
 * is `404` for them. Request-scoped: it works through `em`.
 */
export class SpectatorService {
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
   * Makes the viewer a spectator of the public game behind the code, or lets a returning one in. A
   * player of the game (an account) just gets the game back: they are not a spectator. Failed
   * lookups count towards the pool of the invitation page (Q13), like in `accept`.
   * @throws AppError 400 `VALIDATION` (a nickname next to an account); 409 `SPECTATORS_FULL`;
   * 410 `INVALID_INVITATION` (unknown, malformed, private, not in progress); 429 `RATE_LIMITED`.
   */
  async join(
    code: string,
    viewer: SpectatorIdentity,
    input: SpectateInput,
    guard: LookupGuard,
  ): Promise<SpectateResult> {
    if (viewer.userId && input.nickname !== undefined) {
      throw new ValidationError(NICKNAME_GUEST_ONLY_MESSAGE, {
        fieldErrors: { nickname: [NICKNAME_GUEST_ONLY_MESSAGE] },
      });
    }
    return withLookupAttempt(this.#rateLimiter, guard, () => this.#join(code, viewer, input));
  }

  async #join(code: string, viewer: SpectatorIdentity, input: SpectateInput): Promise<SpectateResult> {
    const normalized = normalizeInvitationCode(code);
    if (!normalized) throw invalidInvitation();
    const spectatorToken = viewer.userId ? undefined : createOpaqueToken();
    const { gameId, created } = await this.#em.transactional(async (tx) => {
      const [peek] = await tx.execute<{ game_id: string }[]>(READ_TARGET_SQL, [normalized]);
      if (!peek) throw invalidInvitation();
      const id = peek.game_id;
      await tx.execute(LOCK_SQL, [`spectate:${id}`], "run");
      // Under the lock: the game may have ended, or the creator closed the audience, since the peek.
      const [game] = await tx.execute<{ status: string; is_public: boolean }[]>(READ_GAME_SQL, [id]);
      if (!game || game.status !== "active" || !game.is_public) throw invalidInvitation();

      if (viewer.userId) {
        const [player] = await tx.execute<unknown[]>(IS_PLAYER_SQL, [id, viewer.userId]);
        if (player) return { gameId: id, created: false };
      }
      const now = this.#clock.now();
      const [row] = viewer.userId
        ? await tx.execute<{ id: string }[]>(FIND_ROW_OF_USER_SQL, [id, viewer.userId])
        : viewer.tokenHash
          ? await tx.execute<{ id: string }[]>(FIND_ROW_OF_TOKEN_SQL, [id, viewer.tokenHash])
          : [];
      if (row) {
        await tx.execute(SLIDE_SQL, [now, this.#expiryFrom(now), row.id], "run");
        // The cookie they carry is still theirs: no new token.
        return { gameId: id, created: false };
      }
      if ((await countPresentSpectators(tx, id, now)) >= SPECTATORS_MAX) {
        throw new ConflictError(SPECTATORS_FULL_MESSAGE, { code: "SPECTATORS_FULL" });
      }
      await tx.execute(
        INSERT_SQL,
        [
          id,
          viewer.userId ?? null,
          viewer.userId ? null : (input.nickname ?? null),
          spectatorToken ? hashOpaqueToken(spectatorToken) : null,
          now,
          now,
          this.#expiryFrom(now),
        ],
        "run",
      );
      return { gameId: id, created: true };
    });
    // The token belongs to a row only when this call created it; a returning spectator keeps their cookie.
    return { gameId, ...(created && spectatorToken && { spectatorToken }) };
  }

  /**
   * The spectator behind an identity in a game, or `null` (the caller answers `404`, so nobody
   * learns whether the game exists). The account first, then the token; only while the access lasts.
   */
  async find(identity: SpectatorIdentity, gameId: string): Promise<SpectatorAccess | null> {
    const now = this.#clock.now();
    if (identity.userId) {
      const [row] = await this.#em.execute<{ id: string }[]>(FIND_ALIVE_OF_USER_SQL, [gameId, identity.userId, now]);
      if (row) return { spectatorId: row.id };
    }
    if (!identity.tokenHash) return null;
    const [row] = await this.#em.execute<{ id: string }[]>(FIND_ALIVE_OF_TOKEN_SQL, [gameId, identity.tokenHash, now]);
    return row ? { spectatorId: row.id } : null;
  }

  /**
   * The state of the game for one of its spectators (`404` for anybody else), `after` as in
   * `GameService.getState`. It slides the access and the presence (written at most every 10 s),
   * then reads. The one thing a read may change in the game is the lazy loss on time every reader
   * does when a clock ran out; nothing a spectator sends changes the game.
   * @throws AppError 400 when `after` is greater than the number of moves; 404
   */
  async getState(access: SpectatorAccess, gameId: string, after = 0): Promise<SpectatorState> {
    return this.#em.transactional(async (tx) => {
      const now = this.#clock.now();
      const [row] = await tx.execute<{ stale: boolean; can_chat: boolean }[]>(READ_ROW_SQL, [
        new Date(now.getTime() - SPECTATOR_TOUCH_INTERVAL_MS),
        access.spectatorId,
        gameId,
        now,
      ]);
      if (!row) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      if (row.stale) await tx.execute(SLIDE_SQL, [now, this.#expiryFrom(now), access.spectatorId], "run");

      await this.#timeoutSettler.settleExpired(gameId, tx, now);
      // A game removed under the reader (the cleanup) is `404` like any game they cannot watch.
      const game = await tx.findOneOrFail(Game, gameId, {
        failHandler: () => new NotFoundError(GAME_NOT_FOUND_MESSAGE),
      });
      const players = await tx.find(GamePlayer, { game: gameId }, { populate: ["user"], orderBy: { seat: "asc" } });
      const { players: seats, ...view } = watchableState(game, players, after, now);
      const audience = await readAudience(tx, game, now);
      return {
        ...view,
        canChat: row.can_chat,
        ...(audience && { audience }),
        players: seats.map(({ seat, kind, displayName, agentName }) => ({
          seat,
          kind,
          displayName,
          ...(agentName !== undefined && { agentName }),
        })),
        ...(game.status === "finished" && game.finishedAt && { finishedAt: game.finishedAt }),
      };
    });
  }

  #expiryFrom(now: Date): Date {
    return new Date(now.getTime() + SPECTATOR_ACCESS_MS);
  }
}
