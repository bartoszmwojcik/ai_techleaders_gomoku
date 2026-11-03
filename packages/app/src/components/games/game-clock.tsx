import { isLow } from "@gomoku/core/games/clock";
import { PlayerClock } from "@gomoku/ui/game/player-clock";
import type { ReactNode } from "react";

type Props = {
  name: ReactNode;
  remainingMs: number;
  /** This player's clock is running. */
  active: boolean;
  activeLabel: string;
  /** The clock budget of the game; sets the "mało czasu" threshold (a minute, at most a quarter of it). */
  timeControlMs?: number;
};

/**
 * Zegar gracza with the "mało czasu" variant below one minute (#23 Q1, L07): a bright colour and a thicker
 * outline, no visible text and no sound. LUKA D04: the component only knows a text label for low time,
 * so the variant is this wrapper (`.low-clock` in `frontend.css`, tokens only), as in the approved
 * prototype; the announcement for screen readers is a hidden live region in `PlayField`.
 */
export function GameClock({ name, remainingMs, active, activeLabel, timeControlMs }: Props) {
  return (
    <div className="low-clock" data-slot="clock" data-low={isLow(remainingMs, timeControlMs) || undefined}>
      <PlayerClock name={name} remainingMs={remainingMs} active={active} activeLabel={activeLabel} />
    </div>
  );
}
