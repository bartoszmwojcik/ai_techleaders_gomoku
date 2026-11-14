import { StatusBadge } from "@gomoku/ui/game/status-badge";

import { PL_GAME, type GameTranslator } from "@/lib/games/play";

type Props = {
  /** The audience of the game now; absent while the game is private, not in progress, or its audience is closed (BR-43). */
  audience?: { spectators: number };
  /** The `game` namespace of the reader; Polish by default. */
  t?: GameTranslator;
};

/**
 * The flag "Partia publiczna" with the number of spectators watching (E10-S04, BR-45), for the players
 * and for the spectators. Nothing without an audience: a private game, a game that is over, or a game
 * whose creator closed the audience shows no flag at all.
 */
export function PublicFlag({ audience, t = PL_GAME }: Props) {
  if (!audience) return null;
  return (
    <div data-testid="public-flag">
      <StatusBadge>
        {/* One flex item, so the label and the number read (and copy) as one line. */}
        <span>
          {t("audience.publicFlag")}
          <span data-testid="public-flag-count">{audience.spectators}</span>
        </span>
      </StatusBadge>
    </div>
  );
}
