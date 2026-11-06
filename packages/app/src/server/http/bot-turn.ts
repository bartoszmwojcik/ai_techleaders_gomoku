import { after } from "next/server";

import { withRequestScope } from "../container";
import type { GameState } from "../services/games/game-service";

/**
 * The bot is to move (spec 2026-11-05-hosted-bot R1): a game in progress whose seat on turn is the
 * bot's. Read from the state the route already built, so no extra query is made for other games.
 */
export function botOnTurn(state: Pick<GameState, "status" | "turnSeat" | "players">): boolean {
  if (state.status !== "active") return false;
  return state.players.some((player) => player.kind === "bot" && player.seat === state.turnSeat);
}

/**
 * Runs the bot's move after the answer is sent (`after`, Next 16): the player's request never waits
 * for the search. A fresh request scope (its own `em`), because the route's scope is done by then.
 * Only the route layer calls it: the services never import `next/server`.
 */
export function scheduleBotTurn(gameId: string): void {
  after(async () => {
    await withRequestScope(({ cradle }) => cradle.botTurnService.playDueMove(gameId));
  });
}
