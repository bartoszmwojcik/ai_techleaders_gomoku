import type { ReactNode } from "react";

import type { PlayerName } from "@/lib/games/play";

type Props = {
  name: PlayerName;
  /** The viewer's own label: "Ty (Ala_7)" for an account, "Ty: {nick} (gość)" for a guest. */
  you?: boolean;
};

/**
 * A participant's name on one line. A guest's nickname is cut with an ellipsis when it does not fit,
 * while "(gość)" stays visible and never shrinks (L30); the full label is in `title` and in the
 * text itself, so assistive technology reads it all.
 *
 * LUKA D09: Zegar gracza takes `name` as a node, but the design system has no story or rule for a
 * 24-character nickname plus the suffix at 320 px; this wrapper belongs to the page.
 */
export function PlayerLabel({ name, you = false }: Props): ReactNode {
  if (!name.guest) return you ? `Ty (${name.nick})` : name.nick;
  return (
    <span className="flex min-w-0 max-w-full items-baseline" title={name.label} data-testid="player-name">
      {you && <span className="shrink-0 whitespace-pre">Ty: </span>}
      <span className="min-w-0 truncate">{name.nick}</span>
      <span className="shrink-0 whitespace-pre"> (gość)</span>
    </span>
  );
}
