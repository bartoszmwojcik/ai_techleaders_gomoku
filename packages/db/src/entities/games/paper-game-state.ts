import { defineEntity, p } from "@mikro-orm/core";

import { Game } from "./game";

/**
 * The part of a paper game (E11, D-34) that does not fit `games`: one row per `paper` game, keyed by the game.
 * `scoreN` caches the points of seat N for the history (derived from `paper_moves`, recomputed on every move in
 * the same transaction). `autoSeat` is the seat the automat plays for while the leader waits; `pendingAutoAt`
 * is when its next stone is due, `lastMoveAt` when the last real move was made (BR-50).
 */
export const PaperGameState = defineEntity({
  name: "PaperGameState",
  tableName: "paper_game_states",
  properties: {
    game: () => p.oneToOne(Game).primary().deleteRule("cascade"),
    moveCount: p.integer().default(0),
    score1: p.integer().fieldName("score_1").default(0),
    score2: p.integer().fieldName("score_2").default(0),
    autoSeat: p.smallint().nullable(),
    pendingAutoAt: p.datetime().nullable(),
    lastMoveAt: p.datetime().nullable(),
  },
  checks: [
    { name: "paper_game_states_move_count_check", expression: "move_count >= 0" },
    { name: "paper_game_states_score_check", expression: "score_1 >= 0 and score_2 >= 0" },
    { name: "paper_game_states_auto_seat_check", expression: "auto_seat in (1, 2)" },
    {
      name: "paper_game_states_pending_auto_check",
      expression: "pending_auto_at is null or auto_seat is not null",
    },
  ],
});
