import {
  ConflictError,
  GUEST_TOKEN_GRACE_MS,
  GoneError,
  INVITATION_LOOKUP_WINDOW_MS,
  READY_DEADLINE_MS,
  UnauthorizedError,
  ValidationError,
  normalizeInvitationCode,
  type AcceptInvitationInput,
} from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

import { createOpaqueToken, hashOpaqueToken } from "../../http/opaque-token";
import type { Clock } from "../email/email-sender";
import type { RateLimiter } from "../rate-limit/rate-limiter";
import {
  ACTIVE_GAME_EXISTS_MESSAGE,
  ACTIVE_SLOT_CONSTRAINT,
} from "./game-service";
import {
  CANCEL_NOT_STARTED_OF_GAME,
  CANCEL_NOT_STARTED_OF_USER,
  EXPIRE_WAITING_OF_GAME,
  EXPIRE_WAITING_OF_USER,
} from "./lazy-closing";
import { GUEST_TOKEN_VALID_SQL } from "./guest-token";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  timeoutSettler: TimeoutSettler;
};

export const INVALID_INVITATION_MESSAGE = "To zaproszenie jest już nieważne.";
export const OWN_INVITATION_MESSAGE =
  "To Twoje własne zaproszenie — przeciwnik musi być kimś innym.";
export const OWN_WAITING_GAME_MESSAGE =
  "Masz oczekującą partię. Anuluj ją, aby dołączyć do tej.";
export const SIGN_IN_MESSAGE = "Zaloguj się, aby dołączyć do partii.";
export const GUEST_NOT_ALLOWED_MESSAGE =
  "Jesteś zalogowany — dołącz jako on sam. Gra bez konta jest dla niezalogowanych.";
export const GUEST_WARNING_MESSAGE =
  "Potwierdź, że rozumiesz ograniczenia gry bez konta.";

/** Name of the unique index `(game_id, seat)`: the last line of defence against a third player. */
const SEAT_CONSTRAINT = "game_players_game_id_seat_unique";

/**
 * Which pool counts the failed code lookups: the client address (20 per 15 minutes) or, when
 * the address is not trustworthy, one global pool (300 per 15 minutes) (#21 Q13).
 */
export type LookupGuard = { key: string; limit: number };

/**
 * Who opens the invitation: the signed-in account (it wins) and/or the hash of the guest
 * token the browser carries (SHA-256 of the cookie value); an anonymous visitor has neither.
 */
export type Viewer = { userId?: string; guestTokenHash?: string };

export type AcceptInput = AcceptInvitationInput;

export type AcceptResult = {
  gameId: string;
  /**
   * Only when a guest has just joined: the fresh token for the cookie (never stored in
   * plain, never in the JSON answer). A guest coming back keeps the cookie they have.
   */
  guestToken?: string;
};

/** What the invite page shows (#21 UI/UX), without changing any state. */
export type InvitationPreview = {
  /** `null` when the creator account is gone. */
  creatorName: string | null;
  state:
    /** Free to join (a guest option may still apply to the anonymous visitor). */
    | "joinable"
    /** The viewer is the creator of a still waiting game. */
    | "own-invitation"
    /** The viewer already plays in this game. */
    | "participant"
    /** The viewer holds a slot in another game that is in progress. */
    | "has-active-game"
    /** The viewer has their own waiting game (Q18). */
    | "has-own-waiting-game";
  /** The game to open or link to, for every state except `joinable`. */
  gameId?: string;
};

type InvitationRow = {
  id: string;
  game_id: string;
  /** Only compared with null: raw `em.execute` returns timestamps as strings, not `Date`s. */
  consumed_at: string | null;
  /** Computed in SQL: raw `em.execute` returns timestamps as strings, not `Date`s. */
  expired: boolean;
  status: string;
  creator_id: string | null;
  creator_name: string | null;
};
type MemberRow = { seat: number };
type SlotRow = { game_id: string; status: string; seat: number };

const READ_INVITATION_SQL = `
  select i.id, i.game_id, i.consumed_at, i.expires_at <= ? as expired, g.status,
    c.user_id as creator_id, u.display_name as creator_name
  from invitations i
  join games g on g.id = i.game_id
  join game_players c on c.game_id = g.id and c.seat = 1
  left join users u on u.id = c.user_id
  where i.code = ?`;

const READ_MEMBER_SQL = `select seat from game_players where game_id = ? and user_id = ?`;

const READ_SLOT_SQL = `
  select p.game_id, g.status, p.seat
  from game_players p join games g on g.id = p.game_id
  where p.user_id = ? and p.is_active`;

// A guest's whole browser is one identity (Q7): the slot a token holds is looked up by its hash.
const READ_GUEST_MEMBER_SQL = `
  select p.seat from game_players p join games g on g.id = p.game_id
  where p.game_id = ? and p.guest_token_hash = ? and ${GUEST_TOKEN_VALID_SQL}`;

const READ_GUEST_SLOT_SQL = `
  select p.game_id, g.status, p.seat
  from game_players p join games g on g.id = p.game_id
  where p.guest_token_hash = ? and p.is_active`;

// The conditional updates below are what makes the join atomic: of two concurrent accepts,
// one consumes the invitation, the other sees 0 rows.
const CONSUME_INVITATION_SQL = `
  update invitations set consumed_at = ?
  where code = ? and consumed_at is null and expires_at > ?
  returning id`;

const INSERT_PLAYER_SQL = `
  insert into game_players (game_id, seat, kind, user_id, is_active, joined_at, seen_at)
  values (?, 2, 'account', ?, true, ?, ?)
  returning id`;

const INSERT_GUEST_SQL = `
  insert into game_players (game_id, seat, kind, guest_token_hash, is_active, joined_at, seen_at)
  values (?, 2, 'guest', ?, true, ?, ?)
  returning id`;

const SET_CONSUMED_BY_SQL = `update invitations set consumed_by_id = ? where id = ?`;

const START_GAME_SQL = `
  update games set status = 'active', started_at = ?
  where id = ? and status = 'waiting'
  returning id`;

const CANCEL_WAITING_SQL = `
  update games set status = 'cancelled' where id = ? and status = 'waiting' returning id`;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

// Row locks in a fixed order (users by id, then games by id) so concurrent joins, cancels and
// the account deletion (#37) cannot deadlock. `for no key update` does not block the foreign
// key checks of unrelated inserts (sessions, game_players) that reference the same user.
const lockUsersSql = (count: number) =>
  `select id from users where id in (${placeholders(count)}) order by id for no key update`;
const lockGamesSql = (count: number) =>
  `select id from games where id in (${placeholders(count)}) order by id for update`;

function invalidInvitation(): GoneError {
  return new GoneError(INVALID_INVITATION_MESSAGE, { code: "INVALID_INVITATION" });
}

function constraintOf(error: unknown): string | undefined {
  const { code, constraint } = error as { code?: string; constraint?: string };
  return code === "23505" ? constraint : undefined;
}

/** Previews and accepts invitations (#21 step 4). Request-scoped: it works through `em`. */
export class InvitationService {
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
   * State of the invitation for its page. Changes nothing (Q12: link previews must not
   * consume anything); a failed lookup counts towards the pool of Q13 like in `accept`.
   * @throws AppError 410 `INVALID_INVITATION` (unknown, used, expired, cancelled or malformed
   * code - one answer for all); 429 `RATE_LIMITED`.
   */
  async preview(
    code: string,
    viewer: Viewer,
    guard: LookupGuard,
  ): Promise<InvitationPreview> {
    return this.#withAttempt(guard, () => this.#preview(code, viewer));
  }

  async #preview(code: string, viewer: Viewer): Promise<InvitationPreview> {
    const invitation = await this.#find(code);
    const { userId } = viewer;
    if (userId) await this.#timeoutSettler.settleFor(userId);

    const member = invitation
      ? await this.#memberOf(this.#em, viewer, invitation.game_id)
      : undefined;
    if (invitation && member) {
      const known = (state: InvitationPreview["state"]): InvitationPreview => ({
        creatorName: invitation.creator_name,
        state,
        gameId: invitation.game_id,
      });
      if (invitation.status === "waiting") {
        if (!invitation.expired) return known("own-invitation");
      } else if (member.seat === 2 || invitation.status !== "cancelled") {
        return known("participant");
      }
    }
    if (
      !invitation ||
      invitation.status !== "waiting" ||
      invitation.consumed_at !== null ||
      invitation.expired
    ) {
      throw invalidInvitation();
    }

    const slot = await this.#slotOf(this.#em, viewer);
    if (!slot) return { creatorName: invitation.creator_name, state: "joinable" };
    return {
      creatorName: invitation.creator_name,
      state:
        slot.status === "waiting" && slot.seat === 1
          ? "has-own-waiting-game"
          : "has-active-game",
      gameId: slot.game_id,
    };
  }

  /**
   * Joins the viewer to the game as seat 2, atomically (#21 steps 4 and 6): the rows of the
   * players and of the game are locked in a fixed order, the invitation is consumed by one
   * conditional `UPDATE ... RETURNING` and the game starts by another; any miss rolls
   * everything back. A repeated call by someone who already joined just returns the game.
   * `as = user` joins the signed-in account; `as = guest` joins a visitor without an account
   * with a fresh token (returned in `guestToken` for the cookie).
   * @throws AppError 400 `VALIDATION` for a guest who did not acknowledge the warning; 401
   * `as = user` without a session; 409 `GUEST_NOT_ALLOWED` (`as = guest` while signed in),
   * `OWN_INVITATION`, `OWN_WAITING_GAME` (with `data.gameId`), `ACTIVE_GAME_EXISTS`; 410
   * `INVALID_INVITATION`; 429 `RATE_LIMITED`.
   */
  async accept(
    code: string,
    viewer: Viewer,
    input: AcceptInput,
    guard: LookupGuard,
  ): Promise<AcceptResult> {
    const { userId } = viewer;
    if (input.as === "user" && !userId) {
      throw new UnauthorizedError(SIGN_IN_MESSAGE);
    }
    if (input.as === "guest") {
      if (userId) {
        throw new ConflictError(GUEST_NOT_ALLOWED_MESSAGE, { code: "GUEST_NOT_ALLOWED" });
      }
      if (input.acknowledgedGuestWarning !== true) {
        throw new ValidationError(GUEST_WARNING_MESSAGE, {
          fieldErrors: { acknowledgedGuestWarning: [GUEST_WARNING_MESSAGE] },
        });
      }
    }
    return this.#withAttempt(guard, () => this.#accept(code, viewer, input));
  }

  async #accept(
    code: string,
    viewer: Viewer,
    input: AcceptInput,
  ): Promise<AcceptResult> {
    const { userId } = viewer;
    const normalized = normalizeInvitationCode(code);
    if (!normalized) throw invalidInvitation();

    if (userId) await this.#timeoutSettler.settleFor(userId);
    // Only a guest who really joins gets a token; a returning one keeps the cookie.
    const guestToken = input.as === "guest" ? createOpaqueToken() : undefined;
    try {
      const result = await this.#em.transactional((tx) =>
        this.#join(tx, normalized, viewer, input, guestToken),
      );
      return result.joined && guestToken ? { ...result.game, guestToken } : result.game;
    } catch (error) {
      if (error instanceof GoneError) throw error;
      const constraint = constraintOf(error);
      if (constraint === ACTIVE_SLOT_CONSTRAINT) {
        throw new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
          code: "ACTIVE_GAME_EXISTS",
        });
      }
      if (constraint === SEAT_CONSTRAINT) throw invalidInvitation();
      throw error;
    }
  }

  async #join(
    tx: EntityManager,
    code: string,
    viewer: Viewer,
    input: AcceptInput,
    guestToken: string | undefined,
  ): Promise<{ game: AcceptResult; joined: boolean }> {
    const { userId } = viewer;
    const peek = await this.#find(code, tx);
    if (!peek) throw invalidInvitation();
    const gameId = peek.game_id;

    // An unlocked look at the viewer's own slot, only to know which game rows to lock: the
    // waiting game they would give up (Q18) or the game a guest token still holds (Q7).
    const slotPeek =
      input.as === "guest" || input.cancelOwnWaitingGame
        ? await this.#slotOf(tx, viewer)
        : undefined;
    const extraGame =
      slotPeek && (input.as === "guest" || (slotPeek.status === "waiting" && slotPeek.seat === 1))
        ? slotPeek.game_id
        : undefined;

    const userIds = [...new Set([userId, peek.creator_id].filter((id) => id != null))].sort();
    await tx.execute(lockUsersSql(userIds.length), userIds, "run");
    const gameIds = [...new Set([gameId, extraGame].filter((id) => id !== undefined))].sort();
    await tx.execute(lockGamesSql(gameIds.length), gameIds, "run");

    // Q16, Q21: slots of expired or never-opened games are released before they are judged.
    const now = this.#clock.now();
    const cutoff = new Date(now.getTime() - READY_DEADLINE_MS);
    await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
    await tx.execute(CANCEL_NOT_STARTED_OF_GAME, [cutoff, gameId], "run");
    if (userId) {
      await tx.execute(EXPIRE_WAITING_OF_USER, [now, userId], "run");
      await tx.execute(CANCEL_NOT_STARTED_OF_USER, [cutoff, userId], "run");
    } else if (extraGame) {
      await tx.execute(CANCEL_NOT_STARTED_OF_GAME, [cutoff, extraGame], "run");
    }

    const invitation = await this.#find(code, tx);
    if (!invitation) throw invalidInvitation();

    // (1) The viewer already plays here: a return, not a second join.
    const member = await this.#memberOf(tx, viewer, gameId);
    if (member) {
      if (invitation.status === "waiting") {
        throw new ConflictError(OWN_INVITATION_MESSAGE, {
          code: "OWN_INVITATION",
          data: { gameId },
        });
      }
      if (member.seat === 2 || invitation.status !== "cancelled") {
        return { game: { gameId }, joined: false };
      }
      throw invalidInvitation();
    }

    // (2) The invitation must still be open.
    if (invitation.status !== "waiting" || invitation.consumed_at !== null) {
      throw invalidInvitation();
    }

    // (3) BR-13: one slot per account and per guest browser (Q7); an own waiting game may be
    // given up (Q18).
    const slot = await this.#slotOf(tx, viewer);
    if (slot) {
      if (input.as === "guest" || slot.status !== "waiting" || slot.seat !== 1) {
        throw new ConflictError(ACTIVE_GAME_EXISTS_MESSAGE, {
          code: "ACTIVE_GAME_EXISTS",
          data: { gameId: slot.game_id },
        });
      }
      if (!input.cancelOwnWaitingGame || slot.game_id !== extraGame) {
        throw new ConflictError(OWN_WAITING_GAME_MESSAGE, {
          code: "OWN_WAITING_GAME",
          data: { gameId: slot.game_id },
        });
      }
      await tx.execute(CANCEL_WAITING_SQL, [slot.game_id]);
      await tx.execute(RELEASE_SLOTS_SQL, [slot.game_id], "run");
    }

    // (4) Consume the invitation, seat the player, start the game; each step is conditional.
    // The joiner has just opened the page (seen_at), so only the creator's visit is awaited (Q20).
    const consumed = await tx.execute<{ id: string }[]>(CONSUME_INVITATION_SQL, [
      now,
      code,
      now,
    ]);
    if (consumed.length === 0) throw invalidInvitation();
    const [player] = await tx.execute<{ id: string }[]>(
      guestToken
        ? INSERT_GUEST_SQL
        : INSERT_PLAYER_SQL,
      [gameId, guestToken ? hashOpaqueToken(guestToken) : userId, now, now],
    );
    await tx.execute(SET_CONSUMED_BY_SQL, [player!.id, invitation.id], "run");
    const started = await tx.execute<{ id: string }[]>(START_GAME_SQL, [now, gameId]);
    if (started.length === 0) throw invalidInvitation();
    return { game: { gameId }, joined: true };
  }

  /** The viewer's seat in the game: the account wins over a guest token. */
  async #memberOf(
    em: EntityManager,
    { userId, guestTokenHash }: Viewer,
    gameId: string,
  ): Promise<MemberRow | undefined> {
    if (userId) {
      return (await em.execute<MemberRow[]>(READ_MEMBER_SQL, [gameId, userId]))[0];
    }
    if (!guestTokenHash) return undefined;
    const cutoff = new Date(this.#clock.now().getTime() - GUEST_TOKEN_GRACE_MS);
    return (
      await em.execute<MemberRow[]>(READ_GUEST_MEMBER_SQL, [gameId, guestTokenHash, cutoff])
    )[0];
  }

  /** The game slot the viewer holds (BR-13): by account, else by guest token. */
  async #slotOf(
    em: EntityManager,
    { userId, guestTokenHash }: Viewer,
  ): Promise<SlotRow | undefined> {
    if (userId) return (await em.execute<SlotRow[]>(READ_SLOT_SQL, [userId]))[0];
    if (!guestTokenHash) return undefined;
    return (await em.execute<SlotRow[]>(READ_GUEST_SLOT_SQL, [guestTokenHash]))[0];
  }

  async #find(
    code: string,
    em: EntityManager = this.#em,
  ): Promise<InvitationRow | undefined> {
    const normalized = normalizeInvitationCode(code);
    if (!normalized) return undefined;
    return (
      await em.execute<InvitationRow[]>(READ_INVITATION_SQL, [
        this.#clock.now(),
        normalized,
      ])
    )[0];
  }

  /**
   * Q13, race-free: one attempt is reserved in the pool BEFORE the lookup (an atomic upsert in
   * its own committed transaction, so concurrent guesses cannot all read "below the limit").
   * It is given back unless the lookup failed with the uniform `INVALID_INVITATION`, so the
   * pool only counts failures; once spent, even a correct code gets 429 (no oracle).
   */
  async #withAttempt<T>(guard: LookupGuard, lookup: () => Promise<T>): Promise<T> {
    await this.#rateLimiter.hit(guard.key, guard.limit, INVITATION_LOOKUP_WINDOW_MS);
    let result: T;
    try {
      result = await lookup();
    } catch (error) {
      if (!(error instanceof GoneError)) await this.#rateLimiter.release(guard.key, INVITATION_LOOKUP_WINDOW_MS);
      throw error;
    }
    await this.#rateLimiter.release(guard.key, INVITATION_LOOKUP_WINDOW_MS);
    return result;
  }
}
