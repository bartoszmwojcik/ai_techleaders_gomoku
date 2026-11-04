import { NotFoundError } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { resolveParticipant } from "@/server/http/participant";
import { resolveSpectator } from "@/server/http/spectator";

type Context = { params: Promise<{ id: string }> };

/** A player first, then a spectator (like the game page); anybody else gets the same `404`. */
async function viewedGameId(id: string): Promise<string> {
  try {
    return (await resolveParticipant(id)).gameId;
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    return (await resolveSpectator(id)).gameId;
  }
}

/**
 * The QR code of the game's invitation link as an SVG image (D-35, BR-52, BR-53), for the `img` of
 * its player or spectator. Not part of the state: a spectator's state carries no code, and the
 * pages do not read this with every poll. The errors stay JSON, the `{ ok: false }` of every route.
 */
const getQr = apiHandler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const gameId = await viewedGameId(id);
  const svg = await withRequestScope(({ cradle }) => cradle.inviteQrService.svgFor(gameId));
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Never from a cache: a closed audience or a cancelled invitation has no code any more.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, the image runs nothing and loads nothing.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

export async function GET(request: Request, context: Context) {
  await connection();
  return getQr(request, context);
}
