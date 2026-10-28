import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { useState } from "react";

import { go } from "../chrome";
import { logout, useSim, viewer } from "../sim";

/** "Wyloguj" on s04 and s05 (owner decision 2026-10-27: the button is also on the home page). */
export function SignOutButton() {
  const sim = useSim();
  const account = viewer(sim);
  const [asking, setAsking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // s05.3: the button shows the wait. The session ends in this browser even when the server errs (s05.5, map L20).
  async function signOut() {
    setSigningOut(true);
    await logout();
    setSigningOut(false);
    setAsking(false);
    go("s04");
  }

  return (
    <>
      <Button variant="secondary" loading={signingOut} onClick={() => (account?.activeGame ? setAsking(true) : void signOut())}>Wyloguj</Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        tone="primary"
        title="Wylogować?"
        description="Trwa partia — po wylogowaniu zegar biegnie dalej. Wylogować?"
        confirmLabel="Wyloguj"
        cancelLabel="Zostań zalogowany"
        confirming={signingOut}
        onConfirm={() => void signOut()}
      />
    </>
  );
}
