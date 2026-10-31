import type { Seat } from "@gomoku/core/games/types";

import type { GameView } from "@/server/http/game-view";

/**
 * What the result screen shows about the rematch (p06.10-p06.15), from the point of view of the viewer.
 * `none` also covers the offer of the opponent that was declined (it is gone for the viewer).
 */
export type RematchMode =
  | { kind: "none" }
  | { kind: "mine"; expiresAt: number } // p06.11
  | { kind: "theirs"; expiresAt: number } // p06.12
  | { kind: "declined" } // p06.13
  | { kind: "expired" } // p06.14
  | { kind: "accepted"; gameId: string };

/**
 * Reads the rematch of a state. A pending offer past its `expiresAt` is `expired` on the client
 * too, because the server reports it only with the next read. The server cannot tell a withdrawal
 * from a refusal (both are `declined`), so `withdrawn` is what this page remembers about its own
 * withdrawal; after a reload the proposer reads it as a refusal.
 */
export function rematchModeOf(
  rematch: GameView["rematch"],
  mySeat: Seat,
  nowMs: number,
  withdrawn: boolean,
): RematchMode {
  if (!rematch) return { kind: "none" };
  const mine = rematch.offeredBySeat === mySeat;
  switch (rematch.state) {
    case "accepted":
      // A cleaned-up rematch game (#39) leaves no game to go to.
      return rematch.gameId ? { kind: "accepted", gameId: rematch.gameId } : { kind: "none" };
    case "declined":
      return mine && !withdrawn ? { kind: "declined" } : { kind: "none" };
    case "expired":
      return { kind: "expired" };
    case "pending": {
      const expiresAt = Date.parse(rematch.expiresAt);
      if (expiresAt <= nowMs) return { kind: "expired" };
      return { kind: mine ? "mine" : "theirs", expiresAt };
    }
  }
}
