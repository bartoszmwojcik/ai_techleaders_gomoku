import { READY_DEADLINE_MS, type Seat } from "@gomoku/core";
import { GamePlayer, type EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";
import {
  CANCEL_NOT_STARTED_OF_GUEST,
  EXPIRE_WAITING_OF_GUEST,
  closeStaleSlotsOfUser,
} from "../games/lazy-closing";

type Deps = { em: EntityManager; clock: Clock };

export type CurrentGame = { gameId: string; status: "waiting" | "active"; seat: Seat };

/**
 * Answers what game slot a user holds right now. Request-scoped (it reads through `em`).
 * Two different questions, not to be confused (#21 Q4):
 * - `hasActiveGame`: a game in progress (status `active`) - logout confirmation (login-logout
 *   Q4) and the session exception G5 (a session that expired mid-game stays valid);
 * - `occupiesSlot`: a `waiting` or `active` game - BR-13, one game per user.
 */
export class GameParticipation {
  readonly #em: EntityManager;
  readonly #clock: Clock;

  constructor({ em, clock }: Deps) {
    this.#em = em;
    this.#clock = clock;
  }

  /**
   * Whether the user is in the middle of a game. With `startedBefore` only a game that was
   * already running at that moment counts (G5: the session expired at that moment).
   */
  async hasActiveGame(
    userId: string,
    options: { startedBefore?: Date } = {},
  ): Promise<boolean> {
    const { startedBefore } = options;
    const count = await this.#em.count(GamePlayer, {
      user: userId,
      isActive: true,
      game: {
        status: "active",
        ...(startedBefore ? { startedAt: { $lte: startedBefore } } : {}),
      },
    });
    return count > 0;
  }

  /** Whether the user holds a slot: a waiting or an active game (BR-13). */
  async occupiesSlot(userId: string): Promise<boolean> {
    const count = await this.#em.count(GamePlayer, {
      user: userId,
      isActive: true,
      game: { status: { $in: ["waiting", "active"] } },
    });
    return count > 0;
  }

  /**
   * The game that holds the user's slot (waiting or active), for the home page's "return to
   * your game" and for sending a second "create" to the game they already wait in; `null`
   * without one. Stale slots (an expired invitation, a game nobody opened within 15 minutes)
   * are closed first, so the page never claims "you have a game" where joining would succeed
   * (#21 Q16, Q21).
   */
  async currentGame(userId: string): Promise<CurrentGame | null> {
    await closeStaleSlotsOfUser(this.#em, userId, this.#clock.now());
    const player = await this.#em.findOne(
      GamePlayer,
      { user: userId, isActive: true, game: { status: { $in: ["waiting", "active"] } } },
      { populate: ["game"] },
    );
    if (!player) return null;
    return {
      gameId: player.game.id,
      status: player.game.status as "waiting" | "active",
      seat: player.seat as Seat,
    };
  }

  /**
   * The same for a guest browser, found by the hash of its token (E02-S08): the "you have a
   * game" of the home page for a guest creator. Stale slots are closed first, as for an account.
   */
  async currentGameOfGuest(tokenHash: string): Promise<CurrentGame | null> {
    const now = this.#clock.now();
    await this.#em.execute(EXPIRE_WAITING_OF_GUEST, [now, tokenHash], "run");
    await this.#em.execute(
      CANCEL_NOT_STARTED_OF_GUEST,
      [new Date(now.getTime() - READY_DEADLINE_MS), tokenHash],
      "run",
    );
    const player = await this.#em.findOne(
      GamePlayer,
      { guestTokenHash: tokenHash, isActive: true, game: { status: { $in: ["waiting", "active"] } } },
      { populate: ["game"] },
    );
    if (!player) return null;
    return {
      gameId: player.game.id,
      status: player.game.status as "waiting" | "active",
      seat: player.seat as Seat,
    };
  }
}
