import { withRequestScope } from "../container";
import type { CurrentGame } from "../services/auth/game-participation";
import { readGuestTokenHash } from "./guest-cookie";

/**
 * The game a guest browser holds (E02-S08): the "Masz partię" of the home page for a guest creator
 * or joiner, found by the token in the cookie. `null` without the cookie, without a waiting or
 * active game, and - like the session lookup of the home page - when the lookup fails, so a
 * database hiccup never breaks the page for a visitor.
 */
export async function loadGuestCurrentGame(): Promise<CurrentGame | null> {
  try {
    return await withRequestScope(async ({ cradle }) => {
      const tokenHash = await readGuestTokenHash(cradle.serverConfig);
      return tokenHash ? cradle.gameParticipation.currentGameOfGuest(tokenHash) : null;
    });
  } catch {
    return null;
  }
}
