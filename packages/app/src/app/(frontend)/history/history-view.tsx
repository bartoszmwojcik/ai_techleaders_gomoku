"use client";

import type { HistoryPage } from "@gomoku/core";
import { Alert } from "@gomoku/ui/game/alert";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { HistoryList, HistoryRow } from "@gomoku/ui/game/history-list";
import { LoadMore } from "@gomoku/ui/game/load-more";
import { Panel } from "@gomoku/ui/game/panel";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRef, useState } from "react";

import { CreateGameButton } from "@/components/games/create-game-button";
import { PlayerLabel } from "@/components/games/player-label";
import plCommon from "@/i18n/catalogs/pl/common";
import plHistory from "@/i18n/catalogs/pl/history";
import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { apiCall } from "@/lib/api-client";
import { formatFinishedAt } from "@/lib/format-date-time";
import { historyDetailOf, opponentNameOf, resultLabel } from "@/lib/games/history";

type Problem = "signed-out" | "failed";

/**
 * `/history` (E04-S01): the first page arrives from the server, "Pokaż starsze" appends the next
 * ones. Each row links to the review of the game (E09-S01).
 */
type Props = TextsProps<"history"> & {
  initial: HistoryPage;
  /** The `common` namespace (the opponents' names) and `home` (the settings, the create button); nothing in Polish. */
  commonTexts?: TextsProps<"common">;
  homeTexts?: TextsProps<"home">;
};

export function HistoryView({ initial, commonTexts = {}, homeTexts = {}, ...texts }: Props) {
  const t = textsOf<"history">(plHistory, texts);
  const common = textsOf<"common">(plCommon, commonTexts);
  const home = textsOf<"home">(plHome, homeTexts);
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
      <h1 className="m-0 text-section font-strong">{t("heading")}</h1>
      <Panel title={t("listTitle")}>
        {entries.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            action={<CreateGameButton heldGame={null} {...homeTexts} />}
          >
            {t("emptyBody")}
          </EmptyState>
        ) : (
          <HistoryList label={t("listTitle")}>
            {entries.map((entry) => (
              <HistoryRow
                key={entry.gameId}
                opponent={<PlayerLabel name={opponentNameOf(entry.opponent, common)} t={common} />}
                result={entry.result}
                resultLabel={resultLabel(entry.result, t)}
                date={formatFinishedAt(entry.finishedAt, t.locale)}
                reason={historyDetailOf(entry, t, home)}
                action={
                  <TextLink href={`/games/${entry.gameId}/review`} data-testid="history-review">
                    {t("review")}
                  </TextLink>
                }
              />
            ))}
          </HistoryList>
        )}
        <p className="sr-only" role="status" aria-live="polite" data-testid="history-added">
          {added > 0 ? t("added", { count: added }) : ""}
        </p>
        {problem === "signed-out" && (
          <Alert status="warning" title={t("sessionExpired")} role="alert">
            {withNodes(t("signedOut", { link: "{link}" }), {
              link: <TextLink href="/login?next=%2Fhistory">{t("loginAgain")}</TextLink>,
            })}
          </Alert>
        )}
        {nextCursor !== null && (
          <div className="mt-stack">
            <LoadMore
              status={loading ? "loading" : problem === "failed" ? "error" : "idle"}
              onLoadMore={() => void onMore()}
              data-testid="history-more"
              label={t("more")}
              retryLabel={t("retry")}
              errorTitle={t("moreFailedTitle")}
              errorMessage={t("moreFailedBody")}
            />
          </div>
        )}
      </Panel>
      <TextLink href="/" placement="standalone">
        {t("backHome")}
      </TextLink>
    </main>
  );
}
