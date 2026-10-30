import { PlayerClock } from "@gomoku/ui/game/player-clock";
import type { StoneColor } from "@gomoku/ui/game/board";

import type { ReactNode } from "react";

import { moverOf, playerName, remainingMs, type Game, type PlayerName, type Play, type Sim, type StoneSide } from "../sim";

// Pieces shared by the screens of a game in progress (p05) and of a finished one (p06).

export const COLOR_NAME: Record<StoneColor, string> = { black: "czarne", white: "białe" };
/** "Grasz czarnymi", "zagrasz białymi". */
export const COLOR_PLAYS: Record<StoneColor, string> = { black: "czarnymi", white: "białymi" };

/** Names of the viewer and of the opponent: a nickname or "Gracz N" with "(gość)" for a guest (nick Q3, replaces L14). */
export function playerNames(_sim: Sim, game: Game, side: StoneSide): { mine: PlayerName; theirs: PlayerName } {
  return { mine: playerName(game, side), theirs: playerName(game, side === "creator" ? "opponent" : "creator") };
}

/**
 * A player's name on one line. A guest's nickname is cut with an ellipsis when it does not fit, and the suffix "(gość)" is
 * always visible and never shrinks (L30); the full name is in `title` and in the text, so assistive technology reads it all.
 * LUKA D09: Zegar gracza takes `name` as a node, but there are no stories or rules for a 24-character nickname plus the
 * suffix on 320 px; this wrapper is the page's own.
 */
export function PlayerLabel({ name, you = false }: { name: PlayerName; you?: boolean }): ReactNode {
  if (!name.guest) return you ? `Ty (${name.nick})` : name.nick;
  return (
    <span className="flex min-w-0 max-w-full items-baseline" title={name.label} data-testid="player-name" data-assumption="L30">
      {you && <span className="shrink-0 whitespace-pre">Ty: </span>}
      <span className="min-w-0 truncate">{name.nick}</span>
      <span className="shrink-0 whitespace-pre"> (gość)</span>
    </span>
  );
}

type GameClockProps = {
  sim: Sim;
  play: Play;
  side: StoneSide;
  name: ReactNode;
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
