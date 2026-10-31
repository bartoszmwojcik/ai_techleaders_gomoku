import {
  CREATE_GAME_LIMIT,
  CREATE_GAME_WINDOW_MS,
  ConflictError,
  GUEST_TOKEN_GRACE_MS,
  INVITATION_TTL_MS,
  NotFoundError,
  READY_DEADLINE_MS,
  UnauthorizedError,
  ValidationError,
  boardView,
  defaultNickname,
  clockView,
  type BoardView,
  type ClockView,
  type EndReason,
  formatInvitationCode,
  rematchView,
  type RematchState,
  type RematchView,
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
import { GUEST_TOKEN_VALID_SQL } from "./guest-token";
import {
  CANCEL_NOT_STARTED_OF_GAME,
  CANCEL_WAITING_GAME_SQL,
  CANCEL_NOT_STARTED_OF_GUEST,
  EXPIRE_WAITING_OF_GAME,
  EXPIRE_WAITING_OF_GUEST,
  closeStaleSlotsOfUser,
} from "./lazy-closing";
import { deleteSeekersSql } from "./lobby-seeker-sql";
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
export const OWN_WAITING_GAME_MESSAGE =
  "Masz oczekującą partię. Anuluj ją, aby utworzyć nową.";
const SESSION_REQUIRED_MESSAGE = "Zaloguj się, aby kontynuować.";
export const GAME_NOT_FOUND_MESSAGE = "Nie znaleziono partii.";

function activeGameExists(gameId: string): ConflictError {
  return new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
    code: "ACTIVE_GAME_EXISTS",
    data: { gameId },
  });
}

/** Used only outside production, where `APP_ORIGIN` may be unset (as in e-mail links). */
const AFTER_MESSAGE = "Nieprawidłowy parametr after.";
const DEV_ORIGIN = "http://localhost:3000";

// The player a guest token stands for in this game, while the token is valid (BR-22).
const FIND_GUEST_SQL = `
  select p.id from game_players p join games g on g.id = p.game_id
  where p.game_id = ? and p.guest_token_hash = ? and ${GUEST_TOKEN_VALID_SQL}`;

// First successful read of the page by a participant (#21 Q20); only while the game is open.
const MEMBER_MOVE_COUNT_SQL = `
  select g.move_count from game_players p join games g on g.id = p.game_id
  where p.id = ? and g.id = ?`;

const MARK_SEEN_SQL = `
  update game_players p set seen_at = ?
  from games g
  where p.id = ? and g.id = p.game_id and p.seen_at is null and g.status in ('waiting', 'active')`;

// Starts the clock once, when nobody else is missing a `seen_at` (#23 Q5); the caller counts
// as seen because `MARK_SEEN_SQL` follows. Runs before `MARK_SEEN_SQL` so the locks are taken in
// the order games, then game_players.
const START_CLOCK_SQL = `
  update games set turn_started_at = ?
  where id = ? and status = 'active' and turn_started_at is null
    and not exists (
      select 1 from game_players p where p.game_id = games.id and p.seen_at is null and p.id <> ?)`;

// Blocks a concurrent deletion of the account (#37): inserting `game_players` takes only
// `FOR KEY SHARE` on the user row, which does not conflict with the deletion's own lock, so
// without this a game could appear for an account that is being deleted. First in the
// transaction: the lock order is users, then games, then game_players.
const LOCK_USER_SQL = `select id from users where id = ? for no key update`;

// Serializes the creates of one browser (same token hash); released at the commit.
const ADVISORY_LOCK_SQL = `select pg_advisory_xact_lock(hashtext(?))`;

// The slot a guest browser holds (BR-13): the game it waits in or plays.
const GUEST_SLOT_SQL = `
  select p.game_id, g.status, p.seat
  from game_players p join games g on g.id = p.game_id
  where p.guest_token_hash = ? and p.is_active`;

// The browser's token moves to its new game; the rows that held it are ended (no slot left).
const RELEASE_TOKEN_SQL = `update game_players set guest_token_hash = null where guest_token_hash = ?`;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

/**
 * Who creates a game: a signed-in account, or a visitor without one (E02-S08).
 * `tokenHash` is the SHA-256 of the browser's guest token: the one in its cookie when it
 * carries one, otherwise a fresh token the caller puts in the cookie. `limitKey` is the
 * rate-limit key of the client address (`games-create-guest:ip:...`).
 */
export type GameCreator =
  | { kind: "account"; userId: string }
  | GuestCreator;

export type GuestCreator = {
  kind: "guest";
  nickname?: string;
  tokenHash: string;
  limitKey: string;
  cancelOwnWaitingGame?: boolean;
};

export type CreatedGame = {
  gameId: string;
  invitation: { code: string; url: string; expiresAt: Date };
};

/** Who is asking: the participant resolved from the session or the guest token. */
export type GameParticipant = { playerId: string };

export type GameState = BoardView & {
  status: GameStatus;
  /** Time left to each player, computed by the server at the moment of the answer (#23). */
  clock: ClockView;
  you: { seat: Seat; kind: ParticipantKind };
  players: {
    seat: Seat;
    kind: ParticipantKind;
    /**
     * A guest's nickname or `Gracz {seat}` (E02-S07); `null` only for a deleted account.
     * The UI tells guests apart by `kind`, never by `null`.
     */
    displayName: string | null;
    /** Whether the player already opened the game page (#21 Q20). */
    seen: boolean;
  }[];
  /** Only for the creator, only while the game waits. */
  invitation?: { code: string; url: string; expiresAt: Date };
  /**
   * Only for a `cancelled` game: cancelled by its creator, expired unjoined (24 h), or closed
   * because somebody did not open it in 15 minutes (Q21).
   */
  closedReason?: ClosedReason;
  /**
   * Only for a finished game with a rematch offer (rematch spec): who offered, until when, and
   * the new game once accepted. Absent when nobody offered; a pending offer past its time reads
   * as `expired` (lazy, no cron).
   */
  rematch?: RematchView;
  /**
   * Only for a finished game: when it ended. A guest's token for it works for an hour from then
   * (BR-22), so the page knows when to stop reading a result nobody can read any more.
   */
  finishedAt?: Date;
  /**
   * Only for a game created by an accepted rematch (`origin = 'rematch'`): the page says the
   * colours were swapped instead of "drawn" (p05, p06.15).
   */
  fromRematch?: true;
};

export type ClosedReason = "cancelled" | "expired" | "not_opened";

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
   * Games the creator could not finish are closed first (Q16, Q17, Q21), so a free slot is
   * visible to BR-13. An account is limited per user and guarded by the partial unique index;
   * a guest (E02-S08) per client address and by the service, under an advisory lock on the
   * browser's token (see `#createForGuest`).
   * @throws AppError 429 `RATE_LIMITED` over 10 games per hour (Q13);
   * 409 `ACTIVE_GAME_EXISTS` when the creator already holds a slot, for a guest also 409
   * `OWN_WAITING_GAME` (`data.gameId`) unless `cancelOwnWaitingGame` is set.
   */
  async create(creator: GameCreator): Promise<CreatedGame> {
    if (creator.kind === "guest") return this.#createForGuest(creator);
    const { userId } = creator;
    await this.#rateLimiter.hit(
      `games-create:${userId}`,
      CREATE_GAME_LIMIT,
      CREATE_GAME_WINDOW_MS,
    );
    await this.#timeoutSettler.settleFor(userId);

    const now = this.#clock.now();
    const draft = this.#draft(now);
    try {
      const gameId = await this.#em.transactional(async (tx) => {
        const locked = await tx.execute<{ id: string }[]>(LOCK_USER_SQL, [userId]);
        // The account was deleted between the session check and now (#37).
        if (locked.length === 0) throw new UnauthorizedError(SESSION_REQUIRED_MESSAGE);
        // Whoever starts a game stops looking for one (#25 Q5); right after the user lock (lock order).
        await tx.execute(deleteSeekersSql(1), [userId], "run");
        await closeStaleSlotsOfUser(tx, userId, now);
        return this.#insertGame(tx, draft, now, { kind: "account", userId });
      });
      return this.#created(gameId, draft);
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
   * BR-13 for a browser without an account (Q7): the unique index covers only accounts, so the
   * service holds the line. One browser is one token, and the new game takes over the token the
   * browser already carries (cleared from its older, ended games: the cookie can hold only one
   * token anyway), so a second request with the same cookie finds the first one's game as its
   * slot. The check and the insert run under `pg_advisory_xact_lock` on the token hash. Requests
   * without a cookie carry different tokens and cannot see each other (two games, the second
   * cookie wins; the address limit bounds it).
   * A refusal is returned out of the transaction and thrown after the commit, so the lazy
   * closings written on the way are kept.
   */
  async #createForGuest(creator: GuestCreator): Promise<CreatedGame> {
    await this.#rateLimiter.hit(
      creator.limitKey,
      CREATE_GAME_LIMIT,
      CREATE_GAME_WINDOW_MS,
    );
    await this.#timeoutSettler.settleForGuest(creator.tokenHash);

    const now = this.#clock.now();
    const draft = this.#draft(now);
    const outcome = await this.#em.transactional(
      async (tx): Promise<{ gameId: string } | { refusal: ConflictError }> => {
        await tx.execute(ADVISORY_LOCK_SQL, [creator.tokenHash], "run");
        const cutoff = new Date(now.getTime() - READY_DEADLINE_MS);
        await tx.execute(EXPIRE_WAITING_OF_GUEST, [now, creator.tokenHash], "run");
        await tx.execute(CANCEL_NOT_STARTED_OF_GUEST, [cutoff, creator.tokenHash], "run");

        const [slot] = await tx.execute<{ game_id: string; status: string; seat: number }[]>(
          GUEST_SLOT_SQL,
          [creator.tokenHash],
        );
        if (slot) {
          const own = slot.status === "waiting" && slot.seat === 1;
          if (!own || !creator.cancelOwnWaitingGame) {
            return {
              refusal: own
                ? new ConflictError(OWN_WAITING_GAME_MESSAGE, {
                    code: "OWN_WAITING_GAME",
                    data: { gameId: slot.game_id },
                  })
                : activeGameExists(slot.game_id),
            };
          }
          // Atomic against a concurrent join: when somebody joined first, nothing is cancelled.
          const cancelled = await tx.execute<{ id: string }[]>(CANCEL_WAITING_GAME_SQL, [
            slot.game_id,
            now,
          ]);
          if (cancelled.length === 0) return { refusal: activeGameExists(slot.game_id) };
          await tx.execute(RELEASE_SLOTS_SQL, [slot.game_id], "run");
        }
        // The token moves to the new game: the older rows are ended, their token is of no use.
        await tx.execute(RELEASE_TOKEN_SQL, [creator.tokenHash], "run");
        return {
          gameId: await this.#insertGame(tx, draft, now, {
            kind: "guest",
            guestTokenHash: creator.tokenHash,
            nickname: creator.nickname,
          }),
        };
      },
    );
    if ("refusal" in outcome) throw outcome.refusal;
    return this.#created(outcome.gameId, draft);
  }

  #draft(now: Date) {
    return {
      code: this.#invitationCodes.generate(),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    };
  }

  /** Writes the game, its seat-1 player and the invitation through `tx`; returns the game id. */
  async #insertGame(
    tx: EntityManager,
    { code, expiresAt }: { code: string; expiresAt: Date },
    now: Date,
    creator:
      | { kind: "account"; userId: string }
      | { kind: "guest"; guestTokenHash: string; nickname?: string },
  ): Promise<string> {
    const game = tx.create(Game, {
      origin: "invite",
      status: "waiting",
      createdAt: now,
    });
    tx.create(GamePlayer, {
      game,
      seat: 1,
      ...(creator.kind === "account"
        ? { kind: "account", user: tx.getReference(User, creator.userId) }
        : { kind: "guest", guestTokenHash: creator.guestTokenHash, nickname: creator.nickname }),
      isActive: true,
      joinedAt: now,
    });
    tx.create(Invitation, { game, code, createdAt: now, expiresAt });
    await tx.flush();
    return game.id;
  }

  #created(gameId: string, { code, expiresAt }: { code: string; expiresAt: Date }): CreatedGame {
    return {
      gameId,
      invitation: {
        code: formatInvitationCode(code),
        url: invitationUrl(this.#origin(), code),
        expiresAt,
      },
    };
  }

  /**
   * Cancels a waiting game; only its creator may (Q5): the participant of seat 1, an account
   * or a guest browser (E02-S08). Atomic: of a concurrent cancel and
   * join exactly one wins, and `active` is never overwritten.
   * @throws AppError 404 for a stranger or a missing game; 409 `GAME_NOT_CANCELLABLE`
   * when the game is not `waiting` any more.
   */
  async cancel(participant: GameParticipant, gameId: string): Promise<void> {
    await this.#em.transactional(async (tx) => {
      const creator = await tx.count(GamePlayer, {
        id: participant.playerId,
        game: gameId,
        seat: 1,
      });
      if (creator === 0) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      const cancelled = await tx.execute<{ id: string }[]>(
        CANCEL_WAITING_GAME_SQL,
        [gameId, this.#clock.now()],
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
   * The participant behind an identity in a game, or `null` (the caller answers `404`, so
   * nobody learns whether the game exists). Order: the signed-in account, then the guest
   * token (#21 step 6). A guest token counts while the game is in progress and for one hour
   * after it finished (BR-22); a game closed unplayed (Q21) voids it.
   */
  async findParticipant(
    identity: { userId?: string; guestTokenHash?: string },
    gameId: string,
  ): Promise<GameParticipant | null> {
    if (identity.userId) {
      const player = await this.#em.findOne(GamePlayer, {
        game: gameId,
        user: identity.userId,
      });
      if (player) return { playerId: player.id };
    }
    if (!identity.guestTokenHash) return null;
    const cutoff = new Date(this.#clock.now().getTime() - GUEST_TOKEN_GRACE_MS);
    const [guest] = await this.#em.execute<{ id: string }[]>(
      FIND_GUEST_SQL,
      [gameId, identity.guestTokenHash, cutoff],
    );
    return guest ? { playerId: guest.id } : null;
  }

  /**
   * State of a game for one of its participants (404 for anybody else). A read that also
   * does the lazy bookkeeping, in this order: an expired waiting game is cancelled (Q16),
   * a game nobody opened within 15 minutes is cancelled (Q21), the clock starts when the
   * caller is the last one to open the game (#23 Q5), a game whose time is up is finished
   * (#23 Q3), then the caller's `seen_at` is set once (Q20). Cancellation comes first, so a
   * late first visit does not revive it.
   */
  async getState(
    participant: GameParticipant,
    gameId: string,
    after = 0,
  ): Promise<GameState> {
    return this.#em.transactional(async (tx) => {
      // One query for membership and the move count (no extra query on a normal poll).
      const [member] = await tx.execute<{ move_count: number }[]>(MEMBER_MOVE_COUNT_SQL, [
        participant.playerId,
        gameId,
      ]);
      if (!member) throw new NotFoundError(GAME_NOT_FOUND_MESSAGE);
      // Optimization, not a correctness guarantee: a bad `after` is refused before the lazy
      // bookkeeping, so a request that is rejected anyway does no writes and takes no locks.
      // (The 400 rolls the transaction back either way, so the outcome is the same as the
      // later check in `stateOf`; the move count does not change under the lazy updates.)
      if (after > member.move_count) throw new ValidationError(AFTER_MESSAGE);

      const now = this.#clock.now();
      await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
      await tx.execute(
        CANCEL_NOT_STARTED_OF_GAME,
        [new Date(now.getTime() - READY_DEADLINE_MS), gameId],
        "run",
      );
      await tx.execute(START_CLOCK_SQL, [now, gameId, participant.playerId], "run");
      // Lazy loss on time (#23 Q3): takes the game lock only when the time is up, and before
      // `seen_at` is written, which keeps the order games -> game_players.
      await this.#timeoutSettler.settleExpired(gameId, tx, now);
      await tx.execute(MARK_SEEN_SQL, [now, participant.playerId], "run");

      return this.stateOf(tx, participant, gameId, after, now);
    });
  }

  /**
   * Builds the state of a game inside the caller's transaction, without bookkeeping:
   * `getState` calls it after the lazy updates, `GameMoveService` after a move.
   * `after` is the number of moves the client already knows (#22 Q5); `now` is the instant
   * the caller settled the clock at, so the clock view never disagrees with the status.
   * @throws AppError 400 when `after` is greater than the number of moves
   */
  async stateOf(
    tx: EntityManager,
    participant: GameParticipant,
    gameId: string,
    after = 0,
    now: Date = this.#clock.now(),
  ): Promise<GameState> {
    // A game removed under the caller (the cleanup of guest-only games, #102) is a 404 like any
    // game the caller does not take part in, not an unhandled ORM error.
    const game = await tx.findOneOrFail(Game, gameId, {
      failHandler: () => new NotFoundError(GAME_NOT_FOUND_MESSAGE),
    });
    if (after > game.moveCount) {
      throw new ValidationError(AFTER_MESSAGE);
    }
    const players = await tx.find(
      GamePlayer,
      { game: gameId },
      { populate: ["user"], orderBy: { seat: "asc" } },
    );
    const you = players.find(({ id }) => id === participant.playerId)!;
    const board = boardView(
      {
        status: game.status as GameStatus,
        blackSeat: game.blackSeat ?? null,
        moveCount: game.moveCount,
        stonesBlack: game.stonesBlack,
        stonesWhite: game.stonesWhite,
        moves: game.moves,
        winnerSeat: game.winnerSeat ?? null,
        endReason: (game.endReason ?? null) as EndReason | null,
      },
      after,
    );
    const state: GameState = {
      status: game.status as GameStatus,
      clock: clockView(
        {
          clockMs: [game.clockMs1, game.clockMs2],
          turnStartedAtMs: game.turnStartedAt?.getTime() ?? null,
          turnSeat: board.turnSeat,
        },
        now.getTime(),
      ),
      you: { seat: you.seat as Seat, kind: you.kind as ParticipantKind },
      players: players.map((player) => ({
        seat: player.seat as Seat,
        kind: player.kind as ParticipantKind,
        displayName:
          player.kind === "guest"
            ? (player.nickname ?? defaultNickname(player.seat as Seat))
            : (player.user?.displayName ?? null),
        seen: player.seenAt !== null,
      })),
      ...board,
    };
    if (you.seat === 1 && game.status === "waiting") {
      const invitation = await tx.findOneOrFail(Invitation, { game: gameId });
      state.invitation = {
        code: formatInvitationCode(invitation.code),
        url: invitationUrl(this.#origin(), invitation.code),
        expiresAt: invitation.expiresAt,
      };
    }
    const rematch = rematchView(
      {
        state: (game.rematchState ?? null) as RematchState | null,
        offeredBySeat: (game.rematchOfferedBySeat ?? null) as Seat | null,
        expiresAt: game.rematchExpiresAt ?? null,
        gameId: game.rematchGame?.id ?? null,
      },
      now,
    );
    if (rematch) state.rematch = rematch;
    if (game.status === "finished" && game.finishedAt) state.finishedAt = game.finishedAt;
    if (game.origin === "rematch") state.fromRematch = true;
    if (game.status === "cancelled") {
      if (players.length > 1) {
        state.closedReason = "not_opened";
      } else {
        // A creator's cancel voids the invitation (`consumed_at`); an expiry leaves it untouched.
        const invitation = await tx.findOneOrFail(Invitation, { game: gameId });
        state.closedReason = invitation.consumedAt ? "cancelled" : "expired";
      }
    }
    return state;
  }

  #origin(): string {
    return this.#serverConfig.appOrigin ?? DEV_ORIGIN;
  }
}
