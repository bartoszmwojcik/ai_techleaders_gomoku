import { defineEntity, p } from "@mikro-orm/core";

import { INITIAL_CLOCK_MS } from "@gomoku/core";

/**
 * One game of gomoku (#21). The board and the move log (#22) are added by a later
 * migration. The row is the lock target for every game mutation (join, cancel, move).
 */
export const Game = defineEntity({
  name: "Game",
  tableName: "games",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    // `invite` | `lobby` | `rematch` (D-21); CHECK below.
    origin: p.string().length(16),
    // `waiting` | `active` | `finished` | `cancelled`; CHECK below.
    status: p.string().length(16),
    createdAt: p.datetime().defaultRaw("now()"),
    // Set when the opponent joins (`waiting` -> `active`).
    startedAt: p.datetime().nullable(),
    finishedAt: p.datetime().nullable(),

    // Chess clock (#23): remaining time after each player's last move, by seat.
    clockMs1: p.integer().fieldName("clock_ms_1").default(INITIAL_CLOCK_MS),
    clockMs2: p.integer().fieldName("clock_ms_2").default(INITIAL_CLOCK_MS),
    // Start of the current turn; NULL until both players have `seen_at` (#21 Q20).
    turnStartedAt: p.datetime().nullable(),

    // Rematch offer made after the game finished (rematch spec).
    rematchOfferedBySeat: p.smallint().nullable(),
    rematchExpiresAt: p.datetime().nullable(),
    // `pending` | `accepted` | `declined`; CHECK below.
    rematchState: p.string().length(16).nullable(),
    // Plain reference without an "accepted needs a game" CHECK: deleting the rematch game
    // (cleanup #39) sets it to NULL, which such a CHECK would block.
    rematchGame: () => p.manyToOne(Game).deleteRule("set null").nullable(),
  },
  indexes: [
    // Cleanup of expired records (#39) scans by status and age.
    { name: "games_status_created_at_index", properties: ["status", "createdAt"] },
  ],
  checks: [
    {
      name: "games_origin_check",
      expression: `origin in ('invite', 'lobby', 'rematch')`,
    },
    {
      name: "games_status_check",
      expression: `status in ('waiting', 'active', 'finished', 'cancelled')`,
    },
    {
      name: "games_started_at_check",
      expression: `status not in ('active', 'finished') or started_at is not null`,
    },
    {
      name: "games_finished_at_check",
      expression: `status <> 'finished' or finished_at is not null`,
    },
    {
      name: "games_clock_ms_check",
      expression: `clock_ms_1 between 0 and ${INITIAL_CLOCK_MS} and clock_ms_2 between 0 and ${INITIAL_CLOCK_MS}`,
    },
    {
      name: "games_rematch_offered_by_seat_check",
      expression: `rematch_offered_by_seat in (1, 2)`,
    },
    {
      name: "games_rematch_state_check",
      expression: `rematch_state in ('pending', 'accepted', 'declined')`,
    },
    {
      name: "games_rematch_only_finished_check",
      expression: `rematch_state is null or status = 'finished'`,
    },
    {
      name: "games_rematch_pending_check",
      expression: `rematch_state is distinct from 'pending' or (rematch_offered_by_seat is not null and rematch_expires_at is not null)`,
    },
  ],
});
