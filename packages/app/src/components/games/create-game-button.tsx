"use client";

import { CREATE_GAME_LIMIT } from "@gomoku/core";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import { GameSettingsPicker } from "@/components/games/game-settings-picker";
import { useHomeRules } from "@/components/games/home-rules";
import { OpponentPicker } from "@/components/games/opponent-picker";
import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { apiCall } from "@/lib/api-client";
import { DEFAULT_OPPONENT, opponentBody, playsBot, type OpponentSetting } from "@/lib/games/opponent";
import { DEFAULT_SETTINGS, settingsBody, type GameSettingsChoice } from "@/lib/games/settings";

/** The game the player already holds a slot in (from the server, `GameParticipation.currentGame`). */
export type HeldGame = { gameId: string; status: "waiting" | "active" };

type Failure =
  | { kind: "active" }
  | { kind: "limit"; retryAfterSeconds: number | undefined }
  | { kind: "signed-out" }
  /** `503 BOT_UNAVAILABLE`: the bot is switched off or busy (hosted-bot spec). */
  | { kind: "bot-unavailable" }
  | { kind: "server" }
  | { kind: "network" };

type Props = TextsProps<"home"> & {
  heldGame: HeldGame | null;
  /** `BOT_ENABLED` (hosted-bot R19): the "Przeciwnik" group shows only while the bot is on. */
  botEnabled?: boolean;
};

/**
 * "Utwórz zaproszenie" (p01): creates a waiting game and opens its page. While the bot is on, the
 * creator may pick it instead of a person: "Zagraj z botem" opens a game already in progress.
 */
export function CreateGameButton({ heldGame, botEnabled = false, ...texts }: Props) {
  const t = textsOf<"home">(plHome, texts);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [settings, setSettings] = useState<GameSettingsChoice>(DEFAULT_SETTINGS);
  const [opponent, setOpponent] = useState<OpponentSetting>(DEFAULT_OPPONENT);
  const withBot = botEnabled && playsBot(opponent, settings.variant);
  const { setVariant } = useHomeRules();
  const [failure, setFailure] = useState<Failure | null>(null);
  // State alone lags a double click by one render; the ref closes that gap (two games would be a 409).
  const inFlight = useRef(false);

  async function onCreate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    // A signed-in user's body is optional: the plain invitation sends none, as before.
    const body = withBot
      ? opponentBody(opponent, settings.variant)
      : { ...(isPublic ? { isPublic: true } : {}), ...settingsBody(settings) };
    const result = await apiCall<{ gameId: string }>("/api/games", Object.keys(body).length > 0 ? { body } : {});
    if (result.ok) {
      // Stay busy while the page navigates, so a second game cannot be created.
      router.push(`/games/${result.data.gameId}`);
      return;
    }
    const { code, retryAfterSeconds } = result.error;
    if (code === "ACTIVE_GAME_EXISTS" && heldGame?.status === "waiting") {
      // L01: the player already waits in a game of their own, so we take them there and say so.
      router.push(`/games/${heldGame.gameId}?notice=own-waiting`);
      return;
    }
    inFlight.current = false;
    setBusy(false);
    if (code === "ACTIVE_GAME_EXISTS") setFailure({ kind: "active" });
    else if (code === "RATE_LIMITED") setFailure({ kind: "limit", retryAfterSeconds });
    else if (code === "UNAUTHORIZED") setFailure({ kind: "signed-out" });
    else if (code === "BOT_UNAVAILABLE") setFailure({ kind: "bot-unavailable" });
    else if (code === "network") setFailure({ kind: "network" });
    else setFailure({ kind: "server" });
  }

  const retry = (
    <div className="mt-group">
      <Button variant="secondary" onClick={() => void onCreate()}>
        {t("shared.retry")}
      </Button>
    </div>
  );

  return (
    <>
      {failure?.kind === "active" && (
        <Alert status="warning" title={t("shared.activeGame.title")} role="alert">
          {t("shared.activeGame.body")}{" "}
          {heldGame && <TextLink href={`/games/${heldGame.gameId}`}>{t("shared.goToGame")}</TextLink>}
        </Alert>
      )}
      {failure?.kind === "limit" && (
        <Alert status="danger" title={t("shared.tooManyInvitations")}>
          {t("shared.createLimit", { count: CREATE_GAME_LIMIT })} {rateLimitedError(failure.retryAfterSeconds).details}
        </Alert>
      )}
      {failure?.kind === "signed-out" && (
        <Alert status="warning" title={t("shared.sessionExpired")}>
          {withNodes(t("create.signedOut", { link: "{link}" }), {
            link: <TextLink href="/login?next=%2F">{t("shared.loginAgain")}</TextLink>,
          })}
        </Alert>
      )}
      {failure?.kind === "bot-unavailable" && <Alert status="warning" title={t("shared.botUnavailable")} role="alert" />}
      {failure?.kind === "server" && (
        <Alert status="danger" title={t("create.failedTitle")}>
          {t("create.failedBody")}
          {retry}
        </Alert>
      )}
      {failure?.kind === "network" && (
        <Alert status="danger" title={t("shared.network.title")}>
          {t("shared.network.body")}
          {retry}
        </Alert>
      )}
      <GameSettingsPicker
        value={settings}
        onChange={(next) => {
          setSettings(next);
          setVariant(next.variant);
        }}
        disabled={busy}
        {...texts}
      />
      {botEnabled && <OpponentPicker value={opponent} variant={settings.variant} onChange={setOpponent} disabled={busy} {...texts} />}
      {/* A game with the bot is always private (R14): no audience to open it to. */}
      {!withBot && (
        <Checkbox
          label={t("shared.publicGame.label")}
          hint={t("shared.publicGame.hint")}
          checked={isPublic}
          onCheckedChange={(value) => setIsPublic(value === true)}
          disabled={busy}
          data-testid="create-game-public"
        />
      )}
      {/* Choice vs action (issue 273): a rule sets the settings above apart from the one main action. */}
      <div className="border-t border-border-default pt-stack">
        <Button data-testid="create-game" size="large" className="w-full" loading={busy} onClick={() => void onCreate()}>
          {withBot
            ? t(busy ? "shared.creatingGame" : "create.playBot")
            : t(busy ? "shared.creatingInvitation" : "create.createInvitation")}
        </Button>
      </div>
    </>
  );
}
