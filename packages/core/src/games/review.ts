import type { BotView } from "../bot/profile";
import type { GameVariant } from "./paper/constants";
import type { EndReason, ParticipantKind, Seat } from "./types";

/**
 * A finished game as the review screen reads it (E09-S01): the whole move log, how it ended and
 * who played. Never an e-mail, an account id, a token or chat (BR-34). The same shape serves a
 * participant reading their history and, later, anybody holding the code of a public game (E09-S02).
 */
export type GameReview = {
  gameId: string;
  /** A paper game ended by resignation or time is told apart only by this. */
  variant: GameVariant;
  /** ISO 8601, UTC. */
  finishedAt: string;
  blackSeat: Seat;
  /** Cells of moves 1..N, in the order they were played. */
  moves: number[];
  result: {
    winnerSeat: Seat | null;
    reason: EndReason;
    /** Cells of the winning line, only for `five_in_row`. */
    winLine: number[] | null;
  };
  players: {
    seat: Seat;
    kind: ParticipantKind;
    /** A guest's nickname or `Gracz {seat}`, an account's name; `null` for a deleted account and an agent. */
    displayName: string | null;
    /** Only for an agent (BR-31): the model name it declared, or `null`. Unverified text. */
    agentName?: string | null;
    /** Only for the bot (E15-S05, additive): its strength, so the UI names it in the reader's language. */
    bot?: BotView;
  }[];
  /** The seat of the one who reads, or `null` for a reader who did not play (a spectator of a public game). */
  viewerSeat: Seat | null;
};

/** A step is the number of moves shown: 0 is the empty board, `total` the final position. */
export function clampReviewStep(step: number, total: number): number {
  return Math.min(total, Math.max(0, step));
}
