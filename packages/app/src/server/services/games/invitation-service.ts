import {
  ConflictError,
  GUEST_TOKEN_GRACE_MS,
  GoneError,
  READY_DEADLINE_MS,
  UnauthorizedError,
  ValidationError,
  defaultNickname,
  normalizeInvitationCode,
  type AcceptInvitationInput,
  type CreatorKind,
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
  CANCEL_WAITING_GAME_SQL,
  CANCEL_NOT_STARTED_OF_GUEST,
  EXPIRE_WAITING_OF_GAME,
  EXPIRE_WAITING_OF_GUEST,
  closeStaleSlotsOfUser,
} from "./lazy-closing";
import { PARTICIPANT_TOKEN_VALID_SQL } from "./participant-token";
import {
  INVALID_INVITATION_MESSAGE,
  READ_INVITATION_SQL,
  SEAT_CONSTRAINT,
  invalidInvitation,
  lockForJoin,
  seatSecondPlayer,
  withLookupAttempt,
  type InvitationRow,
  type LookupGuard,
} from "./join-core";
import { deleteSeekersSql } from "./lobby-seeker-sql";
import type { ColorDraw } from "./color-draw";
import type { TimeoutSettler } from "./timeout-settler";

type Deps = {
  em: EntityManager;
  clock: Clock;
  rateLimiter: RateLimiter;
  timeoutSettler: TimeoutSettler;
  colorDraw: ColorDraw;
};

export { INVALID_INVITATION_MESSAGE };
export const OWN_INVITATION_MESSAGE =
  "To Twoje własne zaproszenie — przeciwnik musi być kimś innym.";
export const OWN_WAITING_GAME_MESSAGE =
  "Masz oczekującą partię. Anuluj ją, aby dołączyć do tej.";
export const SIGN_IN_MESSAGE = "Zaloguj się, aby dołączyć do partii.";
export const GUEST_NOT_ALLOWED_MESSAGE =
  "Jesteś zalogowany — dołącz jako on sam. Gra bez konta jest dla niezalogowanych.";
export const NICKNAME_GUEST_ONLY_MESSAGE = "Nick podaje tylko gość.";
export const GUEST_WARNING_MESSAGE =
  "Potwierdź, że rozumiesz ograniczenia gry bez konta.";

export type { LookupGuard };

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
  /**
   * A guest creator's nickname or `Gracz 1`; an account's name, `null` when the account is
   * gone. A `null` never means a guest: that is what `creatorKind` is for.
   */
  creatorName: string | null;
  /** Whether the creator plays with an account or as a guest (E02-S08). */
  creatorKind: CreatorKind;
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

type MemberRow = { seat: number };
type SlotRow = { game_id: string; status: string; seat: number };

const READ_MEMBER_SQL = `select seat from game_players where game_id = ? and user_id = ?`;

const READ_SLOT_SQL = `
  select p.game_id, g.status, p.seat
  from game_players p join games g on g.id = p.game_id
  where p.user_id = ? and p.is_active`;

// A guest's whole browser is one identity (Q7): the slot a token holds is looked up by its hash.
const READ_GUEST_MEMBER_SQL = `
  select p.seat from game_players p join games g on g.id = p.game_id
  where p.game_id = ? and p.guest_token_hash = ? and ${PARTICIPANT_TOKEN_VALID_SQL}`;

const READ_GUEST_SLOT_SQL = `
  select p.game_id, g.status, p.seat
  from game_players p join games g on g.id = p.game_id
  where p.guest_token_hash = ? and p.is_active`;

const INSERT_PLAYER_SQL = `
  insert into game_players (game_id, seat, kind, user_id, is_active, joined_at, seen_at)
  values (?, 2, 'account', ?, true, ?, ?)
  returning id`;

const INSERT_GUEST_SQL = `
  insert into game_players (game_id, seat, kind, guest_token_hash, nickname, is_active, joined_at, seen_at)
  values (?, 2, 'guest', ?, ?, true, ?, ?)
  returning id`;

const RELEASE_SLOTS_SQL = `update game_players set is_active = false where game_id = ? and is_active`;

/** Name of the creator for the invite page: an account's name, a guest's nickname or default. */
function creatorNameOf(invitation: InvitationRow): string | null {
  return invitation.creator_kind === "guest"
    ? (invitation.creator_nickname ?? defaultNickname(1))
    : invitation.creator_name;
}

function constraintOf(error: unknown): string | undefined {
  const { code, constraint } = error as { code?: string; constraint?: string };
  return code === "23505" ? constraint : undefined;
}

/** Previews and accepts invitations (#21 step 4). Request-scoped: it works through `em`. */
export class InvitationService {
  readonly #em: EntityManager;
  readonly #clock: Clock;
  readonly #colorDraw: ColorDraw;
  readonly #rateLimiter: RateLimiter;
  readonly #timeoutSettler: TimeoutSettler;

  constructor({ em, clock, rateLimiter, timeoutSettler, colorDraw }: Deps) {
    this.#em = em;
    this.#clock = clock;
    this.#colorDraw = colorDraw;
    this.#rateLimiter = rateLimiter;
    this.#timeoutSettler = timeoutSettler;
  }

  /**
   * State of the invitation for its page. Consumes nothing (Q12: link previews must not); the
   * only writes are the lazy closings of the viewer's stale games (Q16, Q21), as in `accept`; a failed lookup counts towards the pool of Q13 like in `accept`.
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
    await this.#settle(viewer);

    const member = invitation
      ? await this.#memberOf(this.#em, viewer, invitation.game_id)
      : undefined;
    if (invitation && member) {
      const known = (state: InvitationPreview["state"]): InvitationPreview => ({
        creatorName: creatorNameOf(invitation),
        creatorKind: invitation.creator_kind as CreatorKind,
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

    await this.#closeStaleSlots(viewer);
    const slot = await this.#slotOf(this.#em, viewer);
    const creator = {
      creatorName: creatorNameOf(invitation),
      creatorKind: invitation.creator_kind as CreatorKind,
    };
    if (!slot) return { ...creator, state: "joinable" };
    return {
      ...creator,
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
    if (input.as === "user" && input.nickname !== undefined) {
      throw new ValidationError(NICKNAME_GUEST_ONLY_MESSAGE, {
        fieldErrors: { nickname: [NICKNAME_GUEST_ONLY_MESSAGE] },
      });
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
    const normalized = normalizeInvitationCode(code);
    if (!normalized) throw invalidInvitation();

    await this.#settle(viewer);
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
    // Nobody to lock when a guest joins a guest's game (E02-S08).
    const gameIds = [...new Set([gameId, extraGame].filter((id) => id !== undefined))].sort();
    await lockForJoin(tx, userIds, gameIds);

    // Q16, Q21: slots of expired or never-opened games are released before they are judged.
    const now = this.#clock.now();
    const cutoff = new Date(now.getTime() - READY_DEADLINE_MS);
    await tx.execute(EXPIRE_WAITING_OF_GAME, [now, gameId], "run");
    await tx.execute(CANCEL_NOT_STARTED_OF_GAME, [cutoff, gameId], "run");
    if (userId) {
      await closeStaleSlotsOfUser(tx, userId, now);
    } else if (extraGame) {
      // A guest browser's own game (Q7): an unjoined one that expired frees the slot too.
      await tx.execute(EXPIRE_WAITING_OF_GAME, [now, extraGame], "run");
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
      if (slot.status !== "waiting" || slot.seat !== 1) {
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
      await tx.execute(CANCEL_WAITING_GAME_SQL, [slot.game_id, now]);
      await tx.execute(RELEASE_SLOTS_SQL, [slot.game_id], "run");
    }

    // (4) Consume the invitation, seat the player, start the game; each step is conditional.
    // The nickname goes in with the very statement that creates the guest's row.
    await seatSecondPlayer(tx, {
      code,
      invitationId: invitation.id,
      gameId,
      now,
      insert: guestToken
        ? { sql: INSERT_GUEST_SQL, params: [gameId, hashOpaqueToken(guestToken), input.nickname ?? null, now, now] }
        : { sql: INSERT_PLAYER_SQL, params: [gameId, userId, now, now] },
      drawBlackSeat: () => this.#colorDraw.drawBlackSeat(),
    });
    // The joiner is in a game now: their "looking for a game" status goes with the same commit (#25 Q5).
    if (userId) await tx.execute(deleteSeekersSql(1), [userId], "run");
    return { game: { gameId }, joined: true };
  }

  /**
   * Q16, Q21: before the viewer's slot is judged, the viewer's own expired waiting game and
   * a game nobody opened within the deadline are closed - the same bookkeeping `accept`
   * does, so the page never claims "you have a game" where joining would succeed. Idempotent
   * single statements, no invitation is consumed (Q12); an anonymous visitor has no slot.
   */
  async #closeStaleSlots({ userId, guestTokenHash }: Viewer): Promise<void> {
    const now = this.#clock.now();
    if (userId) {
      await closeStaleSlotsOfUser(this.#em, userId, now);
    } else if (guestTokenHash) {
      const cutoff = new Date(now.getTime() - READY_DEADLINE_MS);
      await this.#em.execute(EXPIRE_WAITING_OF_GUEST, [now, guestTokenHash], "run");
      await this.#em.execute(CANCEL_NOT_STARTED_OF_GUEST, [cutoff, guestTokenHash], "run");
    }
  }

  /** Finishes the viewer's games lost on time (#23, E02-S08), so BR-13 sees a free slot. */
  async #settle({ userId, guestTokenHash }: Viewer): Promise<void> {
    if (userId) await this.#timeoutSettler.settleFor(userId);
    else if (guestTokenHash) await this.#timeoutSettler.settleForGuest(guestTokenHash);
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

  async #withAttempt<T>(guard: LookupGuard, lookup: () => Promise<T>): Promise<T> {
    return withLookupAttempt(this.#rateLimiter, guard, lookup);
  }
}
