import { PlayerClock } from "@gomoku/ui/game/player-clock";
import type { StoneColor } from "@gomoku/ui/game/board";

import { moverOf, nameOf, opponentName, remainingMs, viewer, type Game, type Play, type Sim, type StoneSide } from "../sim";

// Pieces shared by the screens of a game in progress (p05) and of a finished one (p06).

export const COLOR_NAME: Record<StoneColor, string> = { black: "czarne", white: "białe" };
/** "Grasz czarnymi", "zagrasz białymi". */
export const COLOR_PLAYS: Record<StoneColor, string> = { black: "czarnymi", white: "białymi" };

/** Names for the two clocks: the opponent of a guest is "Gość", a guest himself has no name (L14, BR-24). */
export function playerNames(sim: Sim, game: Game, side: StoneSide): { mine: string; theirs: string } {
  const account = viewer(sim);
  return side === "creator"
    ? { mine: nameOf(game.creator), theirs: opponentName(game) }
    : { mine: account ? account.name : "Gość", theirs: nameOf(game.creator) };
}

type GameClockProps = {
  sim: Sim;
  play: Play;
  side: StoneSide;
  name: string;
  /** Word shown on the running clock (never colour alone). */
  activeLabel: string;
};

/**
 * Zegar gracza with the "mało czasu" variant below one minute (#23 Q1, L07): bright colour and a thicker outline, no
 * visible text and no sound. LUKA D04: the component only knows a text label for low time, so the variant is a wrapper
 * (`.low-clock` in styles.css, tokens only); the announcement is a hidden live region on the page.
 */
export function GameClock({ sim, play, side, name, activeLabel }: GameClockProps) {
  const ms = remainingMs(sim, play, side);
  const running = !play.result && moverOf(play) === side;
  return (
    <div className="low-clock" data-low={ms < 60_000 || undefined} data-testid={`clock-${side}`}>
      <PlayerClock name={name} remainingMs={ms} active={running} activeLabel={activeLabel} />
    </div>
  );
}
