"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";

import { countdownOf, type ShowTranslator } from "@/lib/show/texts";

import type { DriveStatus } from "./use-show-drive";

type Props = {
  status: DriveStatus;
  /** What is left on the clock of the side on turn; `null` when no clock runs. */
  clockMs: number | null;
  checking: boolean;
  onCheck: () => void;
  t: ShowTranslator;
};

/**
 * The drive indicator above the board (show-mode, "UI/UX"): a quiet "Napęd działa", a slowing drive in between, and
 * a `danger` alert "Napęd zatrzymany" with its reason, what it means for the clock and "Sprawdź teraz". A stop does
 * not end the show: the clock keeps running and the game ends on time.
 */
export function DriveIndicator({ status, clockMs, checking, onCheck, t }: Props) {
  if (status.state === "off") return null;
  if (status.state === "running") {
    return (
      <p className="m-0 text-meta text-text-secondary" data-testid="show-drive" data-state="running">
        {t("room.drive.running")}
      </p>
    );
  }
  if (status.state === "slowed") {
    return (
      <div data-testid="show-drive" data-state="slowed">
        <Alert status="warning" role="status" title={t("room.drive.slowed")} />
      </div>
    );
  }
  const check = (
    <Button variant="secondary" loading={checking} onClick={onCheck} data-testid="show-drive-check">
      {t("room.drive.check")}
    </Button>
  );
  const seconds = Math.floor(status.silentMs / 1000);
  const reason =
    status.reason === "silent"
      ? t("room.drive.reason.silent", { count: seconds, seconds: t.number(seconds) })
      : t(`room.drive.reason.${status.reason}`);
  return (
    <div data-testid="show-drive" data-state="stalled" data-reason={status.reason}>
      {/* Announced once per reason: the visible alert below counts seconds, which a live region would re-read every tick. */}
      <p role="alert" className="sr-only" data-testid="show-drive-announcement">
        {t("room.drive.stalledBecause", { reason: t(`room.drive.announce.${status.reason}`) })}
      </p>
      <Alert status="danger" role="none" title={t("room.drive.stalledBecause", { reason })}>
        <div className="flex flex-col items-start gap-group">
          <p className="m-0">{t(`room.drive.hint.${status.reason}`)}</p>
          {clockMs !== null && <p className="m-0">{t("room.drive.clock", { time: countdownOf(t, clockMs) })}</p>}
          {check}
        </div>
      </Alert>
    </div>
  );
}
