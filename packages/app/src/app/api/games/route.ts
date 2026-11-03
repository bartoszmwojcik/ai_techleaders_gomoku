import { createAccountGameSchema, createGuestGameSchema, resolveGameSettings } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody, readOptionalJsonBody } from "@/server/http/api-handler";
import { getCurrentUser } from "@/server/http/auth";
import { clientKey } from "@/server/http/client-address";
import {
  guestCookieMaxAge,
  readGuestToken,
  setGuestCookie,
} from "@/server/http/guest-cookie";
import { createOpaqueToken, hashOpaqueToken } from "@/server/http/opaque-token";

/**
 * Creates a waiting game with a one-use invitation (#21). A signed-in user sends no body; a
 * visitor without an account (E02-S08) sends `{ acknowledgedGuestWarning: true, nickname?,
 * cancelOwnWaitingGame? }` and gets the guest token in the cookie: the one the browser already
 * carries (one browser, one slot) or a fresh one, valid until an hour after the invitation
 * expires. Order for a guest: body (400), client address (500 when unknown in production),
 * then the service: the 10-per-hour limit per address (429), BR-13 (`409 ACTIVE_GAME_EXISTS`,
 * `OWN_WAITING_GAME`) and the lazy closing of stale games. The guest fields are ignored for a
 * signed-in user. Both kinds may send `isPublic: true` to make the game public (D-33, BR-40); the
 * default is private, and a signed-in user's body is optional. Both may choose the variant and
 * the clock: `{ variant?: 'classic' | 'paper', timeControlMs?: 60000 | 120000 | 180000 | 300000 }`
 * (E11); no variant is the classic game, a missing time in the paper game is three minutes.
 */
const createGame = apiHandler(async (request: Request) => {
  const user = await getCurrentUser();
  return withRequestScope(async ({ cradle }) => {
    if (user) {
      const input = createAccountGameSchema.parse(await readOptionalJsonBody(request));
      return {
        data: await cradle.gameService.create({
          kind: "account",
          userId: user.id,
          isPublic: input.isPublic,
          settings: resolveGameSettings(input),
        }),
        status: 201,
      };
    }
    const input = createGuestGameSchema.parse(await readJsonBody(request));
    const limitKey = clientKey(request.headers, "games-create-guest", cradle.serverConfig);
    const token = (await readGuestToken(cradle.serverConfig)) ?? createOpaqueToken();
    const data = await cradle.gameService.create({
      kind: "guest",
      nickname: input.nickname,
      tokenHash: hashOpaqueToken(token),
      limitKey,
      cancelOwnWaitingGame: input.cancelOwnWaitingGame,
      isPublic: input.isPublic,
      settings: resolveGameSettings(input),
    });
    await setGuestCookie(
      cradle.serverConfig,
      token,
      guestCookieMaxAge({ status: "waiting", invitation: data.invitation }, cradle.clock.now()),
    );
    return { data, status: 201 };
  });
});

export async function POST(request: Request) {
  await connection();
  return createGame(request);
}
