import { NotFoundError } from "@gomoku/core";

import { withRequestScope } from "../container";
import type { GameState } from "../services/games/game-service";
import { resolveParticipant } from "./participant";

/**
 * The state of a game as the page and `GET /api/games/[id]` carry it (dates as ISO strings).
 * On the client `moves` holds all moves so far: polling merges the new ones into it.
 */
export type GameView = Omit<GameState, "invitation" | "rematch" | "finishedAt"> & {
  /** Only for the creator while the game waits. */
  invitation?: { code: string; url: string; expiresAt: string };
  /** Only for a cancelled game: why it was closed (creator's cancel, expiry, nobody opened it). */
  closedReason?: "cancelled" | "expired" | "not_opened";
  /** Only for a finished game: when it ended (the guest's token works for an hour from then). */
  finishedAt?: string;
  /** Only for a finished game with a rematch offer. */
  rematch?: Omit<NonNullable<GameState["rematch"]>, "expiresAt"> & { expiresAt: string };
};

/**
 * The game for its participant, or `null` when there is no such game or the visitor does not
 * play in it (the page answers `404` for both, so it does not confirm that a game exists, N-05).
 * Reading it also does the lazy bookkeeping of `GameService.getState` (Q16, Q20, Q21).
 */
export async function loadGameView(gameId: string): Promise<GameView | null> {
  try {
    const { gameId: id, participant } = await resolveParticipant(gameId);
    const state = await withRequestScope(({ cradle }) => cradle.gameService.getState(participant, id));
    // Dates cross the server/client boundary as ISO strings, like in the JSON API.
    const { invitation, rematch, finishedAt, ...rest } = state;
    return {
      ...rest,
      ...(invitation && { invitation: { ...invitation, expiresAt: invitation.expiresAt.toISOString() } }),
      ...(finishedAt && { finishedAt: finishedAt.toISOString() }),
      ...(rematch && { rematch: { ...rematch, expiresAt: rematch.expiresAt.toISOString() } }),
    };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
