import { displayNameChangeSchema } from "@gomoku/core";
import { connection } from "next/server";

import { withRequestScope } from "@/server/container";
import { apiHandler, readJsonBody } from "@/server/http/api-handler";
import { requireSession } from "@/server/http/auth";

/** 20 attempts per hour and account; a request refused by validation spends none (Q4). */
export const DISPLAY_NAME_CHANGE_LIMIT = 20;
export const DISPLAY_NAME_CHANGE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Renames the signed-in user (E05-S01), at most once per 24 h. Order: session (401), input (400,
 * no attempt spent), the per-account counter (429), then the service, whose answers are 400 for
 * the current name, 409 for a taken one and 429 `DISPLAY_NAME_COOLDOWN` inside the window.
 */
const changeDisplayName = apiHandler(async (request) => {
  const user = await requireSession();
  const { displayName } = displayNameChangeSchema.parse(await readJsonBody(request));
  return withRequestScope(async ({ cradle }) => {
    await cradle.rateLimiter.hit(
      `display-name-change:user:${user.id}`,
      DISPLAY_NAME_CHANGE_LIMIT,
      DISPLAY_NAME_CHANGE_WINDOW_MS,
    );
    const name = await cradle.userService.changeDisplayName(user.id, displayName);
    return { data: { displayName: name }, status: 200 };
  });
});

export async function PATCH(request: Request) {
  await connection();
  return changeDisplayName(request);
}
