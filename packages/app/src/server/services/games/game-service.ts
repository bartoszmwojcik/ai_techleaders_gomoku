import {
  CREATE_GAME_LIMIT,
  CREATE_GAME_WINDOW_MS,
  ConflictError,
  INVITATION_TTL_MS,
  NotFoundError,
  READY_DEADLINE_MS,
  formatInvitationCode,
  invitationUrl,
  type GameStatus,
  type ParticipantKind,
  type Seat,
} from "@gomoku/core";
import {
  Game,
  GamePlayer,
  Invitation,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
} from "@gomoku/db";

import type { ServerConfig } from "../../config";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import type { InvitationCodes } from "./invitation-codes";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  invitationCodes: InvitationCodes;
  timeoutSettler: TimeoutSettler;
  serverConfig: ServerConfig;
};

/** Name of the partial unique index behind BR-13 (see the `games` migration). */
export const ACTIVE_SLOT_CONSTRAINT = "game_players_user_id_active_unique";

export const ACTIVE_GAME_EXISTS_MESSAGE =
  "Masz już partię. Dokończ ją albo anuluj oczekującą.";
export const GAME_NOT_CANCELLABLE_MESSAGE =
  "Tej partii nie można już anulować.";
export const GAME_NOT_FOUND_MESSAGE = "Nie znaleziono partii.";

/** Used only outside production, where `APP_ORIGIN` may be unset (as in e-mail links). */
const DEV_ORIGIN = "http://localhost:3000";

// Frees the slots of waiting games whose invitation expired (#21 Q16). One statement, in the
// lock order games -> game_players. `?` binds: now, then the user (or game) id.
function expireWaitingSql(scope: string): string {
  return `
  with expired as (
    update games g set status = 'cancelled'
    where g.status = 'waiting'
      and exists (select 1 from invitations i where i.game_id = g.id and i.expires_at <= ?)
      and ${scope}
    returning g.id
  )
  update game_players set is_active = false
  where is_active and game_id in (select id from expired)`;
}

// Cancels `active` games in which somebody never opened the page within READY_DEADLINE_MS of
// the start (#21 Q21). `?` binds: the cutoff (now - deadline), then the user (or game) id.
function cancelNotStartedSql(scope: string): string {
  return `
  with stale as (
    update games g set status = 'cancelled'
    where g.status = 'active'
      and g.started_at <= ?
      and exists (select 1 from game_players p where p.game_id = g.id and p.seen_at is null)
      and ${scope}
    returning g.id
  )
  update game_players set is_active = false
  where is_active and game_id in (select id from stale)`;
}

const OF_USER = `exists (select 1 from game_players m where m.game_id = g.id and m.user_id = ?)`;
const OF_GAME = `g.id = ?`;

const EXPIRE_WAITING_OF_USER = expireWaitingSql(OF_USER);
const EXPIRE_WAITING_OF_GAME = expireWaitingSql(OF_GAME);
const CANCEL_NOT_STARTED_OF_USER = cancelNotStartedSql(OF_USER);
const CANCEL_NOT_STARTED_OF_GAME = cancelNotStartedSql(OF_GAME);

// First successful read of the page by a participant (#21 Q20); only while the game is open.
const MARK_SEEN_SQL = `
  update game_players p set seen_at = ?
  from games g
  where p.id = ? and g.id = p.game_id and p.seen_at is null and g.status in ('waiting', 'active')`;

// Cancels a game only while it waits; the conditional update is what makes a race with a join safe.
const CANCEL_WAITING_SQL = `
  update games set status = 'cancelled' where id = ? and status = 'waiting' returning id`;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

export type CreatedGame = {
  gameId: string;
  invitation: { code: string; url: string; expiresAt: Date };
};

/** Who is asking: the participant resolved from the session or the guest token. */
export type GameParticipant = { playerId: string };

export type GameState = {
  status: GameStatus;
  you: { seat: Seat; kind: ParticipantKind };
  players: {
    seat: Seat;
    kind: ParticipantKind;
    /** `null` for a guest and for a deleted account. */
    displayName: string | null;
    /** Whether the player already opened the game page (#21 Q20). */
    seen: boolean;
  }[];
  /** Only for the creator, only while the game waits. */
  invitation?: { code: string; url: string; expiresAt: Date };
};

export class GameService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #rateLimiter: RateLimiter;
  readonly #invitationCodes: InvitationCodes;
  readonly #timeoutSettler: TimeoutSettler;
  readonly #serverConfig: ServerConfig;

  constructor({
    em,
    clock,
    rateLimiter,
    invitationCodes,
    timeoutSettler,
    serverConfig,
  }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#rateLimiter = rateLimiter;
    this.#invitationCodes = invitationCodes;
    this.#timeoutSettler = timeoutSettler;
    this.#serverConfig = serverConfig;
  }

  /**
   * Creates a `waiting` game with the creator in seat 1 and a one-use invitation (#21).
   * Games the user could not finish are closed first (Q16, Q17, Q21), so a free slot is
   * visible to the partial unique index that enforces BR-13.
   * @throws AppError 429 `RATE_LIMITED` over 10 games per hour (Q13);
   * 409 `ACTIVE_GAME_EXISTS` when the user already holds a slot.
   */
  async create(userId: string): Promise<CreatedGame> {
    await this.#rateLimiter.hit(
      `games-create:${userId}`,
      CREATE_GAME_LIMIT,
      CREATE_GAME_WINDOW_MS,
    );
    await this.#timeoutSettler.settleFor(userId);

    const now = this.#clock.now();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const code = this.#invitationCodes.generate();
    try {
      const gameId = await this.#em.transactional(async (tx) => {
        await tx.execute(EXPIRE_WAITING_OF_USER, [now, userId], "run");
        await tx.execute(
          CANCEL_NOT_STARTED_OF_USER,
          [new Date(now.getTime() - READY_DEADLINE_MS), userId],
          "run",
        );
        const game = tx.create(Game, {
          origin: "invite",
          status: "waiting",
          createdAt: now,
        });
        tx.create(GamePlayer, {
          game,
          seat: 1,
          kind: "account",
          user: tx.getReference(User, userId),
          isActive: true,
          joinedAt: now,
        });
        tx.create(Invitation, { game, code, createdAt: now, expiresAt });
        await tx.flush();
        return game.id;
      });
      return {
        gameId,
        invitation: {
          code: formatInvitationCode(code),
          url: invitationUrl(this.#origin(), code),
          expiresAt,
        },
      };
    } catch (error) {
      if (
        error instanceof UniqueConstraintViolationException &&
        (error as { constraint?: string }).constraint === ACTIVE_SLOT_CONSTRAINT
      ) {
        throw new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
          code: "ACTIVE_GAME_EXISTS",
        });
      }
      throw error;
    }
  }

  /**
   * Cancels a waiting game; only its creator may (Q5). Atomic: of a concurrent cancel and
   * join exactly one wins, and `active` is never overwritten.
   * @throws AppError 404 for a stranger or a missing game; 409 `GAME_NOT_CANCELLABLE`
   * when the game is not `waiting` any more.
   */
  async cancel(userId: string, gameId: string): Promise<void> {
    await this.#em.transactional(async (tx) => {
      const creator = await tx.count(GamePlayer, {
        game: gameId,
        seat: 1,
        user: userId,
      });
      if (creator === 0) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      const cancelled = await tx.execute<{ id: string }[]>(
        CANCEL_WAITING_SQL,
        [gameId],
      );
      if (cancelled.length === 0) {
        throw new ConflictError(GAME_NOT_CANCELLABLE_MESSAGE, {
          code: "GAME_NOT_CANCELLABLE",
        });
      }
      await tx.execute(RELEASE_SLOTS_SQL, [gameId], "run");
    });
  }

  /**
   * State of a game for one of its participants (404 for anybody else). A read that also
   * does the lazy bookkeeping, in this order: an expired waiting game is cancelled (Q16),
   * a game nobody opened within 15 minutes is cancelled (Q21), then the caller's `seen_at`
   * is set once (Q20). Cancellation comes first, so a late first visit does not revive it.
   */
  async getState(
    participant: GameParticipant,
    gameId: string,
  ): Promise<GameState> {
    return this.#em.transactional(async (tx) => {
      const member = await tx.count(GamePlayer, {
        id: participant.playerId,
        game: gameId,
      });
      if (member === 0) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);

      const now = this.#clock.now();
      await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
      await tx.execute(
        CANCEL_NOT_STARTED_OF_GAME,
        [new Date(now.getTime() - READY_DEADLINE_MS), gameId],
        "run",
      );
      await tx.execute(MARK_SEEN_SQL, [now, participant.playerId], "run");

      const game = await tx.findOneOrFail(Game, gameId);
      const players = await tx.find(
        GamePlayer,
        { game: gameId },
        { populate: ["user"], orderBy: { seat: "asc" } },
      );
      const you = players.find(({ id }) => id === participant.playerId)!;
      const state: GameState = {
        status: game.status as GameStatus,
        you: { seat: you.seat as Seat, kind: you.kind as ParticipantKind },
        players: players.map((player) => ({
          seat: player.seat as Seat,
          kind: player.kind as ParticipantKind,
          displayName: player.user?.displayName ?? null,
          seen: player.seenAt !== null,
        })),
      };
      if (you.seat === 1 && game.status === "waiting") {
        const invitation = await tx.findOneOrFail(Invitation, { game: gameId });
        state.invitation = {
          code: formatInvitationCode(invitation.code),
          url: invitationUrl(this.#origin(), invitation.code),
          expiresAt: invitation.expiresAt,
        };
      }
      return state;
    });
  }

  #origin(): string {
    return this.#serverConfig.appOrigin ?? DEV_ORIGIN;
  }
}
