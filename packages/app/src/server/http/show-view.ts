import { NotFoundError } from "@gomoku/core";

import { withRequestScope } from "../container";
import type { ShowOverview, ShowState } from "../services/games/show-service";

/** The state of a show as the page and `GET /api/show/[id]` carry it (dates as ISO strings). */
export type ShowView = Omit<ShowState, "finishedAt" | "invitation"> & {
  finishedAt?: string;
  invitation?: Omit<NonNullable<ShowState["invitation"]>, "expiresAt"> & { expiresAt: string };
};

export function toShowView(state: ShowState): ShowView {
  const { finishedAt, invitation, ...rest } = state;
  return {
    ...rest,
    ...(finishedAt && { finishedAt: finishedAt.toISOString() }),
    ...(invitation && { invitation: { ...invitation, expiresAt: invitation.expiresAt.toISOString() } }),
  };
}

/** The show for the page, or `null` when there is no such show (the page answers `404`). The caller gated it. */
export async function loadShowView(gameId: string): Promise<ShowView | null> {
  try {
    return toShowView(await withRequestScope(({ cradle }) => cradle.showService.read(gameId)));
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** The console's first read (`GET /api/show` gives the same). The caller gated it. */
export async function loadShowOverview(): Promise<ShowOverview> {
  return withRequestScope(({ cradle }) => cradle.showService.overview());
}
