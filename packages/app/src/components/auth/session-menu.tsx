import { connection } from "next/server";

import { getCurrentUser } from "@/server/http/auth";

import { AccountMenu } from "./account-menu";

/** The right side of the top bar: the menu of the signed-in player, nothing for a guest. */
export async function SessionMenu() {
  // Reads the session cookie and the database, so it renders per request.
  await connection();
  const user = await getCurrentUser();
  return user && <AccountMenu displayName={user.displayName} />;
}
