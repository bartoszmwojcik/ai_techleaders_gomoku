import type { EntityManager } from "@gomoku/db";

/**
 * Port to the lazy "lost on time" settlement of #23. `settleFor(userId)` finalizes the
 * user's `active` games whose clock ran out, so that BR-13 checks see a free slot (#21 Q17).
 * `settleGame(gameId, tx)` does the same for one game whose row the caller has already locked;
 * it must write only through `tx` (the caller's transaction) and must not lock `users`
 * (lock order: users, then games - #22 Risks).
 */
export interface TimeoutSettler {
  settleFor(userId: string): Promise<void>;
  /** @returns whether the game was finished by running out of time */
  settleGame(gameId: string, tx: EntityManager): Promise<boolean>;
}

/** Placeholder until #23 delivers the clock: games have no deadline yet, nothing to settle. */
export class NoopTimeoutSettler implements TimeoutSettler {
  async settleFor(userId: string): Promise<void> {
    // The parameter is the contract the real implementation keeps.
    void userId;
  }

  async settleGame(gameId: string, tx: EntityManager): Promise<boolean> {
    void gameId;
    void tx;
    return false;
  }
}
