import type { FinishedGameStats } from "@gomoku/core";
import { readFinishedGameStats, type EntityManager } from "@gomoku/db";

import type { Clock } from "../email/email-sender";

type Deps = { em: EntityManager; clock: Clock };

/**
 * Finished games per pair of participant kinds (E06-S03). The one reader behind the
 * `stats:games` command's data and the admin panel (#158): the panel only displays this.
 */
export class FinishedGameStatsService {
  readonly #em: EntityManager;
  readonly #clock: Clock;

  constructor({ em, clock }: Deps) {
    this.#em = em;
    this.#clock = clock;
  }

  finishedByPair(): Promise<FinishedGameStats> {
    return readFinishedGameStats(this.#em, this.#clock.now());
  }
}
