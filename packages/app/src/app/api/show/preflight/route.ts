import { showCreateSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { requireAdminApi } from "@/server/http/admin-gate";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";

/**
 * "Will the show start" for the chosen levels (P18): the switches, the bot's flag, memory and free slot, no show in
 * progress, and a trial move of level 1 in the bot's worker thread behind the gate (within 250 ms by default).
 */
const preflight = apiHandler(
  async (request: Request) => {
    const input = showCreateSchema.parse(await readJsonBody(request));
    return withRequestScope(async ({ cradle }) => ({ data: await cradle.showService.preflight(input) }));
  },
  { gate: requireAdminApi },
);

export async function POST(request: Request) {
  await connection();
  return preflight(request);
}
