import { defineEntity, p } from "@mikro-orm/core";

/**
 * Durable counter of finished games per pair of participant kinds and day (E06-S03, #129).
 * Deliberately has no reference to `games`, `users` or `game_players`: cleaning games up and
 * deleting accounts never touch it, and it holds no personal data. `day` is the calendar day
 * in `Europe/Warsaw` of `games.finished_at`; `kind_a <= kind_b` (alphabetical). `kind_*` has
 * no CHECK on the value, so a future participant kind cannot block finishing a game.
 */
export const GamePairCounter = defineEntity({
  name: "GamePairCounter",
  tableName: "game_pair_counters",
  properties: {
    day: p.date().primary(),
    kindA: p.string().length(16).primary(),
    kindB: p.string().length(16).primary(),
    finishedCount: p.integer().default(0),
  },
  checks: [
    { name: "game_pair_counters_kind_order_check", expression: "kind_a <= kind_b" },
    { name: "game_pair_counters_count_check", expression: "finished_count >= 0" },
  ],
});
