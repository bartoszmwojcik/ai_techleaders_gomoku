import { NotFoundError } from "@gomoku/core";

import { withRequestScope } from "../container";
import type { SpectatorState } from "../services/games/spectator-service";
import { resolveSpectator } from "./spectator";

/** The state a spectator reads, as the page and `GET /api/games/[id]/spectate` carry it (dates as ISO strings). */
export type SpectatorView = Omit<SpectatorState, "finishedAt"> & { finishedAt?: string };

/**
 * The game for its spectator, or `null` when there is no such game or the visitor does not watch it
 * (the page answers `404` for both). Reading it slides the spectator's access, like each poll.
 */
export async function loadSpectatorView(gameId: string): Promise<SpectatorView | null> {
  try {
    const { gameId: id, spectator } = await resolveSpectator(gameId);
    const state = await withRequestScope(({ cradle }) => cradle.spectatorService.getState(spectator, id));
    const { finishedAt, ...rest } = state;
    return { ...rest, ...(finishedAt && { finishedAt: finishedAt.toISOString() }) };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
