"use client";

import type { ChatMessageView } from "@gomoku/core/chat/types";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { messageTime } from "@/lib/chat/chat";

type Props = {
  messages: ChatMessageView[];
  /** The label of the sender of a seat ("Ty (Ala_7)", "Kuba_P", "Gracz 2 (gość)", "Agent · …"). */
  labelOf: (seat: ChatMessageView["seat"]) => ReactNode;
  /** A message on its way: shown dimmed and hidden from assistive technology until the server confirms it. */
  pending?: { text: string; seat: ChatMessageView["seat"] } | null;
};

/** The reader counts as "at the bottom" within this many pixels. */
const BOTTOM_SLACK_PX = 16;

/**
 * The conversation: a polite `log` around an `ol` (new messages are read out, the time is not), the text always a plain
 * text node with `dir="auto"` (an RTL message does not flip its neighbours), never a link. It follows the
 * newest message only while the reader is at the bottom; otherwise "Nowe wiadomości" offers the jump.
 */
export function ChatMessageList({ messages, labelOf, pending }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const known = useRef(messages.length);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const element = list.current!;
    const added = messages.length > known.current;
    known.current = messages.length;
    if (stuck.current) element.scrollTop = element.scrollHeight;
    else if (added) setUnseen(true);
  }, [messages, pending]);

  function onScroll() {
    const element = list.current!;
    stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_SLACK_PX;
    if (stuck.current) setUnseen(false);
  }

  function jumpToNewest() {
    const element = list.current!;
    element.scrollTop = element.scrollHeight;
    stuck.current = true;
    setUnseen(false);
  }

  return (
    <div className="flex flex-col gap-group">
      {messages.length === 0 && !pending && (
        <EmptyState title="Nikt jeszcze nic nie napisał. Napisz pierwszy." />
      )}
      {/* The log is a block around the list: `log` is not allowed on an `ol`. Focusable, so the keyboard can scroll it. */}
      <div
        ref={list}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Wiadomości czatu"
        tabIndex={0}
        onScroll={onScroll}
        className="max-h-60 overflow-y-auto rounded-base focus-visible:focus-ring"
      >
        <ol className="m-0 flex list-none flex-col gap-stack p-0">
          {messages.map((message) => (
            <li key={message.id} className="flex min-w-0 flex-col gap-1" data-testid="chat-message">
              <div className="flex min-w-0 items-baseline gap-group text-meta text-text-secondary">
                <span className="min-w-0 font-strong">{labelOf(message.seat)}</span>
                <time dateTime={message.createdAt} aria-hidden="true" className="shrink-0 text-text-muted">
                  {messageTime(message.createdAt)}
                </time>
              </div>
              <p className="m-0 text-body wrap-anywhere text-text-primary" dir="auto" style={{ unicodeBidi: "isolate" }}>
                {message.text}
              </p>
            </li>
          ))}
          {pending && (
            <li aria-hidden="true" className="flex min-w-0 flex-col gap-1" data-testid="chat-pending">
              <div className="flex min-w-0 items-baseline gap-group text-meta text-text-secondary">
                <span className="min-w-0 font-strong">{labelOf(pending.seat)}</span>
                <span className="shrink-0 text-text-muted">Wysyłanie…</span>
              </div>
              <p className="m-0 text-body wrap-anywhere text-text-muted" dir="auto" style={{ unicodeBidi: "isolate" }}>
                {pending.text}
              </p>
            </li>
          )}
        </ol>
      </div>
      {unseen && (
        <div>
          <Button variant="secondary" onClick={jumpToNewest}>
            Nowe wiadomości
          </Button>
        </div>
      )}
    </div>
  );
}
