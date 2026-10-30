import { Button } from "@gomoku/ui/game/button";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useState } from "react";

import { Main, SiteHeader, useScreenEnter } from "../chrome";
import { anyGuestToken, getSim, guestTokenValid, LOAD_DELAY, tokenOf, useSim, type GameScreenId, type Sim } from "../sim";

// p07 Brak dostępu i błędy `/games/{id}` (map p07.1–p07.4, plus p06.7 for a guest whose token ran out). Every game
// screen shows one of these instead of its content when the page cannot be shown.

export type GateKind = "none" | "gate" | "db" | "loading";

/** Why the game page cannot be shown now: loading (p07.1), database down (p07.4), no access (p07.2, p07.3, p06.7). */
export function useGameBlock(screen: string, route: GameScreenId | null): GateKind {
  const sim = useSim();
  const [loading, setLoading] = useState(false);
  useScreenEnter(screen, () => {
    if (getSim().scenario.slowLoad) setLoading(true);
  });
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), LOAD_DELAY);
    return () => clearTimeout(timer);
  }, [loading]);
  // The redirect to the right screen of this game is under way: that screen shows its own state.
  if (route !== null && route !== screen) return "none";
  if (loading) return "loading";
  if (sim.scenario.dbDown) return "db";
  return route === null ? "gate" : "none";
}

/** The map state of a blocked page. A guest in another browser sees the same 404, but the clock runs on (BR-06). */
export function gateStateId(sim: Sim, kind: Exclude<GateKind, "none">): string {
  if (kind === "loading") return "p07.1";
  if (kind === "db") return "p07.4";
  if (sim.role === "T6" && anyGuestToken(sim)) return "p07.3";
  const token = tokenOf(sim);
  const game = token ? sim.games.find((g) => g.id === token.game) : undefined;
  // L29 (resolved 2026-10-30): an expired guest invitation shows "Zaproszenie wygasło" for 1 h, then this 404.
  if (game && !guestTokenValid(sim, game) && game.opponent !== null) return "p06.7";
  return "p07.2";
}

export function GameGate({ kind }: { kind: Exclude<GateKind, "none"> }) {
  const sim = useSim();
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [sim.epoch]);
  const stateId = gateStateId(sim, kind);
  return (
    <>
      <SiteHeader />
      <Main state={stateId}>
        {kind === "loading" && (
          <SkeletonRegion label="Ładowanie partii" className="max-w-(--layout-width-board) gap-stack">
            <Skeleton className="h-target" />
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-target" />
          </SkeletonRegion>
        )}
        {kind === "db" && (
          <ErrorState
            title="Nie udało się połączyć z serwerem. Spróbuj ponownie."
            action={
              <div className="flex flex-wrap items-center gap-group">
                <Button onClick={() => setTried(true)}>Spróbuj ponownie</Button>
                <TextLink href="#p01" placement="standalone">Wróć na stronę główną</TextLink>
              </div>
            }
          >
            Nie wiemy, czy ta partia istnieje: baza danych nie odpowiada.
          </ErrorState>
        )}
        {kind === "db" && tried && <p role="status" className="m-0 text-meta text-text-secondary">Spróbowano ponownie: serwer nadal nie odpowiada.</p>}
        {kind === "gate" && (
          // The page does not say whether the game exists (N-05, #21 Edge Cases).
          <ErrorState
            title="Ta partia nie istnieje albo nie masz do niej dostępu"
            action={<TextLink href="#p01" placement="standalone">Wróć na stronę główną</TextLink>}
          >
            Sprawdź adres albo poproś znajomego o nowe zaproszenie.
          </ErrorState>
        )}
      </Main>
    </>
  );
}
