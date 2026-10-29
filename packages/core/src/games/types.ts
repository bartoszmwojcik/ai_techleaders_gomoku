/** Lifecycle of a game (#21). `waiting` has no opponent yet. */
export const GAME_STATUSES = ["waiting", "active", "finished", "cancelled"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/** How a game came to be (D-21); `rematch` is a game proposed after a finished one. */
export const GAME_ORIGINS = ["invite", "lobby", "rematch"] as const;
export type GameOrigin = (typeof GAME_ORIGINS)[number];

/** Account holder or a guest identified by a one-game token (BR-22). */
export const PARTICIPANT_KINDS = ["account", "guest"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

/** Seat 1 is the creator, seat 2 the joining player (#21 Q14). */
export const SEATS = [1, 2] as const;
export type Seat = (typeof SEATS)[number];

/** State of a rematch offer (rematch spec). */
export const REMATCH_STATES = ["pending", "accepted", "declined"] as const;
export type RematchState = (typeof REMATCH_STATES)[number];

/** Stone colour; black moves first (#22 Q1). */
export const GAME_COLORS = ["black", "white"] as const;
export type GameColor = (typeof GAME_COLORS)[number];

/**
 * Why a game finished: five (or more) in a row and a full board (#22), the clock running
 * out (#23) and a resignation (resignation spec).
 */
export const END_REASONS = ["five_in_row", "draw", "timeout", "resignation"] as const;
export type EndReason = (typeof END_REASONS)[number];

/** Outcome of a finished game; `winnerSeat` is `null` only for a draw. */
export type GameResult = { winnerSeat: Seat | null; reason: EndReason };
