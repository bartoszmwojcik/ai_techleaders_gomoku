import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";

/**
 * Marks the signed-in user as looking for a game for 5 minutes (#25, BR-12). No body. Repeating
 * it returns the same status; after it expired a new one starts. Order: session (401), the
 * 30-per-hour limit (429), BR-13 (409 `ACTIVE_GAME_EXISTS` with `data.gameId`).
 */
const markSeeking = apiHandler(async () => {
  const user = await requireSession();
  return withRequestScope(async ({ cradle }) => ({
    data: { me: await cradle.lobbyService.markSeeking(user.id) },
  }));
});

/** Withdraws the status; `200` also when there was none. */
const withdraw = apiHandler(async () => {
  const user = await requireSession();
  return withRequestScope(async ({ cradle }) => {
    await cradle.lobbyService.withdraw(user.id);
    return { data: { me: null } };
  });
});

export async function PUT(request: Request) {
  await connection();
  return markSeeking(request);
}

export async function DELETE(request: Request) {
  await connection();
  return withdraw(request);
}
