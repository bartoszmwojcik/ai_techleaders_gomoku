import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

/**
 * p07.2, p07.3: the one answer for a game that does not exist and for a game the visitor does
 * not play in (a stranger, a guest in another browser, a guest after the hour): the page never
 * says which one it is (#21 Edge Cases, N-05).
 */
export function GameGate() {
  return (
    <ErrorState
      title="Ta partia nie istnieje albo nie masz do niej dostępu"
      action={
        <TextLink href="/" placement="standalone">
          Wróć na stronę główną
        </TextLink>
      }
    >
      Sprawdź adres albo poproś znajomego o nowe zaproszenie.
    </ErrorState>
  );
}
