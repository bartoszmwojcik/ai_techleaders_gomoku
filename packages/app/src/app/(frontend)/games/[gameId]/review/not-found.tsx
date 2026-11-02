import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

// Rendered by `notFound()` in the page. One text for a game that is missing, one removed after the
// retention period (`db:cleanup`) and one that is not the visitor's: it never says which (N-05).
export default function ReviewNotFound() {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <ErrorState
        title="Nie możemy otworzyć tej partii"
        action={
          <TextLink href="/history" placement="standalone">
            Wróć do historii
          </TextLink>
        }
      >
        Partia nie istnieje, została usunięta po okresie przechowywania albo nie masz do niej dostępu.
      </ErrorState>
    </main>
  );
}
