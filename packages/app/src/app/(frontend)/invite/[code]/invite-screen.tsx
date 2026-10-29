import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";

import type { InvitationView } from "@/server/http/invitation-view";

import { JoinActions } from "./join-actions";

type Props = {
  /** The invitation code in its display form, `ABCD-EFGH`. */
  code: string;
  /** Any view except `redirect`, which the page handles before rendering. */
  view: Exclude<InvitationView, { kind: "redirect" }>;
};

function heading(view: Props["view"]): string {
  if (view.kind === "invalid") return "To zaproszenie jest już nieważne";
  if (view.kind === "limit") return "Zaproszenie do partii";
  // The creator account may be gone, or the page cannot name it: a neutral word, never a guess.
  return `${view.creatorName ?? "Gracz"} zaprasza Cię do partii Gomoku`;
}

/** s07: the invitation page in each of its states (map s07.1-s07.9). */
export function InviteScreen({ code, view }: Props) {
  const open = view.kind !== "invalid" && view.kind !== "limit";
  return (
    <main
      className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section"
      data-testid="invite-page"
      data-state={view.kind}
    >
      <h1 className="m-0 text-section font-strong">{heading(view)}</h1>
      {open && (
        <p className="m-0 text-meta text-text-muted">
          Kod zaproszenia: {code}. Swobodne zasady · plansza 15×15 · 10 minut na gracza.
        </p>
      )}

      {view.kind === "joinable" && <JoinActions code={code} mode={view.signedIn ? "member" : "visitor"} />}

      {view.kind === "has-active-game" && (
        <>
          <Alert status="warning" title="Masz już partię">
            Możesz grać tylko jedną partię naraz. Dokończ ją, zanim dołączysz do kolejnej.
          </Alert>
          <TextLink href={`/games/${view.gameId}`} placement="standalone">
            Wróć do swojej partii
          </TextLink>
        </>
      )}

      {view.kind === "has-own-waiting-game" && (
        <>
          <Alert status="warning" title="Masz oczekującą partię">
            Żeby dołączyć do tej, musisz najpierw anulować swoją.
          </Alert>
          <JoinActions code={code} mode="swap" />
          <TextLink href={`/games/${view.gameId}`} placement="standalone">
            Wróć do swojej partii
          </TextLink>
        </>
      )}

      {view.kind === "limit" && (
        <Alert status="danger" title="Zbyt wiele prób — spróbuj za chwilę">
          Sprawdź kod albo wróć później.
        </Alert>
      )}

      {view.kind === "invalid" && (
        <>
          <Alert status="danger" title="Zaproszenie nie działa">
            Użyte, wygasłe albo anulowane. Poproś o nowe zaproszenie albo wpisz inny kod.
          </Alert>
          <div className="flex flex-wrap items-center gap-group">
            <Button asChild variant="secondary">
              <a href="/join">Masz kod?</a>
            </Button>
            <TextLink href="/" placement="standalone">
              Wróć na stronę główną
            </TextLink>
          </div>
        </>
      )}
    </main>
  );
}
