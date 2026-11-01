"use client";

import {
  CHAT_REJECTION_MESSAGES,
  chatMessageLength,
  normalizeChatMessage,
} from "@gomoku/core/chat/message";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { newClientId, pluralChars } from "@/lib/chat/chat";

import type { SendOutcome } from "./use-chat";

type Props = {
  maxLength: number;
  /** Why writing is not possible now ("Wczytujemy czat…"); the field and the button are disabled and say it. */
  blockedReason: string | null;
  send: (text: string, clientId: string) => Promise<SendOutcome>;
};

const WAIT_MESSAGE = "Poczekaj chwilę przed następną wiadomością.";
const NETWORK_MESSAGE = "Nie wysłano: brak połączenia.";

function counterOf(text: string, maxLength: number): string {
  const left = maxLength - chatMessageLength(text);
  return left >= 0 ? `Pozostało ${left} ${pluralChars(left)}` : `Za dużo o ${-left} ${pluralChars(-left)}`;
}

/**
 * The message form (E07-S01): a labelled one-line field (Enter sends), a counter in code points after NFKC,
 * the refusals under the field, and "Ponów wysyłanie" after a lost connection with the same `clientId`, so the
 * message cannot be stored twice. The text stays in the field until it is sent. No autofocus: the page is not
 * to take the focus from the board or from a screen reader.
 */
export function ChatComposer({ maxLength, blockedReason, send }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooling, setCooling] = useState(false);
  // The attempt of the text in the field; a changed text is a new attempt.
  const attempt = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cooldown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(cooldown.current), []);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (blockedReason !== null || cooling) return;
    const checked = normalizeChatMessage(text, { maxLength });
    if (!checked.ok) {
      setError(CHAT_REJECTION_MESSAGES[checked.reason]);
      return;
    }
    attempt.current ??= newClientId();
    setError(null);
    setOffline(false);
    setSending(true);
    const outcome = await send(text, attempt.current);
    setSending(false);
    if (outcome.ok) {
      setText("");
      attempt.current = null;
      // The focus stays where it was: a click on "Wyślij" would otherwise move it off the field.
      if (form.current?.contains(document.activeElement)) input.current?.focus();
      return;
    }
    switch (outcome.kind) {
      case "network":
        setOffline(true);
        break;
      case "wait":
        setError(WAIT_MESSAGE);
        setCooling(true);
        clearTimeout(cooldown.current);
        cooldown.current = setTimeout(() => {
          setCooling(false);
          setError(null);
        }, outcome.retryAfterMs);
        break;
      case "field":
      case "refused":
        setError(outcome.message);
        break;
      case "busy":
        break;
    }
  }

  function onChange(value: string) {
    setText(value);
    attempt.current = null;
    setError(null);
    setOffline(false);
  }

  return (
    <form ref={form} onSubmit={(event) => void submit(event)} className="flex flex-col gap-group" noValidate>
      <Field label="Wiadomość" hint={blockedReason ?? counterOf(text, maxLength)} error={error}>
        {(control) => (
          <div className="flex items-start gap-group">
            <TextInput
              {...control}
              ref={input}
              name="message"
              value={text}
              onChange={(event) => onChange(event.target.value)}
              disabled={blockedReason !== null}
              autoComplete="off"
              enterKeyHint="send"
              dir="auto"
            />
            <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={blockedReason !== null || cooling}>
              {sending ? "Wysyłanie…" : "Wyślij"}
            </Button>
          </div>
        )}
      </Field>
      {offline && (
        <Alert status="danger" title={NETWORK_MESSAGE}>
          <Button variant="secondary" disabled={sending} onClick={() => void submit()}>
            Ponów wysyłanie
          </Button>
        </Alert>
      )}
    </form>
  );
}
