import { cookies } from "next/headers";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler } from "@/server/http/api-handler";
import { clearSessionCookie, sessionCookieName } from "@/server/http/auth";

/**
 * Logs out the current session only (Q3). Idempotent: without a cookie, or with an
 * unknown or expired session, the answer is still `200`. The cookie is removed even when
 * the database fails (the revocation is best effort, the session row expires on its own).
 */
const logout = apiHandler(async () => {
  return withRequestScope(async ({ cradle }) => {
    try {
      const token = (await cookies()).get(
        sessionCookieName(cradle.serverConfig),
      )?.value;
      if (token) await cradle.sessionService.revoke(token);
    } finally {
      await clearSessionCookie(cradle.serverConfig);
    }
    return { data: null, status: 200 };
  });
});

export async function POST(request: Request) {
  await connection();
  return logout(request);
}
