import { useState } from "react";

import { apiCall } from "@/lib/api-client";
import { fullPageLoad } from "@/lib/full-page-load";

/** The logout request behind every "Wyloguj": `signOut` resolves to `false` when the player is still signed in. */
export function useSignOut() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut(): Promise<boolean> {
    setPending(true);
    setFailed(false);
    const result = await apiCall("/api/auth/logout");
    // A 500 means the database failed to revoke the session, but the server has already
    // cleared the cookie, so this browser is logged out all the same (login-logout L1).
    if (result.ok || result.error.code === "INTERNAL") {
      // A full load: the bar in the shared layout must render anew without the session. Stay pending
      // while the page navigates, so a second click is impossible.
      fullPageLoad("/");
      return true;
    }
    setPending(false);
    setFailed(true);
    return false;
  }

  return { pending, failed, signOut };
}
