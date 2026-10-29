import { GoneError, TooManyRequestsError } from "@gomoku/core";
import { headers } from "next/headers";

import { withRequestScope } from "../container";
import { getCurrentUser } from "./auth";
import { readGuestTokenHash } from "./guest-cookie";
import { lookupGuard } from "./invitation-lookup";

/** What the invitation page shows, decided on the server (#21 UI/UX, map s07). */
export type InvitationView =
  /** Unknown, used, expired, cancelled or malformed code: one answer for all (Q12). */
  | { kind: "invalid" }
  /** The pool of failed lookups is spent (Q13). */
  | { kind: "limit" }
  /** The viewer already plays in this game, or created it: go to the game page. */
  | { kind: "redirect"; gameId: string }
  | {
      kind: "joinable" | "has-active-game" | "has-own-waiting-game";
      creatorName: string | null;
      /** The viewer's other game, for the two `has-*` kinds. */
      gameId?: string;
      /** Whether the viewer has an account session (otherwise they are a visitor). */
      signedIn: boolean;
    };

/**
 * Looks the invitation up for the invite page: `InvitationService.preview` with the viewer's
 * session or guest token and the lookup guard of the request (Q13). The page never says why
 * a code is invalid, and a spent pool answers the same for a good code and a bad one, so the
 * page is no oracle. Other errors (e.g. database down) propagate to the framework's error page.
 */
export async function loadInvitationView(code: string): Promise<InvitationView> {
  const user = await getCurrentUser();
  const requestHeaders = await headers();
  return withRequestScope(async ({ cradle }): Promise<InvitationView> => {
    try {
      const preview = await cradle.invitationService.preview(
        code,
        {
          userId: user?.id,
          guestTokenHash: await readGuestTokenHash(cradle.serverConfig),
        },
        lookupGuard(requestHeaders, cradle.serverConfig),
      );
      if (preview.state === "own-invitation" || preview.state === "participant") {
        return { kind: "redirect", gameId: preview.gameId! };
      }
      return {
        kind: preview.state,
        creatorName: preview.creatorName,
        gameId: preview.gameId,
        signedIn: user !== null,
      };
    } catch (error) {
      if (error instanceof GoneError) return { kind: "invalid" };
      if (error instanceof TooManyRequestsError) return { kind: "limit" };
      throw error;
    }
  });
}
