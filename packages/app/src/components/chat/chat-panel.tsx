"use client";

import { CHAT_MAX_LENGTH } from "@gomoku/core/chat/constants";
import type { ChatMessageView } from "@gomoku/core/chat/types";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { useId, useState } from "react";

import { PlayerLabel } from "@/components/games/player-label";
import { CHAT_FAILURES_BEFORE_ALERT, pluralNew } from "@/lib/chat/chat";
import { playerNameOf } from "@/lib/games/play";
import type { GameView } from "@/server/http/game-view";

import { ChatComposer } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";
import { useChat } from "./use-chat";

type Props = {
  gameId: string;
  game: Pick<GameView, "status" | "players" | "you">;
  /** The game is gone for this visitor (`404`). */
  onGone: () => void;
};

const WAITING_TEXT = "Czat będzie dostępny, gdy przeciwnik dołączy do partii.";
const CLOSED_TEXT = "Czat jest już zamknięty.";
const DISABLED_BY_YOU_TEXT =
  "Wyłączyłeś czat. Nie widzisz wiadomości rozmówcy i nie możesz pisać. Rozmówca zobaczy, że czat jest wyłączony.";
const TURN_OFF_LABEL = "Wyłącz czat";
const TURN_ON_LABEL = "Włącz czat";
const TURN_OFF_FAILED = "Nie udało się wyłączyć czatu. Spróbuj ponownie.";
const TURN_ON_FAILED = "Nie udało się włączyć czatu. Spróbuj ponownie.";
const DISABLED_BY_OPPONENT_TEXT = "Rozmówca wyłączył czat. Nie możesz teraz pisać.";
const DISABLED_BY_OPPONENT_REASON = "Pisanie jest zablokowane: rozmówca wyłączył czat.";
const LOADING_TEXT = "Wczytujemy czat…";

/**
 * The chat of a game under the board and under the result (E07-S01). A game that waits shows only a
 * sentence (nothing is read); a cancelled game shows nothing. The conversation is composed from the design
 * system's Panel, field, button and alert, so the panel owns no look of its own.
 */
export function ChatPanel({ gameId, game, onGone }: Props) {
  if (game.status === "cancelled") return null;
  if (game.status === "waiting") {
    return (
      <Panel title="Czat" data-testid="chat-panel">
        <p className="m-0 text-body text-text-secondary">{WAITING_TEXT}</p>
      </Panel>
    );
  }
  return <LiveChat gameId={gameId} game={game} onGone={onGone} />;
}

function LiveChat({ gameId, game, onGone }: Props) {
  const chat = useChat({ gameId, onGone });
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(false);
  // The newest message the reader had in front of them when they folded the panel away.
  const [seenUpTo, setSeenUpTo] = useState(0);
  // The setting the last failed change was meant to reach; cleared by the next attempt.
  const [failedChange, setFailedChange] = useState<boolean | null>(null);
  const loadingId = useId();

  const mySeat = game.you.seat;
  const opponent = game.players.find((player) => player.seat !== mySeat);
  const labelOf = (seat: ChatMessageView["seat"]) => (
    <PlayerLabel name={playerNameOf(game.players.find((player) => player.seat === seat))} you={seat === mySeat} testId="chat-sender" />
  );
  const newest = chat.messages.at(-1)?.id ?? 0;
  const unread = collapsed ? chat.messages.filter((m) => m.seat !== mySeat && m.id > seenUpTo).length : 0;

  const { state } = chat;
  const writable = chat.loaded && (state === "open" || state === "disabled_by_opponent");
  const blockedReason = !chat.loaded ? LOADING_TEXT : state === "disabled_by_opponent" ? DISABLED_BY_OPPONENT_REASON : null;

  // The setting can be changed whenever the panel shows a chat; it is not offered when nothing can be done.
  const switchable = !chat.loaded || (state !== "unavailable" && state !== "closed");
  const enabledNow = state !== "disabled_by_you";

  async function changeSetting() {
    setFailedChange(null);
    const outcome = await chat.setEnabled(!enabledNow);
    if (!outcome.ok && outcome.kind === "failed") setFailedChange(!enabledNow);
  }

  function toggle() {
    if (!collapsed) setSeenUpTo(newest);
    setCollapsed(!collapsed);
  }

  return (
    <Panel title="Czat" data-testid="chat-panel">
      <div className="flex flex-wrap items-center justify-between gap-group">
        <p className="m-0 flex min-w-0 items-baseline gap-group text-meta text-text-secondary">
          <span className="shrink-0">z</span>
          <span className="min-w-0 font-strong">
            <PlayerLabel name={playerNameOf(opponent)} testId="chat-sender" />
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-group">
          {switchable && (
            <Button
              variant="secondary"
              // Not `loading`: that disables the button, and a disabled button drops the keyboard focus.
              // A second click is stopped by the hook, so aria-busy is enough.
              aria-busy={chat.switching || undefined}
              disabled={!chat.loaded}
              aria-describedby={chat.loaded ? undefined : loadingId}
              onClick={() => void changeSetting()}
              data-testid="chat-switch"
            >
              {enabledNow ? TURN_OFF_LABEL : TURN_ON_LABEL}
            </Button>
          )}
          <Button variant="secondary" aria-expanded={!collapsed} aria-controls={bodyId} onClick={toggle} data-testid="chat-toggle">
            {!collapsed ? "Zwiń czat" : unread > 0 ? `Czat (${unread} ${pluralNew(unread)})` : "Rozwiń czat"}
          </Button>
        </div>
      </div>
      {!chat.loaded && (
        <span id={loadingId} className="sr-only">
          {LOADING_TEXT}
        </span>
      )}
      {failedChange !== null && <Alert status="danger" title={failedChange ? TURN_ON_FAILED : TURN_OFF_FAILED} />}
      <span role="status" className="sr-only">
        {unread > 0 ? `Czat: ${unread} ${pluralNew(unread)}` : ""}
      </span>
      <div id={bodyId} hidden={collapsed} className="flex flex-col gap-stack">
        {chat.fails >= CHAT_FAILURES_BEFORE_ALERT && (
          <Alert status="danger" title="Nie udało się odświeżyć czatu. Ponawiamy próby.">
            <Button variant="secondary" onClick={() => void chat.refresh()}>
              Spróbuj ponownie
            </Button>
          </Alert>
        )}
        {!chat.loaded && (
          <SkeletonRegion label={LOADING_TEXT}>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </SkeletonRegion>
        )}
        {chat.loaded && state === "closed" && <p className="m-0 text-body text-text-secondary">{CLOSED_TEXT}</p>}
        {chat.loaded && state === "unavailable" && <p className="m-0 text-body text-text-secondary">{WAITING_TEXT}</p>}
        {chat.loaded && state === "disabled_by_you" && (
          <p role="status" className="m-0 text-body text-text-secondary">
            {DISABLED_BY_YOU_TEXT}
          </p>
        )}
        {chat.loaded && state === "disabled_by_opponent" && (
          <Alert status="info" title={DISABLED_BY_OPPONENT_TEXT} role="status" />
        )}
        {writable && (
          <ChatMessageList
            messages={chat.messages}
            labelOf={labelOf}
            pending={chat.pending ? { text: chat.pending.text, seat: mySeat } : null}
          />
        )}
        {(writable || !chat.loaded) && (
          <ChatComposer
            maxLength={chat.limits?.maxLength ?? CHAT_MAX_LENGTH}
            blockedReason={blockedReason}
            send={chat.send}
          />
        )}
      </div>
    </Panel>
  );
}
