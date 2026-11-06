import { BOT_UNAVAILABLE_MESSAGE, ServiceUnavailableError, botStrengthFor, type BotLevel, type BotStrength } from "@gomoku/core";
import { gameDeadlineSql, type EntityManager } from "@gomoku/db";

import type { ServerConfig } from "../../config";
import type { Clock } from "../email/email-sender";
import type { ResourceProbe } from "./resource-probe";

/** How long a refused player should wait before asking for the bot again (`Retry-After`). */
export const BOT_RETRY_AFTER_SECONDS = 60;

/** Why a game with the bot was refused; logged, never shown (the player reads one message). */
export type BotRefusal = "disabled" | "memory" | "busy";

// A game with the bot counts while it is `active` and its clock has not run out (spec R8, "Odmowa pod
// presją"): an abandoned game nobody has settled yet must not hold the limit. The deadline is the one
// of the cleanup rules (`gameDeadlineSql`); `games` is the only table of the outer query, so its
// unqualified columns resolve there.
const ACTIVE_BOT_GAMES_SQL = `
  select count(*)::int as count from games
  where status = 'active'
    and exists (select 1 from game_players p where p.game_id = games.id and p.kind = 'bot')
    and ${gameDeadlineSql("games")} > ?`;

type Deps = { em: EntityManager; serverConfig: ServerConfig; resourceProbe: ResourceProbe; clock: Clock };

/**
 * Admits a new game with the bot (spec 2026-11-05-hosted-bot R7, R8, R19): refused while `BOT_ENABLED`
 * is off, under `BOT_MIN_AVAILABLE_MB` of available memory or with `BOT_MAX_ACTIVE_GAMES` games with
 * the bot in progress. Otherwise the memory read now is frozen in the bot's seat (BR-57). Nothing is
 * written here; the limit is checked before the game's transaction, so two creations at the very
 * same moment may both pass it by one (the gate still computes one move at a time).
 */
export class BotAdmission {
  readonly #em: EntityManager;
  readonly #config: ServerConfig;
  readonly #probe: ResourceProbe;
  readonly #clock: Clock;

  constructor({ em, serverConfig, resourceProbe, clock }: Deps) {
    this.#em = em;
    this.#config = serverConfig;
    this.#probe = resourceProbe;
    this.#clock = clock;
  }

  /** @throws AppError 503 `BOT_UNAVAILABLE` with `Retry-After` */
  async admit(level: BotLevel): Promise<BotStrength> {
    if (!this.#config.botEnabled) throw refuse("disabled");
    const { availableMb, source } = this.#probe.read();
    const strength = availableMb >= this.#config.bot.minAvailableMb ? botStrengthFor(level, availableMb) : null;
    if (!strength) throw refuse("memory", { availableMb, source });
    const [row] = await this.#em.execute<{ count: number }[]>(ACTIVE_BOT_GAMES_SQL, [this.#clock.now()]);
    if (row!.count >= this.#config.bot.maxActiveGames) throw refuse("busy", { activeGames: row!.count });
    return strength;
  }
}

function refuse(reason: BotRefusal, details: Record<string, unknown> = {}): ServiceUnavailableError {
  if (reason !== "disabled") {
    console.warn(JSON.stringify({ event: "bot.refused", ts: new Date().toISOString(), reason, ...details }));
  }
  return new ServiceUnavailableError(BOT_UNAVAILABLE_MESSAGE, {
    code: "BOT_UNAVAILABLE",
    retryAfterSeconds: BOT_RETRY_AFTER_SECONDS,
  });
}
