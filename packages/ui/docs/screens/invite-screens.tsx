import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";

import { Screen, type Viewer } from "./screen";

export type InviteState =
  | "visitor"
  | "player-confirmed"
  | "player-unconfirmed"
  | "guest-warning"
  | "has-other-game"
  | "has-waiting-game"
  | "limited"
  | "invalid";

// /invite/[code]: nine states in the specification; "already a participant" and "own invitation" only redirect to the game.
export function InviteLanding({ state, viewer }: { state: InviteState; viewer: Viewer }) {
  return (
    <Screen viewer={viewer}>
      <div className="flex max-w-lg flex-col gap-stack">
        {state === "invalid" ? (
          <ErrorState title="To zaproszenie jest już nieważne">Poproś znajomego o nowy link albo kod.</ErrorState>
        ) : (
          <>
            <h1 className="m-0 text-section font-strong">Ala_7 zaprasza Cię do partii Gomoku</h1>
            {state === "visitor" && (
              <div className="flex flex-wrap gap-group">
                <Button>Zaloguj się</Button>
                <Button variant="secondary">Załóż konto</Button>
                <Button variant="secondary">Graj jako gość</Button>
              </div>
            )}
            {state === "player-confirmed" && <div><Button>Dołącz do partii</Button></div>}
            {state === "player-unconfirmed" && (
              <>
                <Alert title="Potwierdź e-mail, aby grać jako Bartek_1">Możesz też zagrać jako gość.</Alert>
                <div><Button variant="secondary">Graj jako gość</Button></div>
              </>
            )}
            {state === "guest-warning" && (
              <>
                <Alert status="warning" title="Grasz bez konta">
                  Nie zmieniaj przeglądarki w trakcie partii: stracisz do niej dostęp, a Twój zegar będzie biegł dalej. Gość nie ma nazwy ani historii.
                </Alert>
                <div><Button>Rozumiem, graj jako gość</Button></div>
              </>
            )}
            {state === "has-other-game" && (
              <>
                <Alert status="warning" title="Masz już partię">Możesz grać tylko jedną partię naraz.</Alert>
                <TextLink href="#partia" placement="standalone">Wróć do swojej partii</TextLink>
              </>
            )}
            {state === "has-waiting-game" && (
              <>
                <Alert status="warning" title="Masz oczekującą partię">Żeby dołączyć do tej, musisz najpierw anulować swoją.</Alert>
                <div><Button>Anuluj moją partię i dołącz</Button></div>
              </>
            )}
            {state === "limited" && <Alert status="danger" title="Zbyt wiele prób">Spróbuj za chwilę.</Alert>}
          </>
        )}
      </div>
    </Screen>
  );
}

export function JoinPage({ error }: { error?: string }) {
  return (
    <Screen viewer="player">
      <form noValidate className="flex max-w-sm flex-col gap-stack">
        <h1 className="m-0 text-section font-strong">Mam kod zaproszenia</h1>
        <Field label="Kod zaproszenia" hint="Wielkość liter nie ma znaczenia." error={error}>
          {(control) => <TextInput {...control} autoComplete="off" placeholder="ABCD-EFGH" defaultValue={error ? "ABCD" : ""} />}
        </Field>
        <div><Button type="submit">Dołącz</Button></div>
      </form>
    </Screen>
  );
}

