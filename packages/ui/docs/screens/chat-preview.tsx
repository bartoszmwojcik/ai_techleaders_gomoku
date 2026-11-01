import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { Field } from "@gomoku/ui/game/field";
import { Panel } from "@gomoku/ui/game/panel";
import { TextInput } from "@gomoku/ui/game/text-input";
import type { ReactNode } from "react";

// The chat panel of the game screen (E07-S01), composed from the design system the way the app does it
// (packages/app/src/components/chat). Docs cannot import the app, so the structure is repeated here.
// E07-S02 adds the switch "Wyłącz czat" / "Włącz czat" to the header, next to "Zwiń czat".

export type ChatPreviewState =
  | "empty"
  | "conversation"
  | "disabled-by-opponent"
  | "disabled-by-you"
  | "switch-error"
  | "send-error"
  | "closed"
  | "waiting";

type Message = { from: "you" | "opponent"; text: string; time: string };

const CONVERSATION: Message[] = [
  { from: "opponent", text: "Cześć! Gramy?", time: "18:41" },
  { from: "you", text: "Jasne. Powodzenia.", time: "18:41" },
  { from: "opponent", text: "Dzięki, nawzajem 🙂", time: "18:42" },
  { from: "opponent", text: "שלום עולם", time: "18:42" },
];

function Log({ messages, opponent }: { messages: Message[]; opponent: ReactNode }) {
  return (
    <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Wiadomości czatu" tabIndex={0} className="max-h-60 overflow-y-auto rounded-base focus-visible:focus-ring">
      <ol className="m-0 flex list-none flex-col gap-stack p-0">
        {messages.map((message) => (
          <li key={message.text} className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-baseline gap-group text-meta text-text-secondary">
              <span className="min-w-0 font-strong">{message.from === "you" ? "Ty (Ala_7)" : opponent}</span>
              <time aria-hidden="true" className="shrink-0 text-text-muted">{message.time}</time>
            </div>
            <p className="m-0 text-body wrap-anywhere text-text-primary" dir="auto">{message.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ChatPreview({ state, opponent = "Alicja_99" }: { state: ChatPreviewState; opponent?: ReactNode }) {
  if (state === "waiting") {
    return (
      <Panel title="Czat">
        <p className="m-0 text-body text-text-secondary">Czat będzie dostępny, gdy przeciwnik dołączy do partii.</p>
      </Panel>
    );
  }
  const blocked = state === "disabled-by-opponent" || state === "closed";
  const offByYou = state === "disabled-by-you";
  const messages = state === "empty" || state === "closed" ? [] : CONVERSATION;
  return (
    <Panel title="Czat">
      <div className="flex flex-wrap items-center justify-between gap-group">
        <p className="m-0 flex min-w-0 items-baseline gap-group text-meta text-text-secondary">
          <span className="shrink-0">z</span>
          <span className="min-w-0 font-strong">{opponent}</span>
        </p>
        <div className="flex flex-wrap items-center gap-group">
          {state !== "closed" && <Button variant="secondary">{offByYou ? "Włącz czat" : "Wyłącz czat"}</Button>}
          <Button variant="secondary" aria-expanded="true">Zwiń czat</Button>
        </div>
      </div>
      {state === "switch-error" && <Alert status="danger" title="Nie udało się wyłączyć czatu. Spróbuj ponownie." />}
      {state === "closed" ? (
        <p className="m-0 text-body text-text-secondary">Czat jest już zamknięty.</p>
      ) : offByYou ? (
        <p role="status" className="m-0 text-body text-text-secondary">
          Wyłączyłeś czat. Nie widzisz wiadomości rozmówcy i nie możesz pisać. Rozmówca zobaczy, że czat jest wyłączony.
        </p>
      ) : (
        <>
          {state === "disabled-by-opponent" && <Alert status="info" title="Rozmówca wyłączył czat. Nie możesz teraz pisać." role="status" />}
          {state === "empty" && <EmptyState title="Nikt jeszcze nic nie napisał. Napisz pierwszy." />}
          <Log messages={messages} opponent={opponent} />
          <form className="flex flex-col gap-group" noValidate>
            <Field
              label="Wiadomość"
              hint={state === "disabled-by-opponent" ? "Pisanie jest zablokowane: rozmówca wyłączył czat." : "Pozostało 200 znaków"}
            >
              {(control) => (
                <div className="flex items-start gap-group">
                  <TextInput {...control} name="message" defaultValue={state === "send-error" ? "Dobra partia!" : ""} disabled={blocked} autoComplete="off" enterKeyHint="send" />
                  <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={blocked}>Wyślij</Button>
                </div>
              )}
            </Field>
            {state === "send-error" && (
              <Alert status="danger" title="Nie wysłano: brak połączenia.">
                <Button variant="secondary">Ponów wysyłanie</Button>
              </Alert>
            )}
          </form>
        </>
      )}
    </Panel>
  );
}
