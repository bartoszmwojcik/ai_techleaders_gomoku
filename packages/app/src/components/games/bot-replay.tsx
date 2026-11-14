"use client";

import { CREATE_GAME_LIMIT } from "@gomoku/core";
import type { BotLevel } from "@gomoku/core/bot/choose-move";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import plGame from "@/i18n/catalogs/pl/game";
import plCommon from "@/i18n/catalogs/pl/common";
import { useT } from "@/i18n/context";
import { apiCall } from "@/lib/api-client";

type Props = {
  /** The level of the bot just played: the new game keeps it (R13). */
  level: BotLevel;
  /** A guest sends the acknowledgement again: the warning about the browser stays on the game page. */
  guest: boolean;
  /** A guest's own nickname, kept in the new game; absent for an account or a guest with the default name. */
  nickname?: string;
};

type Problem =
  | { kind: "bot-unavailable" }
  | { kind: "active"; gameId: string | undefined }
  | { kind: "limit"; retryAfterSeconds: number | undefined }
  | { kind: "failed"; network: boolean };

/**
 * The end of a game with the bot (hosted-bot R13): no rematch, but "Zagraj ponownie z botem" creates a
 * new game at the same level, which may be refused like any create (the bot is off, a game is held,
 * the limit). The new game reads the resources afresh (BR-57), so its strength may differ.
 */
export function BotReplay({ level, guest, nickname }: Props) {
  const t = useT("game", plGame);
  const common = useT("common", plCommon);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // State alone lags a double click by one render; the ref closes that gap (a second game would be a 409).
  const inFlight = useRef(false);

  async function playAgain() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    const result = await apiCall<{ gameId: string }>("/api/games", {
      body: {
        ...(guest ? { acknowledgedGuestWarning: true, ...(nickname === undefined ? {} : { nickname }) } : {}),
        opponent: "bot",
        botLevel: level,
      },
    });
    if (result.ok) {
      // Stay busy while the page navigates, so a second game cannot be created.
      router.push(`/games/${result.data.gameId}`);
      return;
    }
    inFlight.current = false;
    setBusy(false);
    const { code, retryAfterSeconds, data } = result.error;
    if (code === "BOT_UNAVAILABLE") setProblem({ kind: "bot-unavailable" });
    else if (code === "ACTIVE_GAME_EXISTS") setProblem({ kind: "active", gameId: typeof data?.gameId === "string" ? data.gameId : undefined });
    else if (code === "RATE_LIMITED") setProblem({ kind: "limit", retryAfterSeconds });
    else setProblem({ kind: "failed", network: code === "network" });
  }

  return (
    <section aria-labelledby="bot-replay-h" className="flex flex-col gap-stack" data-testid="bot-replay">
      <h2 id="bot-replay-h" className="m-0 text-subsection font-strong">
        {t("botReplay.heading")}
      </h2>
      <p className="m-0 text-body text-text-secondary">{t("botReplay.intro")}</p>
      {problem?.kind === "bot-unavailable" && <Alert status="warning" title={t("botReplay.botUnavailable")} role="alert" />}
      {problem?.kind === "active" && (
        <Alert status="warning" title={t("botReplay.activeTitle")} role="alert">
          {t("botReplay.activeBody")}{" "}
          {problem.gameId && <TextLink href={`/games/${problem.gameId}`}>{t("botReplay.goToGame")}</TextLink>}
        </Alert>
      )}
      {problem?.kind === "limit" && (
        <Alert status="danger" title={t("botReplay.limitTitle")} role="alert">
          {t("botReplay.limit", { count: CREATE_GAME_LIMIT })} {rateLimitedError(problem.retryAfterSeconds, common).details}
        </Alert>
      )}
      {problem?.kind === "failed" && (
        <Alert status="danger" title={t("botReplay.failedTitle")} role="alert">
          {t(problem.network ? "botReplay.failedNetwork" : "botReplay.failedServer")}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-group">
        <Button loading={busy} onClick={() => void playAgain()} data-testid="bot-replay-button">
          {t(busy ? "botReplay.creating" : "botReplay.playAgain")}
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">{t("shared.backToPanel")}</Link>
        </Button>
      </div>
    </section>
  );
}
