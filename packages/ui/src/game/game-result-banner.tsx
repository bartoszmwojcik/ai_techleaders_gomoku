import type { ReactNode } from "react";

import { Alert } from "./alert";

type GameResult = "win" | "loss" | "draw";

const STATUS_BY_RESULT = { win: "success", loss: "danger", draw: "info" } as const;

type GameResultBannerProps = {
  result: GameResult;
  /** The result in a word, e.g. "Wygrałeś", "Przegrałeś", "Remis" (required). */
  title: ReactNode;
  /** How it ended, e.g. "Pięć w linii" or "Skończył się czas". */
  children?: ReactNode;
  className?: string;
};

// A finished game is announced politely (role=status), also a loss. The word, icon and colour agree.
function GameResultBanner({ result, title, children, className }: GameResultBannerProps) {
  return (
    <Alert status={STATUS_BY_RESULT[result]} role="status" title={title} className={className}>
      {children}
    </Alert>
  );
}

export { GameResultBanner };
export type { GameResult, GameResultBannerProps };
