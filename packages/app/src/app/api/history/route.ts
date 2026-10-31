import { historyQuerySchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";

/**
 * The finished games of the signed-in account, newest first (E04-S01): `{ entries, nextCursor }`,
 * 20 per page; `?cursor=` continues after the last entry of the previous page. A guest has no
 * history (BR-24), so no session means `401`. Read only, apart from settling the games whose
 * clock ran out (Q8).
 */
const getHistory = apiHandler(async (request: Request) => {
  const { cursor } = historyQuerySchema.parse({
    cursor: new URL(request.url).searchParams.get("cursor") ?? undefined,
  });
  const user = await requireSession();
  return withRequestScope(async ({ cradle }) => ({
    data: await cradle.gameHistoryService.list(user.id, { cursor }),
  }));
});

export async function GET(request: Request) {
  await connection();
  return getHistory(request);
}
