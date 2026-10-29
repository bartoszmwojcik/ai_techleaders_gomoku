import { defineEntity, p } from "@mikro-orm/core";

import { BOARD_CELLS, END_REASONS, INITIAL_CLOCK_MS } from "@gomoku/core";

const EMPTY_BOARD = `(repeat('0', ${BOARD_CELLS}))::bit(${BOARD_CELLS})`;
const END_REASONS_SQL = END_REASONS.map((reason) => `'${reason}'`).join(", ");

/**
 * One game of gomoku (#21). The board and the move log (#22) live in the row: two
 * `bit(225)` bitboards and a `bytea` log of one byte per move. The row is the lock target for every game mutation (join, cancel, move).
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

    // Seat (1 | 2) playing black and moving first; drawn when the opponent joins (#22 Q1).
    blackSeat: p.smallint().nullable(),
    // Stones placed so far; equals the bits set in both bitboards and the log length.
    moveCount: p.smallint().default(0),
    // Bit `c` of each board is cell `c = y * 15 + x` (#22 Q3); read as a 225-character string.
    stonesBlack: p.string().columnType("bit(225)").defaultRaw(EMPTY_BOARD),
    stonesWhite: p.string().columnType("bit(225)").defaultRaw(EMPTY_BOARD),
    // Byte n is the cell of move n + 1.
    moves: p.blob().columnType("bytea").defaultRaw(`''::bytea`),
    // Set when the game finishes; NULL for a draw.
    winnerSeat: p.smallint().nullable(),
    // `five_in_row` | `draw` | `timeout` | `resignation`; CHECK below.
    endReason: p.string().length(16).nullable(),

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
    { name: "games_black_seat_check", expression: `black_seat in (1, 2)` },
    { name: "games_winner_seat_check", expression: `winner_seat in (1, 2)` },
    { name: "games_end_reason_check", expression: `end_reason in (${END_REASONS_SQL})` },
    {
      name: "games_move_count_check",
      expression: `move_count between 0 and ${BOARD_CELLS}`,
    },
    {
      name: "games_board_disjoint_check",
      expression: `(stones_black & stones_white) = ${EMPTY_BOARD}`,
    },
    {
      name: "games_stone_count_check",
      expression: `bit_count(stones_black) + bit_count(stones_white) = move_count`,
    },
    {
      name: "games_alternation_check",
      expression: `bit_count(stones_black) - bit_count(stones_white) in (0, 1)`,
    },
    {
      name: "games_moves_length_check",
      expression: `octet_length(moves) = move_count`,
    },
    {
      name: "games_active_black_seat_check",
      expression: `status not in ('active', 'finished') or black_seat is not null`,
    },
    {
      name: "games_finished_end_reason_check",
      expression: `(status = 'finished') = (end_reason is not null)`,
    },
    {
      name: "games_draw_no_winner_check",
      expression: `end_reason is distinct from 'draw' or winner_seat is null`,
    },
    {
      name: "games_winner_required_check",
      expression: `end_reason is null or end_reason = 'draw' or winner_seat is not null`,
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
