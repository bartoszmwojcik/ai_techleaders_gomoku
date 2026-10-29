import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

import { Main, SiteHeader } from "../chrome";
import { useSim } from "../sim";
import { useStateId } from "../stateId";

// p07.2 and p07.3 in the part the invitation stage needs: the player has no game to open, and the page
// does not say whether the game exists (N-05, #21 Edge Cases). The rest of p07 (skeleton, database down) is stage B.
export function GameGate({ screen }: { screen: "p03" | "p04" }) {
  const sim = useSim();
  // A guest token lives in the browser that joined (T5); another browser (T6) gets the same page while the clock runs on (BR-06).
  const stateId = sim.role === "T6" && sim.guestGame !== null ? "p07.3" : "p07.2";
  useStateId(screen, stateId);
  return (
    <>
      <SiteHeader />
      <Main state={stateId}>
        <ErrorState
          title="Ta partia nie istnieje albo nie masz do niej dostępu"
          action={<TextLink href="#p01" placement="standalone">Wróć na stronę główną</TextLink>}
        >
          Sprawdź adres albo poproś znajomego o nowe zaproszenie.
        </ErrorState>
      </Main>
    </>
  );
}
