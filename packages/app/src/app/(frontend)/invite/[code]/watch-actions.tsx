"use client";

import { SPECTATORS_MAX } from "@gomoku/core/games/constants";
import { nicknameSchema } from "@gomoku/core/games/nickname";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import plHome from "@/i18n/catalogs/pl/home";
import { textsOf, type TextsProps, type TranslatorOf } from "@/i18n/client";
import { apiCall } from "@/lib/api-client";
import { fieldMessages, localValueMessage, type ErrorTexts } from "@/lib/api-error-text";

type Props = TextsProps<"home"> & {
  /** The invitation code in its display form, `ABCD-EFGH`. */
  code: string;
  /** An account watches under its name and gives no nickname (BR-41). */
  signedIn: boolean;
  /** The `errors` namespace (field errors by code); nothing in Polish. */
  errorTexts?: ErrorTexts;
};

type Failure = { title: string; details: string; full?: boolean };

/** What a refused request says, by its code; anything unknown is a plain failure. */
function failureOf(code: string, t: TranslatorOf<"home">): Failure {
  switch (code) {
    case "SPECTATORS_FULL":
      return { title: t("watch.fullTitle"), details: t("watch.fullBody", { count: SPECTATORS_MAX }), full: true };
    case "RATE_LIMITED":
      return { title: t("shared.tooManyAttempts.title"), details: t("shared.tooManyAttempts.body") };
    case "network":
      return { title: t("shared.network.title"), details: t("shared.network.body") };
    default:
      return { title: t("watch.failedTitle"), details: t("watch.failedBody") };
  }
}

/**
 * The button of the invitation page for a game in progress (E10-S02, BR-39): "Oglądaj". A visitor
 * may give a nickname (optional, the rules of a guest's, BR-41); an account watches under its name.
 * The page only opens the link: nobody becomes a spectator until the button is pressed.
 */
export function WatchActions({ code, signedIn, errorTexts = {}, ...texts }: Props) {
  const t = textsOf<"home">(plHome, texts);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // State alone lags a double click by one render; the ref closes that gap.
  const inFlight = useRef(false);
  const busy = watching || refreshing;

  async function watch() {
    if (inFlight.current) return;
    // The server's own schema checks the nickname before the request (the field has no counter, `maxLength` counts UTF-16 units).
    const checked = signedIn ? { success: true as const, data: undefined } : nicknameSchema.safeParse(nickname);
    if (!checked.success) {
      setNicknameError(localValueMessage(errorTexts, "nickname", checked.error));
      return;
    }
    inFlight.current = true;
    setWatching(true);
    setFailure(null);
    setNicknameError(null);
    const result = await apiCall<{ gameId: string }>(`/api/invitations/${encodeURIComponent(code)}/spectate`, {
      body: checked.data === undefined ? {} : { nickname: checked.data },
    });
    if (result.ok) {
      // Stay busy while the page navigates, so a second request is impossible.
      router.replace(`/games/${result.data.gameId}`);
      return;
    }
    inFlight.current = false;
    setWatching(false);
    const { code: errorCode } = result.error;
    const nicknameRefusal = fieldMessages(errorTexts, ["nickname"], result.error).nickname;
    if (errorCode === "INVALID_INVITATION") {
      // The game ended or was closed to the audience under the page: the server decides what it shows now.
      startRefresh(() => router.refresh());
    } else if (nicknameRefusal !== undefined) {
      setNicknameError(nicknameRefusal);
    } else {
      setFailure(failureOf(errorCode, t));
    }
  }

  return (
    <>
      {failure && (
        <Alert status={failure.full ? "warning" : "danger"} title={failure.title} role={failure.full ? "status" : undefined}>
          {failure.details}
        </Alert>
      )}
      {!signedIn && (
        <Field
          label={t("shared.nickname")}
          requirement={t("shared.optional")}
          id="watch-nickname"
          hint={t("watch.nicknameHint")}
          error={nicknameError}
        >
          {(control) => (
            <TextInput
              {...control}
              autoComplete="off"
              disabled={busy}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          )}
        </Field>
      )}
      <div>
        <Button loading={watching} disabled={busy} onClick={() => void watch()}>
          {t(watching ? "watch.opening" : "watch.watch")}
        </Button>
      </div>
    </>
  );
}
