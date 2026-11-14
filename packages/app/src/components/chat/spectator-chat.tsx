"use client";

import { CHAT_MAX_LENGTH } from "@gomoku/core/chat/constants";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { InfoToggleButton, InfoToggleNote } from "@gomoku/ui/game/info-toggle";
import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { useId, useState } from "react";

import { PlayerLabel } from "@/components/games/player-label";
import { CHAT_FAILURES_BEFORE_ALERT } from "@/lib/chat/chat";
import plChat from "@/i18n/catalogs/pl/chat";
import plCommon from "@/i18n/catalogs/pl/common";
import { useT } from "@/i18n/context";
import { playerNameOf } from "@/lib/games/play";
import type { SpectatorView } from "@/server/http/spectator-view";

import { ChatComposer } from "./chat-composer";
import { ChatMessageList } from "./chat-message-list";
import { useChat } from "./use-chat";

type Props = {
  gameId: string;
  /** The seats, to name the players who write (a spectator's own messages carry their name). */
  players: SpectatorView["players"];
  /** The spectator has a nickname or an account; without one they only read (BR-41). */
  canWrite: boolean;
  /** The game is gone for this visitor (`404`). */
  onGone: () => void;
};

// `chat.spectatorInfo` (BR-34, BR-41): the messages go about an hour after the game ends; the players may turn the chat off for themselves.

/**
 * The chat of a public game for a spectator (E10-S03, BR-41): the same conversation and composer as a
 * player's, marked as a spectator's, and without the switch - a spectator cannot turn the chat off. A
 * visitor with no nickname reads and is told how to write.
 */
export function SpectatorChat({ gameId, players, canWrite, onGone }: Props) {
  const chat = useChat({ gameId, onGone, path: `/api/games/${gameId}/spectate/chat` });
  const t = useT("chat", plChat);
  const common = useT("common", plCommon);
  const bodyId = useId();
  const infoId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const { state } = chat;
  const open = chat.loaded && state === "open";

  return (
    <Panel title={t("title")} data-testid="chat-panel">
      <div className="flex flex-wrap items-center justify-between gap-group">
        <InfoToggleButton
          label={t("infoLabel")}
          expanded={infoOpen}
          controls={infoId}
          onClick={() => setInfoOpen(!infoOpen)}
          data-testid="chat-info-toggle"
        />
        <Button variant="secondary" aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => setCollapsed(!collapsed)} data-testid="chat-toggle">
          {t(collapsed ? "expand" : "collapse")}
        </Button>
      </div>
      <InfoToggleNote id={infoId} open={infoOpen} data-testid="chat-info">
        {t("spectatorInfo")}
      </InfoToggleNote>
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
        {chat.loaded && state !== "open" && <p className="m-0 text-body text-text-secondary">{t("closed")}</p>}
        {open && (
          <ChatMessageList
            messages={chat.messages}
            labelOf={(seat) => (
              <PlayerLabel name={playerNameOf(players.find((player) => player.seat === seat), common)} testId="chat-sender" t={common} />
            )}
            pending={chat.pending ? { text: chat.pending.text, seat: null, spectatorName: t("you") } : null}
          />
        )}
        {open && canWrite && (
          <ChatComposer maxLength={chat.limits?.maxLength ?? CHAT_MAX_LENGTH} blockedReason={null} send={chat.send} />
        )}
        {open && !canWrite && (
          <p className="m-0 text-body text-text-secondary" data-testid="chat-read-only">
            {t("readOnly")}
          </p>
        )}
      </div>
    </Panel>
  );
}
