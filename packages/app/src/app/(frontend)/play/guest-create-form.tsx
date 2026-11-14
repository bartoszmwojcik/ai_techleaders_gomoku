"use client";

import { CREATE_GAME_LIMIT } from "@gomoku/core";
import { nicknameSchema } from "@gomoku/core/games/nickname";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Checkbox } from "@gomoku/ui/game/checkbox";
import { ConfirmDialog } from "@gomoku/ui/game/confirm-dialog";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import { GameSettingsPicker } from "@/components/games/game-settings-picker";
import { OpponentPicker } from "@/components/games/opponent-picker";
import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps } from "@/i18n/client";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, localValueMessage, type ErrorTexts } from "@/lib/api-error-text";
import { DEFAULT_OPPONENT, opponentBody, playsBot, type OpponentSetting } from "@/lib/games/opponent";
import { DEFAULT_SETTINGS, settingsBody, type GameSettingsChoice } from "@/lib/games/settings";

type Failure =
  | { kind: "limit"; retryAfterSeconds: number | undefined }
  | { kind: "server" }
  | { kind: "network" }
  /** `503 BOT_UNAVAILABLE`: the bot is switched off or busy (hosted-bot spec). */
  | { kind: "bot-unavailable" }
  /** BR-13: the browser holds a game in progress. */
  | { kind: "active"; gameId: string | undefined }
  /** BR-13: the browser waits in a game of its own; it may be given up (L32). */
  | { kind: "waiting"; gameId: string | undefined };

/**
 * p08 "Zagraj ze znajomym bez konta" (E02-S08): the nickname, the warning about losing the game
 * with the browser and one button that sends `acknowledgedGuestWarning: true`, creates the game
 * and opens its page. The server validates the nickname too; its refusal sits next to the field.
 * While the bot is on (`botEnabled`, hosted-bot R19) the visitor may play it instead: the game starts at once.
 */
type Props = TextsProps<"home"> & {
  botEnabled?: boolean;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

export function GuestCreateForm({ botEnabled = false, errorTexts = {}, ...texts }: Props) {
  const t = textsOf<"home">(plHome, texts);
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [settings, setSettings] = useState<GameSettingsChoice>(DEFAULT_SETTINGS);
  const [opponent, setOpponent] = useState<OpponentSetting>(DEFAULT_OPPONENT);
  const withBot = botEnabled && playsBot(opponent, settings.variant);
  const [asking, setAsking] = useState(false);
  // State alone lags a double click by one render; the ref closes that gap (a second game would be a 409).
  const inFlight = useRef(false);
  const nicknameField = useRef<HTMLInputElement>(null);

  function refuseNickname(message: string) {
    setNicknameError(message);
    // The field may be disabled while busy; focus moves once the request is over.
    setTimeout(() => nicknameField.current?.focus(), 0);
  }

  async function submit(cancelOwnWaitingGame = false) {
    if (inFlight.current) return;
    // LUKA D08: the text field has no counter and `maxLength` counts UTF-16 units, so the schema validates.
    const checked = nicknameSchema.safeParse(nickname);
    if (!checked.success) {
      setAsking(false);
      refuseNickname(localValueMessage(errorTexts, "nickname", checked.error));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    setNicknameError(null);
    const result = await apiCall<{ gameId: string }>("/api/games", {
      body: {
        acknowledgedGuestWarning: true,
        ...(checked.data === undefined ? {} : { nickname: checked.data }),
        ...(cancelOwnWaitingGame ? { cancelOwnWaitingGame: true } : {}),
        ...(withBot ? opponentBody(opponent, settings.variant) : { ...(isPublic ? { isPublic: true } : {}), ...settingsBody(settings) }),
      },
    });
    if (result.ok) {
      // Stay busy while the page navigates, so a second game cannot be created.
      router.push(`/games/${result.data.gameId}`);
      return;
    }
    inFlight.current = false;
    setBusy(false);
    setAsking(false);
    const { code, retryAfterSeconds, data } = result.error;
    const heldGame = typeof data?.gameId === "string" ? data.gameId : undefined;
    const nicknameRefusal = fieldMessages(errorTexts, ["nickname"], result.error).nickname;
    if (nicknameRefusal !== undefined) refuseNickname(nicknameRefusal);
    else if (code === "RATE_LIMITED") setFailure({ kind: "limit", retryAfterSeconds });
    else if (code === "ACTIVE_GAME_EXISTS") setFailure({ kind: "active", gameId: heldGame });
    else if (code === "OWN_WAITING_GAME") setFailure({ kind: "waiting", gameId: heldGame });
    else if (code === "BOT_UNAVAILABLE") setFailure({ kind: "bot-unavailable" });
    else if (code === "network") setFailure({ kind: "network" });
    else setFailure({ kind: "server" });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <>
      {failure?.kind === "limit" && (
        <Alert status="danger" title={t("shared.tooManyInvitations")}>
          {t("shared.createLimit", { count: CREATE_GAME_LIMIT })} {rateLimitedError(failure.retryAfterSeconds).details}
        </Alert>
      )}
      {failure?.kind === "bot-unavailable" && <Alert status="warning" title={t("shared.botUnavailable")} role="alert" />}
      {failure?.kind === "server" && <Alert status="danger" title={t("play.failed")} />}
      {failure?.kind === "network" && (
        <Alert status="danger" title={t("shared.network.title")}>
          {t("shared.network.body")}
        </Alert>
      )}
      {failure?.kind === "active" && (
        <Alert status="warning" title={t("shared.activeGame.title")} role="alert">
          {t("shared.activeGame.body")}{" "}
          {failure.gameId && <TextLink href={`/games/${failure.gameId}`}>{t("shared.goToGame")}</TextLink>}
        </Alert>
      )}
      {failure?.kind === "waiting" && (
        <Alert status="warning" title={t("shared.ownWaiting")} role="alert">
          {t("play.waitingBody")}{" "}
          {failure.gameId && <TextLink href={`/games/${failure.gameId}`}>{t("shared.backToGame")}</TextLink>}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-stack">
        {/* LUKA D10: no pattern for "nickname field + warning + button"; Pole formularza, Alert and Przycisk are put together here. */}
        <Field
          label={t("shared.nickname")}
          requirement={t("shared.optional")}
          id="guest-nickname"
          hint={t("shared.nicknameHint", { seat: 1 })}
          error={nicknameError}
        >
          {(control) => (
            <TextInput
              {...control}
              ref={nicknameField}
              autoComplete="off"
              disabled={busy}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          )}
        </Field>
        <GameSettingsPicker value={settings} onChange={setSettings} disabled={busy} {...texts} />
        {botEnabled && <OpponentPicker value={opponent} variant={settings.variant} onChange={setOpponent} disabled={busy} {...texts} />}
        {/* A game with the bot is always private (R14). */}
        {!withBot && (
          <Checkbox
            label={t("shared.publicGame.label")}
            hint={t("shared.publicGame.hint")}
            checked={isPublic}
            onCheckedChange={(value) => setIsPublic(value === true)}
            disabled={busy}
            data-testid="guest-create-public"
          />
        )}
        <Alert status="warning" title={t("shared.guestWarningTitle")}>
          {t("play.warningBody")}
          {/* BR-24: a guest has no history, so a game with the bot is not kept either. */}
          {withBot && ` ${t("play.botNotKept")}`}
        </Alert>
        {!withBot && <p className="m-0 text-body text-text-secondary">{t("play.validFor")}</p>}
        <div className="flex flex-wrap items-center gap-group">
          <Button type="submit" size="large" data-testid="guest-create" loading={busy && !asking}>
            {busy && !asking
              ? t(withBot ? "shared.creatingGame" : "shared.creatingInvitation")
              : t(withBot ? "play.confirmBot" : "play.confirmInvitation")}
          </Button>
          {(failure?.kind === "server" || failure?.kind === "network") && (
            <Button variant="secondary" onClick={() => void submit()}>
              {t("shared.retry")}
            </Button>
          )}
          {failure?.kind === "waiting" && (
            <Button variant="secondary" data-testid="guest-cancel-own" onClick={() => setAsking(true)}>
              {t("play.cancelAndCreate")}
            </Button>
          )}
          <TextLink href="/" placement="standalone">
            {t("shared.back")}
          </TextLink>
        </div>
      </form>

      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => !open && !busy && setAsking(false)}
        title={t("play.dialog.title")}
        description={t("play.dialog.description")}
        confirmLabel={t(busy ? "play.dialog.confirming" : "play.dialog.confirm")}
        cancelLabel={t("shared.back")}
        confirming={busy}
        onConfirm={() => void submit(true)}
      />
    </>
  );
}
