import { emailChangeConfirmSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";

/**
 * Applies an e-mail change with the link token (E05-S01). No session is needed (the token proves
 * access to the new mailbox) and the call does not log anyone in; every session of the account
 * ends. The token is single-use, so there is no attempt counter.
 */
const confirm = apiHandler(async (request) => {
  const { token } = emailChangeConfirmSchema.parse(await readJsonBody(request));
  await withRequestScope(({ cradle }) => cradle.emailChangeService.confirm(token));
  return { data: null, status: 200 };
});

export async function POST(request: Request) {
  await connection();
  return confirm(request);
}
