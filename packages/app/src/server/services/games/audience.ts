import { SPECTATOR_PRESENCE_MS } from "@gomoku/core";
import type { EntityManager } from "@gomoku/db";

/** Who is watching a public game now: what the flag "Partia publiczna" shows (E10-S04, BR-45). */
export type Audience = { spectators: number };

// A spectator is present while their access lasts and they were seen within `SPECTATOR_PRESENCE_MS`
// (their polling writes the presence at most every 10 s): the number the limit of 20 (BR-42) counts too.
const COUNT_PRESENT_SQL = `
  select count(*)::int as n from game_spectators
  where game_id = ? and expires_at > ? and last_seen_at > ?`;

/** The spectators of `gameId` present at `now`; the same query for the limit and for the counter. */
export async function countPresentSpectators(em: EntityManager, gameId: string, now: Date): Promise<number> {
  const [row] = await em.execute<{ n: number }[]>(COUNT_PRESENT_SQL, [
    gameId,
    now,
    new Date(now.getTime() - SPECTATOR_PRESENCE_MS),
  ]);
  return row!.n;
}

/**
 * The audience of a game for its readers (players and spectators), or `undefined` when there is no
 * flag to show: a private game (also one whose creator closed the audience, BR-43) and a game that is
 * not in progress show nothing (BR-45: "podczas rozgrywki"). One indexed count, only for a public game.
 */
export async function readAudience(
  em: EntityManager,
  game: { id: string; status: string; isPublic: boolean },
  now: Date,
): Promise<Audience | undefined> {
  if (!game.isPublic || game.status !== "active") return undefined;
  return { spectators: await countPresentSpectators(em, game.id, now) };
}
