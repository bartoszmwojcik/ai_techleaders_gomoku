"use client";

import { clampReviewStep, type GameReview } from "@gomoku/core";
import { Alert } from "@gomoku/ui/game/alert";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { PaperMark } from "@gomoku/ui/game/paper-mark";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState } from "react";

import { PlayerLabel } from "@/components/games/player-label";
import plCommon from "@/i18n/catalogs/pl/common";
import plGame from "@/i18n/catalogs/pl/game";
import plHistory from "@/i18n/catalogs/pl/history";
import plReview from "@/i18n/catalogs/pl/review";
import { useT } from "@/i18n/context";
import { formatFinishedAt } from "@/lib/format-date-time";
import { reasonLabel } from "@/lib/games/history";
import { cellLabelOf, playerNameOf, sideWords } from "@/lib/games/play";
import { isPaperReview, lastMoveAt, reviewOutcomeOf, stepStatus, stonesAt, winLineAt } from "@/lib/games/review";

type Props = {
  review: GameReview;
  /** Where the reader came from: the history now, the code entry later (E09-S02). */
  back: { href: string; label: string };
};

/**
 * A finished game, move by move (E09-S01): the result, the board at the chosen step and the four
 * buttons start / previous / next / end. Everything is already in `review`, so stepping makes no
 * request. No chat (BR-34), no clocks (only the final ones are stored). The screen opens on the
 * final position, so the result and the winning line are in view at once.
 */
export function ReviewView({ review, back }: Props) {
  const total = review.moves.length;
  const [step, setStep] = useState(total);
  const go = (to: number) => setStep(clampReviewStep(to, total));
  const t = useT("review", plReview);
  const game = useT("game", plGame);
  const history = useT("history", plHistory);
  const common = useT("common", plCommon);
  const outcome = reviewOutcomeOf(review, game, common);
  const words = sideWords(review.variant, game);

  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{t("heading")}</h1>
      <GameResultBanner result={outcome.result} title={outcome.title}>
        {t("banner", { reason: reasonLabel(review.result.reason, history), detail: outcome.detail })}
      </GameResultBanner>
      <p className="m-0 text-meta text-text-muted" data-testid="review-finished-at">
        {t("finishedAt", { date: formatFinishedAt(review.finishedAt, t.locale) })}
      </p>
      <ul className="m-0 flex list-none flex-col gap-group p-0" aria-label={t("players")} data-testid="review-players">
        {review.players.map((player) => {
          const color = player.seat === review.blackSeat ? "black" : "white";
          return (
            <li key={player.seat} className="text-body">
              {isPaperReview(review) && <PaperMark framed color={color} className="mr-1" />}
              {t("playerLine", { side: words.title[color] })}
              <PlayerLabel name={playerNameOf(player, common)} you={player.seat === review.viewerSeat} t={common} />
            </li>
          );
        })}
      </ul>
      {isPaperReview(review) ? (
        // E11: the sheet of a paper game is not in the classic move log, so there is nothing to step through yet.
        <div data-testid="review-paper-note">
          <Alert status="info" title={t("paperTitle")} role="status">
            {t("paperBody")}
          </Alert>
        </div>
      ) : (
        <>
        <Board
          label={game("shared.boardLabel")}
          cellLabel={cellLabelOf(game)}
          stones={stonesAt(review, step)}
          lastMove={lastMoveAt(review, step)}
          winLine={winLineAt(review, step)}
          readOnly
        />
        <p role="status" className="m-0 text-body text-text-secondary" data-testid="review-step">
          {stepStatus(review, step, t)}
        </p>
        <div className="grid grid-cols-2 gap-group sm:grid-cols-4" role="group" aria-label={t("steps")}>
          <Button variant="secondary" onClick={() => go(0)} disabled={step === 0} data-testid="review-start">
            {t("start")}
          </Button>
          <Button variant="secondary" onClick={() => go(step - 1)} disabled={step === 0} data-testid="review-prev">
            {t("previous")}
          </Button>
          <Button variant="secondary" onClick={() => go(step + 1)} disabled={step === total} data-testid="review-next">
            {t("next")}
          </Button>
          <Button variant="secondary" onClick={() => go(total)} disabled={step === total} data-testid="review-end">
            {t("end")}
          </Button>
        </div>
        </>
      )}
      <TextLink href={back.href} placement="standalone">
        {back.label}
      </TextLink>
    </main>
  );
}
