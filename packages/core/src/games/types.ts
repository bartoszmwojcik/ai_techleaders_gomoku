/** Lifecycle of a game (#21). `waiting` has no opponent yet. */
export const GAME_STATUSES = ["waiting", "active", "finished", "cancelled"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/** How a game came to be (D-21); `rematch` is a game proposed after a finished one. */
export const GAME_ORIGINS = ["invite", "lobby", "rematch"] as const;
export type GameOrigin = (typeof GAME_ORIGINS)[number];

/**
 * Account holder, a guest identified by a one-game token (BR-22) or an agent that joined over MCP
 * with its own one-game token (BR-31, E06-S01).
 */
export const PARTICIPANT_KINDS = ["account", "guest", "agent"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

/** How a participant came into the game: the web page, or the MCP endpoint (`agent` only). */
export const PARTICIPANT_JOIN_CHANNELS = ["web", "mcp"] as const;
export type ParticipantJoinChannel = (typeof PARTICIPANT_JOIN_CHANNELS)[number];

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

/** Who can create a game and so sit in seat 1: an agent never does (BR-30). */
export type CreatorKind = Exclude<ParticipantKind, "agent">;
