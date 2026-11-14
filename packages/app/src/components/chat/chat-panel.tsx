"use client";

import { CHAT_MAX_LENGTH } from "@gomoku/core/chat/constants";
import type { Seat } from "@gomoku/core/games/types";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { InfoToggleButton, InfoToggleNote } from "@gomoku/ui/game/info-toggle";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { useId, useState } from "react";

import { PlayerLabel } from "@/components/games/player-label";
import plChat from "@/i18n/catalogs/pl/chat";
import plCommon from "@/i18n/catalogs/pl/common";
import { useT } from "@/i18n/context";
import { CHAT_FAILURES_BEFORE_ALERT } from "@/lib/chat/chat";
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

// `chat.info`: the messages stay in the database until about an hour after the game ends, so "not saved" would be
// untrue (BR-34). `chat.opponentDisabledPublic`: in a public game the other player left, the spectators did not (BR-41).

/**
 * The chat of a game under the board and under the result (E07-S01). A game that waits shows only a
 * sentence (nothing is read); a cancelled game shows nothing. The conversation is composed from the design
 * system's Panel, field, button and alert, so the panel owns no look of its own.
 */
export function ChatPanel({ gameId, game, onGone }: Props) {
  const t = useT("chat", plChat);
  if (game.status === "cancelled") return null;
  if (game.status === "waiting") {
    return (
      <Panel title={t("title")} data-testid="chat-panel">
        <p className="m-0 text-body text-text-secondary">{t("waiting")}</p>
      </Panel>
    );
  }
  return <LiveChat gameId={gameId} game={game} onGone={onGone} />;
}

function LiveChat({ gameId, game, onGone }: Props) {
  const t = useT("chat", plChat);
  const common = useT("common", plCommon);
  const chat = useChat({ gameId, onGone });
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(false);
  // The newest message the reader had in front of them when they folded the panel away.
  const [seenUpTo, setSeenUpTo] = useState(0);
  // The setting the last failed change was meant to reach; cleared by the next attempt.
  const [failedChange, setFailedChange] = useState<boolean | null>(null);
  const loadingId = useId();
  const infoId = useId();
  const [infoOpen, setInfoOpen] = useState(false);

  const mySeat = game.you.seat;
  const opponent = game.players.find((player) => player.seat !== mySeat);
  const labelOf = (seat: Seat) => (
    <PlayerLabel
      name={playerNameOf(game.players.find((player) => player.seat === seat), common)}
      you={seat === mySeat}
      testId="chat-sender"
      t={common}
    />
  );
  const newest = chat.messages.at(-1)?.id ?? 0;
  const unread = collapsed ? chat.messages.filter((m) => m.seat !== mySeat && m.id > seenUpTo).length : 0;

  const { state } = chat;
  const writable = chat.loaded && (state === "open" || state === "disabled_by_opponent");
  const blockedReason = !chat.loaded ? t("loading") : state === "disabled_by_opponent" ? t("disabledByOpponentReason") : null;

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
    <Panel title={t("title")} data-testid="chat-panel">
      <div className="flex flex-wrap items-center justify-between gap-group">
        <div className="flex min-w-0 items-center gap-group">
          <p className="m-0 flex min-w-0 items-baseline gap-group text-meta text-text-secondary">
            <span className="shrink-0">{t("with")}</span>
            <span className="min-w-0 font-strong">
              <PlayerLabel name={playerNameOf(opponent, common)} testId="chat-sender" t={common} />
            </span>
          </p>
          <InfoToggleButton
            label={t("infoLabel")}
            expanded={infoOpen}
            controls={infoId}
            onClick={() => setInfoOpen(!infoOpen)}
            data-testid="chat-info-toggle"
          />
        </div>
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
              {t(enabledNow ? "turnOff" : "turnOn")}
            </Button>
          )}
          <Button variant="secondary" aria-expanded={!collapsed} aria-controls={bodyId} onClick={toggle} data-testid="chat-toggle">
            {!collapsed ? t("collapse") : unread > 0 ? t("unread", { count: unread }) : t("expand")}
          </Button>
        </div>
      </div>
      <InfoToggleNote id={infoId} open={infoOpen} data-testid="chat-info">
        {t("info")}
      </InfoToggleNote>
      {!chat.loaded && (
        <span id={loadingId} className="sr-only">
          {t("loading")}
        </span>
      )}
      {failedChange !== null && <Alert status="danger" title={t(failedChange ? "turnOnFailed" : "turnOffFailed")} />}
      <span role="status" className="sr-only">
        {unread > 0 ? t("unreadStatus", { count: unread }) : ""}
      </span>
      <div id={bodyId} hidden={collapsed} className="flex flex-col gap-stack">
        {chat.fails >= CHAT_FAILURES_BEFORE_ALERT && (
          <Alert status="danger" title={t("refreshFailed")}>
            <Button variant="secondary" onClick={() => void chat.refresh()}>
              {t("retry")}
            </Button>
          </Alert>
        )}
        {!chat.loaded && (
          <SkeletonRegion label={t("loading")}>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </SkeletonRegion>
        )}
        {chat.loaded && state === "closed" && <p className="m-0 text-body text-text-secondary">{t("closed")}</p>}
        {chat.loaded && state === "unavailable" && <p className="m-0 text-body text-text-secondary">{t("waiting")}</p>}
        {chat.loaded && state === "disabled_by_you" && (
          <p role="status" className="m-0 text-body text-text-secondary">
            {t("disabledByYou")}
          </p>
        )}
        {chat.loaded && state === "open" && chat.opponentDisabled && (
          <Alert status="info" title={t("opponentDisabledPublic")} role="status" />
        )}
        {chat.loaded && state === "disabled_by_opponent" && (
          <Alert status="info" title={t("disabledByOpponent")} role="status" />
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
