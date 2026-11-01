"use client";

import type { ChatLimits, ChatMessageView, ChatReadData, ChatSendData, ChatState } from "@gomoku/core/chat/types";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePageVisibility } from "@/components/games/use-page-visibility";
import { apiCall } from "@/lib/api-client";
import {
  CHAT_IDLE_AFTER_MS,
  CHAT_IDLE_POLL_INTERVAL_MS,
  CHAT_PAGE_SIZE,
  CHAT_POLL_INTERVAL_MS,
  CHAT_TIMEOUT_MS,
  isReadable,
  mergeMessages,
} from "@/lib/chat/chat";

/** What came of one `send`; the composer turns it into words. */
export type SendOutcome =
  | { ok: true }
  /** The server refused the text: `message` is the sentence for the field. */
  | { ok: false; kind: "field"; message: string }
  /** Too soon after the last message; the button waits `retryAfterMs`. */
  | { ok: false; kind: "wait"; message: string; retryAfterMs: number }
  /** The chat is off, full or closed: the sentence is the server's, the state is read again. */
  | { ok: false; kind: "refused"; message: string }
  /** The request did not get through; the same attempt can be repeated. */
  | { ok: false; kind: "network" }
  /** Another send is in flight (a double click): nothing was sent and nothing is to be shown. */
  | { ok: false; kind: "busy" };

export type Chat = {
  /** The first read has come back. */
  loaded: boolean;
  state: ChatState;
  messages: ChatMessageView[];
  limits: ChatLimits | null;
  /** Failed reads in a row. */
  fails: number;
  /** The message being sent, shown dimmed until the server confirms it. */
  pending: { clientId: string; text: string } | null;
  /** Reads now (a button, the return of the tab). */
  refresh: () => Promise<void>;
  /** Sends `text` as the attempt `clientId`; a repeat with the same id never duplicates the message. */
  send: (text: string, clientId: string) => Promise<SendOutcome>;
};

type Options = {
  gameId: string;
  /** The game is gone for this visitor (`404`): polling stops. */
  onGone: () => void;
};

const NETWORK: SendOutcome = { ok: false, kind: "network" };
const BUSY: SendOutcome = { ok: false, kind: "busy" };

/**
 * The conversation of a game: reads it with a cursor (`after_id`) every 3 s (every 10 s when idle for a
 * minute), pauses while the tab is hidden and reads at once when it returns, merges by message number and
 * clears the list when the chat stops being readable. A full page is followed by another read, so a long
 * absence loses nothing. Sending is guarded by a ref, so a double click sends once.
 */
export function useChat({ gameId, onGone }: Options): Chat {
  const [data, setData] = useState<{ state: ChatState; messages: ChatMessageView[]; limits: ChatLimits } | null>(null);
  const [fails, setFails] = useState(0);
  const [pending, setPending] = useState<Chat["pending"]>(null);
  // `undefined` = nothing known yet: the next read asks for the latest page.
  const cursor = useRef<number | undefined>(undefined);
  const reading = useRef(false);
  const sending = useRef(false);
  const gone = useRef(false);
  // Set when the polling starts (a render must not read the clock).
  const lastActivity = useRef(0);
  const goneHandler = useRef(onGone);

  useEffect(() => {
    goneHandler.current = onGone;
  });

  const apply = useCallback((next: ChatReadData) => {
    if (!isReadable(next.state)) {
      cursor.current = undefined;
      setData({ state: next.state, messages: [], limits: next.limits });
      return;
    }
    cursor.current = next.lastId;
    if (next.messages.length > 0) lastActivity.current = performance.now();
    setData((previous) => ({
      state: next.state,
      limits: next.limits,
      messages: mergeMessages(previous && isReadable(previous.state) ? previous.messages : [], next.messages),
    }));
  }, []);

  const refresh = useCallback(async () => {
    if (reading.current || gone.current) return;
    reading.current = true;
    try {
      for (;;) {
        const after = cursor.current;
        const result = await apiCall<ChatReadData>(
          `/api/games/${gameId}/chat${after === undefined ? "" : `?after_id=${after}`}`,
          { method: "GET", signal: AbortSignal.timeout(CHAT_TIMEOUT_MS) },
        );
        if (!result.ok) {
          if (result.error.code === "NOT_FOUND") {
            gone.current = true;
            goneHandler.current();
          } else {
            setFails((count) => count + 1);
          }
          return;
        }
        setFails(0);
        apply(result.data);
        // A full page after a cursor means there may be more.
        if (after === undefined || result.data.messages.length < CHAT_PAGE_SIZE) return;
      }
    } finally {
      reading.current = false;
    }
  }, [gameId, apply]);

  const hidden = usePageVisibility({ onReturn: () => void refresh() });
  const hiddenNow = useRef(hidden);
  useEffect(() => {
    hiddenNow.current = hidden;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    lastActivity.current = performance.now();
    const tick = async () => {
      if (!hiddenNow.current) await refresh();
      if (cancelled || gone.current) return;
      const idle = performance.now() - lastActivity.current > CHAT_IDLE_AFTER_MS;
      timer = setTimeout(() => void tick(), idle ? CHAT_IDLE_POLL_INTERVAL_MS : CHAT_POLL_INTERVAL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const send = useCallback(
    async (text: string, clientId: string): Promise<SendOutcome> => {
      if (sending.current) return BUSY;
      sending.current = true;
      setPending({ clientId, text });
      try {
        const result = await apiCall<ChatSendData>(`/api/games/${gameId}/chat`, {
          body: { text, clientId },
          signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        });
        if (result.ok) {
          lastActivity.current = performance.now();
          const { message } = result.data;
          setData((previous) =>
            previous
              ? { ...previous, state: "open", messages: mergeMessages(previous.messages, [message]) }
              : previous,
          );
          return { ok: true };
        }
        const { code, message, fieldErrors, data: details } = result.error;
        if (code === "network") return NETWORK;
        if (code === "NOT_FOUND") {
          gone.current = true;
          goneHandler.current();
          return NETWORK;
        }
        if (code === "RATE_LIMITED") {
          const retryAfterMs = Number((details as { retryAfterMs?: unknown } | undefined)?.retryAfterMs);
          return { ok: false, kind: "wait", message, retryAfterMs: retryAfterMs > 0 ? retryAfterMs : 2000 };
        }
        if (code.startsWith("CHAT_")) {
          void refresh();
          return { ok: false, kind: "refused", message };
        }
        return { ok: false, kind: "field", message: fieldErrors?.text?.[0] ?? message };
      } finally {
        sending.current = false;
        setPending(null);
      }
    },
    [gameId, refresh],
  );

  return {
    loaded: data !== null,
    state: data?.state ?? "open",
    messages: data?.messages ?? [],
    limits: data?.limits ?? null,
    fails,
    pending,
    refresh,
    send,
  };
}
