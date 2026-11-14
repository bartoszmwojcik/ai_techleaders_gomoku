import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

import { PL_GAME, type GameTranslator } from "@/lib/games/play";

/**
 * p07.2, p07.3: the one answer for a game that does not exist and for a game the visitor does
 * not play in (a stranger, a guest in another browser, a guest after the hour): the page never
 * says which one it is (#21 Edge Cases, N-05).
 */
export function GameGate({ t = PL_GAME }: { t?: GameTranslator }) {
  return (
    <ErrorState
      title={t("gate.title")}
      action={
        <TextLink href="/" placement="standalone">
          {t("shared.backHome")}
        </TextLink>
      }
    >
      {t("gate.body")}
    </ErrorState>
  );
}
