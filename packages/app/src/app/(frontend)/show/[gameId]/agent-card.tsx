"use client";

import { Button } from "@gomoku/ui/game/button";
import { Panel } from "@gomoku/ui/game/panel";
import { TurnStatus } from "@gomoku/ui/game/turn-status";
import { useEffect, useRef, useState } from "react";

import { countdownOf, type ShowTranslator } from "@/lib/show/texts";
import type { ShowView } from "@/server/http/show-view";

/** What stands for the code while it is hidden: the shape of a code, none of its letters (P12). */
export const MASKED_CODE = "••••-••••";

type Props = {
  invitation: NonNullable<ShowView["invitation"]>;
  /** The server's time of the answer that brought the invitation (`clock.now`): the countdown follows it. */
  serverNow: number;
  t: ShowTranslator;
  /** Called once per answer when the countdown reaches zero: only the server closes the show. */
  onExpire: () => void;
};

/**
 * The card of a bot vs agent show waiting for its agent (show-mode P12, "UI/UX"): the code masked until the
 * administrator shows it (the audience sees the screen), "Pokaż"/"Kopiuj", the MCP server's address and the time
 * left. It is gone once the agent joined, because the server no longer sends the code.
 */
export function AgentCard({ invitation, serverNow, t, onExpire }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");
  const expiresAt = Date.parse(invitation.expiresAt);
  const [left, setLeft] = useState(() => Math.max(0, expiresAt - serverNow));
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  });

  // Counted from the server's time of this answer plus the browser's monotonic clock since, never the wall clock.
  useEffect(() => {
    const arrived = performance.now();
    let told = false;
    const tick = () => {
      const remaining = Math.max(0, expiresAt - serverNow - (performance.now() - arrived));
      setLeft(remaining);
      if (remaining === 0 && !told) {
        told = true;
        expire.current();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, serverNow]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(invitation.code);
      setCopy("ok");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <Panel title={t("room.agent.title")} data-testid="show-agent-card">
      <TurnStatus>
        <span data-testid="show-agent-waiting">{t("room.agent.waiting", { time: countdownOf(t, left) })}</span>
      </TurnStatus>
      <p className="m-0 text-body text-text-secondary">{t("room.agent.body")}</p>
      <div className="flex flex-col gap-1">
        <span className="text-meta text-text-secondary">{t("room.agent.codeLabel")}</span>
        {/* `aria-label` is not announced on `code` (a generic role): hidden, the bullets are silent and a text says so. */}
        <code className="text-lead font-strong" aria-hidden={revealed ? undefined : true} data-testid="show-agent-code">
          {revealed ? invitation.code : MASKED_CODE}
        </code>
        {!revealed && (
          <span className="sr-only" data-testid="show-agent-code-hidden">
            {t("room.agent.codeHidden")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-stack">
        <Button variant="secondary" aria-pressed={revealed} onClick={() => setRevealed(!revealed)} data-testid="show-agent-reveal">
          {revealed ? t("room.agent.hide") : t("room.agent.show")}
        </Button>
        <Button variant="secondary" onClick={() => void copyCode()} data-testid="show-agent-copy">
          {t("room.agent.copy")}
        </Button>
      </div>
      <p role="status" className="m-0 text-meta text-text-secondary" data-testid="show-agent-copy-status">
        {copy === "ok" ? t("room.agent.copied") : copy === "failed" ? t("room.agent.copyFailed") : ""}
      </p>
      <div className="flex flex-col gap-1">
        <span className="text-meta text-text-secondary">{t("room.agent.mcpLabel")}</span>
        <code className="text-body break-all" data-testid="show-agent-mcp">
          {invitation.mcpUrl}
        </code>
      </div>
    </Panel>
  );
}
