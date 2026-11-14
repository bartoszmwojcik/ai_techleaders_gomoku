"use client";

import { chatMessageLength, normalizeChatMessage } from "@gomoku/core/chat/message";
import type { ChatRejection } from "@gomoku/core/chat/types";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { useEffect, useRef, useState, type FormEvent } from "react";

import plChat from "@/i18n/catalogs/pl/chat";
import type { TranslatorOf } from "@/i18n/client";
import { useT } from "@/i18n/context";
import { newClientId } from "@/lib/chat/chat";

import type { SendOutcome } from "./use-chat";

type Props = {
  maxLength: number;
  /** Why writing is not possible now ("Wczytujemy czat…"); the field and the button are disabled and say it. */
  blockedReason: string | null;
  send: (text: string, clientId: string) => Promise<SendOutcome>;
};

type ChatTranslator = TranslatorOf<"chat">;

const REJECTIONS: readonly ChatRejection[] = ["not_text", "empty", "too_long", "control_char", "invisible_char", "combining_run", "url"];
const REFUSED = ["CHAT_UNAVAILABLE", "CHAT_DISABLED", "CHAT_FULL"] as const;

const isOneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (list as readonly string[]).includes(value);

function counterOf(text: string, maxLength: number, t: ChatTranslator): string {
  const left = maxLength - chatMessageLength(text);
  return left >= 0 ? t("left", { count: left }) : t("over", { count: -left });
}

/**
 * The message form (E07-S01): a labelled one-line field (Enter sends), a counter in code points after NFKC,
 * the refusals under the field, and "Ponów wysyłanie" after a lost connection with the same `clientId`, so the
 * message cannot be stored twice. The text stays in the field until it is sent. No autofocus: the page is not
 * to take the focus from the board or from a screen reader.
 */
export function ChatComposer({ maxLength, blockedReason, send }: Props) {
  const t = useT("chat", plChat);
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
      setError(t(`rejection.${checked.reason}`));
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
        setError(t("wait"));
        setCooling(true);
        clearTimeout(cooldown.current);
        cooldown.current = setTimeout(() => {
          setCooling(false);
          setError(null);
        }, outcome.retryAfterMs);
        break;
      case "field":
        // By `data.reason` (a `ChatRejection`); the server's sentence when it named none.
        setError(isOneOf(REJECTIONS, outcome.reason) ? t(`rejection.${outcome.reason}`) : outcome.message);
        break;
      case "refused":
        setError(isOneOf(REFUSED, outcome.code) ? t(`refused.${outcome.code}`) : outcome.message);
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
      <Field label={t("message")} hint={blockedReason ?? counterOf(text, maxLength, t)} error={error}>
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
              {t(sending ? "sending" : "send")}
            </Button>
          </div>
        )}
      </Field>
      {offline && (
        <Alert status="danger" title={t("offline")}>
          <Button variant="secondary" disabled={sending} onClick={() => void submit()}>
            {t("resend")}
          </Button>
        </Alert>
      )}
    </form>
  );
}
