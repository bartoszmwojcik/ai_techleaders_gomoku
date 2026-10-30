import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useEffect, useState, type FormEvent } from "react";

import { go, Main, SiteHeader, useScreenEnter } from "../chrome";
import { createGuestGame, liveGame, NICKNAME_ERROR, useSim, viewer, type GuestCreateResult } from "../sim";
import { useStateId } from "../stateId";
import { openGame } from "./p01-home";

// p08 Gość tworzy partię: nick i ostrzeżenie (map p08.1–p08.8; E02-S08 #95, E02-S07 #94; BR-29). Reached from the
// "Zagraj ze znajomym bez konta" button on the home page (p01.8). One screen, one click: the button sends
// `acknowledgedGuestWarning: true`. Texts: L25 (resolved 2026-10-30, with the line about 24 hours), L26, L32.

type Failure = Exclude<GuestCreateResult, { kind: "ok" }>;

export function P08GuestCreate() {
  const sim = useSim();
  const account = viewer(sim);
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [asking, setAsking] = useState(false);

  // The result of one try is not carried over to a Reset; the typed nickname stays across a failed try (p08.2).
  useEffect(() => {
    setNick("");
    setBusy(false);
    setFailure(null);
    setAsking(false);
  }, [sim.epoch]);
  useScreenEnter("p08", () => {
    setFailure(null);
    setAsking(false);
  });

  const live = liveGame(sim);

  async function submit(cancelOwn = false) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await createGuestGame(nick, cancelOwn);
    setBusy(false);
    setAsking(false);
    if (result.kind === "ok") go("p03");
    else {
      setFailure(result);
      if (result.kind === "nickname") document.getElementById("p08-nick")?.focus();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  let stateId = "p08.1";
  if (busy) stateId = asking ? "p08.7" : "p08.3";
  else if (asking) stateId = "p08.7";
  else if (failure?.kind === "nickname") stateId = "p08.2";
  else if (failure?.kind === "limit") stateId = "p08.4";
  else if (failure?.kind === "server") stateId = "p08.5";
  else if (failure?.kind === "active") stateId = "p08.6";
  else if (failure?.kind === "waiting") stateId = "p08.7";
  else if (failure?.kind === "network") stateId = "p08.8";
  useStateId("p08", stateId);

  if (account) {
    // The role table: an account creates from the home page (p01.1); this screen is for people without one.
    return (
      <>
        <SiteHeader />
        <Main narrow state="p08">
          <h1 className="m-0 text-section font-strong">Zagraj ze znajomym bez konta</h1>
          <Alert status="info" title="Jesteś zalogowany">Zaproszenie utworzysz na stronie głównej, przyciskiem „Utwórz zaproszenie”.</Alert>
          <div><Button onClick={() => go("p01")}>Wróć na stronę główną</Button></div>
        </Main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <Main narrow state={stateId} assumption="L25, L26, L32">
        <h1 className="m-0 text-section font-strong">Zagraj ze znajomym bez konta</h1>

        {failure?.kind === "limit" && (
          <Alert status="danger" title="Zbyt wiele zaproszeń">
            Limit to 10 utworzeń na godzinę. Spróbuj ponownie za {failure.minutes} min.
          </Alert>
        )}
        {failure?.kind === "server" && (
          // L26: a permanent error (an unknown client address) gets the same sentence and a retry as any server error.
          <Alert status="danger" title="Nie udało się utworzyć zaproszenia. Spróbuj ponownie." />
        )}
        {failure?.kind === "network" && (
          <Alert status="danger" title="Brak połączenia">Nie udało się połączyć z serwerem. Spróbuj ponownie.</Alert>
        )}
        {failure?.kind === "active" && (
          <Alert status="warning" title="Masz już partię">
            Najpierw dokończ bieżącą partię.{" "}
            <TextLink
              href="#przejdz-do-partii"
              onClick={(event) => {
                event.preventDefault();
                if (live) openGame(sim, live);
              }}
            >
              Przejdź do partii
            </TextLink>
          </Alert>
        )}
        {failure?.kind === "waiting" && (
          <Alert status="warning" title="Masz oczekującą partię">
            Możesz ją anulować i utworzyć nową albo wrócić do niej.{" "}
            <TextLink
              href="#wroc-do-partii"
              onClick={(event) => {
                event.preventDefault();
                if (live) openGame(sim, live);
              }}
            >
              Wróć do partii
            </TextLink>
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-stack">
          {/* LUKA D08: Pole tekstowe has no counter, and `maxLength` counts UTF-16 units while the nickname is 1–24 code
              points, so the field has no limit attribute: the server validates and the error sits next to the field.
              LUKA D10: no pattern for "nickname field + warning + button"; Pole formularza, Alert and Przycisk are put together here. */}
          <Field
            label="Twój nick"
            requirement="(opcjonalnie)"
            id="p08-nick"
            hint={`Zostaw puste, a będziesz „Gracz 1”`}
            error={failure?.kind === "nickname" ? NICKNAME_ERROR[failure.error] : undefined}
          >
            {(control) => <TextInput {...control} autoComplete="off" value={nick} onChange={(event) => setNick(event.target.value)} />}
          </Field>
          <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
            Jeśli zmienisz przeglądarkę albo wyczyścisz dane, stracisz dostęp do tej partii.
          </Alert>
          <p className="m-0 text-body text-text-secondary" data-testid="p08-ttl">Zaproszenie jest ważne 24 godziny.</p>
          <div className="flex flex-wrap items-center gap-group">
            <Button type="submit" loading={busy && !asking}>{busy && !asking ? "Tworzenie zaproszenia…" : "Rozumiem, utwórz zaproszenie"}</Button>
            {(failure?.kind === "server" || failure?.kind === "network") && (
              <Button variant="secondary" onClick={() => void submit()}>Spróbuj ponownie</Button>
            )}
            {failure?.kind === "waiting" && (
              <Button variant="secondary" onClick={() => setAsking(true)}>Anuluj i utwórz nową</Button>
            )}
            <TextLink href="#p01" placement="standalone">Wróć</TextLink>
          </div>
        </form>

        <ConfirmDialog
          open={asking}
          onOpenChange={(open) => !open && !busy && setAsking(false)}
          title="Anulować poprzednie zaproszenie?"
          description="Link i kod poprzedniego zaproszenia przestaną działać, a nowa partia zostanie utworzona od razu. Tej operacji nie można cofnąć."
          confirmLabel={busy ? "Anulowanie…" : "Tak, anuluj i utwórz nową"}
          cancelLabel="Wróć"
          confirming={busy}
          onConfirm={() => void submit(true)}
        />
      </Main>
    </>
  );
}
