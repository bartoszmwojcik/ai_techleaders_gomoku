import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

/**
 * What a spectator sees once the creator closed the audience (E10-S05, BR-43): no board, no chat,
 * only the reason. The code does not open the game again, so the way back is the home page.
 */
export function AudienceClosedScreen() {
  return (
    <main
      className="mx-auto flex w-full flex-1 max-w-(--layout-width-dialog) flex-col gap-stack px-panel py-section"
      data-testid="audience-closed"
    >
      <ErrorState
        title="Twórca zamknął publiczność"
        action={
          <TextLink href="/" placement="standalone">
            Wróć na stronę główną
          </TextLink>
        }
      >
        Ta partia nie jest już publiczna, więc nie można jej dalej oglądać.
      </ErrorState>
    </main>
  );
}
