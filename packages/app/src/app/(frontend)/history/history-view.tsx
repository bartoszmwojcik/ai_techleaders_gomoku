"use client";

import type { HistoryPage } from "@gomoku/core";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { HistoryList, HistoryRow } from "@gomoku/ui/game/history-list";
import { Panel } from "@gomoku/ui/game/panel";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRef, useState } from "react";

import { CreateGameButton } from "@/components/games/create-game-button";
import { PlayerLabel } from "@/components/games/player-label";
import { apiCall } from "@/lib/api-client";
import { formatFinishedAt } from "@/lib/format-date-time";
import { opponentNameOf, REASON_LABEL, RESULT_LABEL } from "@/lib/games/history";

type Problem = "signed-out" | "failed";

/**
 * `/history` (E04-S01): the first page arrives from the server, "Pokaż starsze" appends the next
 * ones. The row is not a link: replaying a game is out of scope.
 */
export function HistoryView({ initial }: { initial: HistoryPage }) {
  const [entries, setEntries] = useState(initial.entries);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Said to assistive technology after a page was appended; the new rows are not announced one by one.
  const [added, setAdded] = useState(0);
  // State alone lags a double click by one render; the ref closes that gap (the same page twice).
  const inFlight = useRef(false);

  async function onMore() {
    if (inFlight.current || nextCursor === null) return;
    inFlight.current = true;
    setLoading(true);
    setProblem(null);
    const result = await apiCall<HistoryPage>(`/api/history?cursor=${encodeURIComponent(nextCursor)}`, {
      method: "GET",
    });
    inFlight.current = false;
    setLoading(false);
    if (!result.ok) {
      setProblem(result.error.code === "UNAUTHORIZED" ? "signed-out" : "failed");
      return;
    }
    setEntries((current) => [...current, ...result.data.entries]);
    setNextCursor(result.data.nextCursor);
    setAdded(result.data.entries.length);
  }

  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Historia partii</h1>
      <Panel title="Zakończone partie">
        {entries.length === 0 ? (
          <EmptyState
            title="Nie rozegrałeś jeszcze żadnej partii"
            action={<CreateGameButton heldGame={null} />}
          >
            Zagraj ze znajomym albo wybierz przeciwnika w lobby, a zakończone partie pojawią się tutaj.
          </EmptyState>
        ) : (
          <HistoryList label="Zakończone partie">
            {entries.map((entry) => (
              <HistoryRow
                key={entry.gameId}
                opponent={<PlayerLabel name={opponentNameOf(entry.opponent)} />}
                result={entry.result}
                resultLabel={RESULT_LABEL[entry.result]}
                date={formatFinishedAt(entry.finishedAt)}
                reason={REASON_LABEL[entry.reason]}
              />
            ))}
          </HistoryList>
        )}
        <p className="sr-only" role="status" aria-live="polite" data-testid="history-added">
          {added > 0 ? `Dodano ${added} starszych partii.` : ""}
        </p>
        {problem === "signed-out" && (
          <Alert status="warning" title="Sesja wygasła" role="alert">
            <TextLink href="/login?next=%2Fhistory">Zaloguj się ponownie</TextLink>, żeby zobaczyć starsze partie.
          </Alert>
        )}
        {problem === "failed" && (
          <Alert status="danger" title="Nie udało się wczytać starszych partii" role="alert">
            Sprawdź połączenie z internetem i spróbuj ponownie.
          </Alert>
        )}
        {nextCursor !== null && (
          <div className="mt-stack">
            <Button variant="secondary" loading={loading} onClick={() => void onMore()} data-testid="history-more">
              {problem === "failed" ? "Spróbuj ponownie" : "Pokaż starsze"}
            </Button>
          </div>
        )}
      </Panel>
      <TextLink href="/" placement="standalone">
        Wróć na stronę główną
      </TextLink>
    </main>
  );
}
