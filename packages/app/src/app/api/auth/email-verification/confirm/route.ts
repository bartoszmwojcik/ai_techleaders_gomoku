import { emailVerificationConfirmSchema, safeNextPath } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";

/**
 * Confirms the e-mail of the account the token belongs to. No session is needed (the token
 * proves access to the mailbox, Q5) and the call does not log anyone in. The token is
 * single-use, so there is no attempt counter (spec: confirm has only 200/400/403);
 * `next` is only echoed back after `safeNextPath`.
 */
const confirm = apiHandler(async (request) => {
  const { token, next } = emailVerificationConfirmSchema.parse(
    await readJsonBody(request),
  );
  await withRequestScope(({ cradle }) =>
    cradle.emailVerificationService.confirm(token),
  );
  return { data: { next: safeNextPath(next) }, status: 200 };
});

export async function POST(request: Request) {
  await connection();
  return confirm(request);
}
