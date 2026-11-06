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
import { apiCall } from "@/lib/api-client";
import { BOT_UNAVAILABLE_TEXT, DEFAULT_OPPONENT, opponentBody, playsBot, type OpponentSetting } from "@/lib/games/opponent";
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
export function GuestCreateForm({ botEnabled = false }: { botEnabled?: boolean }) {
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
      refuseNickname(checked.error.issues[0]!.message);
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
    const { code, retryAfterSeconds, fieldErrors, data } = result.error;
    const heldGame = typeof data?.gameId === "string" ? data.gameId : undefined;
    if (fieldErrors?.nickname?.[0] !== undefined) refuseNickname(fieldErrors.nickname[0]);
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
        <Alert status="danger" title="Zbyt wiele zaproszeń">
          Limit to {CREATE_GAME_LIMIT} utworzeń na godzinę. {rateLimitedError(failure.retryAfterSeconds).details}
        </Alert>
      )}
      {failure?.kind === "bot-unavailable" && <Alert status="warning" title={BOT_UNAVAILABLE_TEXT} role="alert" />}
      {failure?.kind === "server" && <Alert status="danger" title="Nie udało się utworzyć zaproszenia. Spróbuj ponownie." />}
      {failure?.kind === "network" && (
        <Alert status="danger" title="Brak połączenia">
          Nie udało się połączyć z serwerem. Spróbuj ponownie.
        </Alert>
      )}
      {failure?.kind === "active" && (
        <Alert status="warning" title="Masz już partię" role="alert">
          Najpierw dokończ bieżącą partię.{" "}
          {failure.gameId && <TextLink href={`/games/${failure.gameId}`}>Przejdź do partii</TextLink>}
        </Alert>
      )}
      {failure?.kind === "waiting" && (
        <Alert status="warning" title="Masz oczekującą partię" role="alert">
          Możesz ją anulować i utworzyć nową albo wrócić do niej.{" "}
          {failure.gameId && <TextLink href={`/games/${failure.gameId}`}>Wróć do partii</TextLink>}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-stack">
        {/* LUKA D10: no pattern for "nickname field + warning + button"; Pole formularza, Alert and Przycisk are put together here. */}
        <Field
          label="Twój nick"
          requirement="(opcjonalnie)"
          id="guest-nickname"
          hint={"Zostaw puste, a będziesz „Gracz 1”"}
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
        <GameSettingsPicker value={settings} onChange={setSettings} disabled={busy} />
        {botEnabled && <OpponentPicker value={opponent} variant={settings.variant} onChange={setOpponent} disabled={busy} />}
        {/* A game with the bot is always private (R14). */}
        {!withBot && (
          <Checkbox
            label="Partia publiczna"
            hint="Po rozpoczęciu partii każdy z kodem lub linkiem będzie mógł ją oglądać."
            checked={isPublic}
            onCheckedChange={(value) => setIsPublic(value === true)}
            disabled={busy}
            data-testid="guest-create-public"
          />
        )}
        <Alert status="warning" title="Grasz bez konta — nie zmieniaj przeglądarki w trakcie partii">
          Jeśli zmienisz przeglądarkę albo wyczyścisz dane, stracisz dostęp do tej partii.
          {/* BR-24: a guest has no history, so a game with the bot is not kept either. */}
          {withBot && " Partia z botem nie zostanie zapisana w historii."}
        </Alert>
        {!withBot && <p className="m-0 text-body text-text-secondary">Zaproszenie jest ważne 24 godziny.</p>}
        <div className="flex flex-wrap items-center gap-group">
          <Button type="submit" data-testid="guest-create" loading={busy && !asking}>
            {busy && !asking
              ? withBot
                ? "Tworzenie partii…"
                : "Tworzenie zaproszenia…"
              : withBot
                ? "Rozumiem, zagraj z botem"
                : "Rozumiem, utwórz zaproszenie"}
          </Button>
          {(failure?.kind === "server" || failure?.kind === "network") && (
            <Button variant="secondary" onClick={() => void submit()}>
              Spróbuj ponownie
            </Button>
          )}
          {failure?.kind === "waiting" && (
            <Button variant="secondary" data-testid="guest-cancel-own" onClick={() => setAsking(true)}>
              Anuluj i utwórz nową
            </Button>
          )}
          <TextLink href="/" placement="standalone">
            Wróć
          </TextLink>
        </div>
      </form>

      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => !open && !busy && setAsking(false)}
        title="Anulować poprzednie zaproszenie?"
        description="Link i kod poprzedniego zaproszenia przestaną działać, a nowa partia zostanie utworzona od razu. Tej operacji nie można cofnąć."
        confirmLabel={busy ? "Anulowanie…" : "Tak, anuluj i utwórz nową"}
        cancelLabel="Wróć"
        confirming={busy}
        onConfirm={() => void submit(true)}
      />
    </>
  );
}
