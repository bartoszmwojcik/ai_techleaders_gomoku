import { showCreateSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { requireAdminApi } from "@/server/http/admin-gate";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { logSecurityEvent } from "@/server/http/security-log";

/**
 * The administrator's show console (show-mode, "API Contracts"): the switches, the cheap checks and the show in
 * progress. Anybody else gets the `404` of a missing game, before anything is read.
 */
const getShows = apiHandler(
  async () => withRequestScope(async ({ cradle }) => ({ data: await cradle.showService.overview() })),
  { gate: requireAdminApi },
);

/**
 * Creates a bot vs bot show (`201`): `400` for an unknown layout or level, `409 SHOW_RUNNING`, `503
 * SHOW_UNAVAILABLE` or `BOT_UNAVAILABLE` with `data.reason`, `429`. The gate runs before CSRF and the body; the
 * administrator is read again here for the key of the rate limit.
 */
const createShow = apiHandler(
  async (request: Request) => {
    const admin = await requireAdminApi();
    const input = showCreateSchema.parse(await readJsonBody(request));
    const show = await withRequestScope(({ cradle }) => cradle.showService.create(admin.id, input));
    logSecurityEvent("show_created");
    return { data: show, status: 201 };
  },
  { gate: requireAdminApi },
);

export async function GET(request: Request) {
  await connection();
  return getShows(request);
}

export async function POST(request: Request) {
  await connection();
  return createShow(request);
}
