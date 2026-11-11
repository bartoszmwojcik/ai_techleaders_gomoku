import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { requireAdminApi } from "@/server/http/admin-gate";
import { apiHandler } from "@/server/http/api-handler";
import { logSecurityEvent } from "@/server/http/security-log";
import { showIdOf } from "@/server/http/show-id";
import { toShowView } from "@/server/http/show-view";

type Context = { params: Promise<{ id: string }> };

/** Ends a show before its end (P7): `cancelled`, safe to repeat; `409 GAME_NOT_ACTIVE` once it finished. */
const endShow = apiHandler(
  async (_request: Request, { params }: Context) => {
    const gameId = showIdOf((await params).id);
    const state = await withRequestScope(({ cradle }) => cradle.showService.end(gameId));
    logSecurityEvent("show_ended");
    return { data: toShowView(state) };
  },
  { gate: requireAdminApi },
);

export async function POST(request: Request, context: Context) {
  await connection();
  return endShow(request, context);
}
