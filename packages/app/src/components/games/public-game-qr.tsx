import { Panel } from "@gomoku/ui/game/panel";
import { QrCode } from "@gomoku/ui/game/qr-code";

import { PL_GAME, type GameTranslator } from "@/lib/games/play";

/** Where the page reads the QR code of a game's invitation link (`GET /api/games/[id]/qr`). */
export const inviteQrPath = (gameId: string) => `/api/games/${gameId}/qr`;

type Props = {
  gameId: string;
  /** The audience of the game now; absent while the game is private, not in progress, or its audience is closed (BR-43). */
  audience?: { spectators: number };
  /** The `game` namespace of the reader; Polish by default. */
  t?: GameTranslator;
};

/**
 * The QR code that opens watching a public game in progress (BR-53), for the players and the
 * spectators (Q-22: the agent's proposal, to be confirmed). It follows the flag "Partia publiczna":
 * closing the audience takes both away at the next read.
 */
export function PublicGameQr({ gameId, audience, t = PL_GAME }: Props) {
  if (!audience) return null;
  return (
    <Panel title={t("audience.qrTitle")}>
      <QrCode src={inviteQrPath(gameId)} label={t("audience.qrLabel")} caption={t("audience.qrCaption")} />
    </Panel>
  );
}
