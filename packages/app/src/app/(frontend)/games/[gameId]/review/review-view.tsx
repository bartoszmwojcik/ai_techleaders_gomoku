"use client";

import { clampReviewStep, type GameReview } from "@gomoku/core";
import { Board } from "@gomoku/ui/game/board";
import { Button } from "@gomoku/ui/game/button";
import { GameResultBanner } from "@gomoku/ui/game/game-result-banner";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useState } from "react";

import { PlayerLabel } from "@/components/games/player-label";
import { formatFinishedAt } from "@/lib/format-date-time";
import { REASON_LABEL } from "@/lib/games/history";
import { cellLabel, playerNameOf } from "@/lib/games/play";
import { COLOR_TITLE, lastMoveAt, reviewOutcomeOf, stepStatus, stonesAt, winLineAt } from "@/lib/games/review";

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
  const outcome = reviewOutcomeOf(review);

  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Przegląd partii</h1>
      <GameResultBanner result={outcome.result} title={outcome.title}>
        {REASON_LABEL[review.result.reason]}. {outcome.detail}
      </GameResultBanner>
      <p className="m-0 text-meta text-text-muted" data-testid="review-finished-at">
        Zakończona: {formatFinishedAt(review.finishedAt)}
      </p>
      <ul className="m-0 flex list-none flex-col gap-group p-0" aria-label="Gracze" data-testid="review-players">
        {review.players.map((player) => (
          <li key={player.seat} className="text-body">
            {COLOR_TITLE[player.seat === review.blackSeat ? "black" : "white"]}:{" "}
            <PlayerLabel name={playerNameOf(player)} you={player.seat === review.viewerSeat} />
          </li>
        ))}
      </ul>
      <Board
        label="Plansza 15 na 15"
        cellLabel={cellLabel}
        stones={stonesAt(review, step)}
        lastMove={lastMoveAt(review, step)}
        winLine={winLineAt(review, step)}
        readOnly
      />
      <p role="status" className="m-0 text-body text-text-secondary" data-testid="review-step">
        {stepStatus(review, step)}
      </p>
      <div className="grid grid-cols-2 gap-group sm:grid-cols-4" role="group" aria-label="Przechodzenie po ruchach">
        <Button variant="secondary" onClick={() => go(0)} disabled={step === 0} data-testid="review-start">
          Początek
        </Button>
        <Button variant="secondary" onClick={() => go(step - 1)} disabled={step === 0} data-testid="review-prev">
          Poprzedni
        </Button>
        <Button variant="secondary" onClick={() => go(step + 1)} disabled={step === total} data-testid="review-next">
          Następny
        </Button>
        <Button variant="secondary" onClick={() => go(total)} disabled={step === total} data-testid="review-end">
          Koniec
        </Button>
      </div>
      <TextLink href={back.href} placement="standalone">
        {back.label}
      </TextLink>
    </main>
  );
}
