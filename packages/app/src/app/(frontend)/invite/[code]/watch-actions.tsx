"use client";

import { nicknameSchema } from "@gomoku/core/games/nickname";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { Field } from "@gomoku/ui/game/field";
import { TextInput } from "@gomoku/ui/game/text-input";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { apiCall } from "@/lib/api-client";

type Props = {
  /** The invitation code in its display form, `ABCD-EFGH`. */
  code: string;
  /** An account watches under its name and gives no nickname (BR-41). */
  signedIn: boolean;
};

type Failure = { title: string; details: string };

const FULL: Failure = { title: "Partia ma komplet widzów", details: "Może ją oglądać 20 osób naraz. Spróbuj za chwilę." };

const FAILURES: Record<string, Failure> = {
  SPECTATORS_FULL: FULL,
  RATE_LIMITED: { title: "Zbyt wiele prób — spróbuj za chwilę", details: "Sprawdź kod albo wróć później." },
  network: { title: "Brak połączenia", details: "Nie udało się połączyć z serwerem. Spróbuj ponownie." },
};

/**
 * The button of the invitation page for a game in progress (E10-S02, BR-39): "Oglądaj". A visitor
 * may give a nickname (optional, the rules of a guest's, BR-41); an account watches under its name.
 * The page only opens the link: nobody becomes a spectator until the button is pressed.
 */
export function WatchActions({ code, signedIn }: Props) {
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
      setNicknameError(checked.error.issues[0]!.message);
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
    if (errorCode === "INVALID_INVITATION") {
      // The game ended or was closed to the audience under the page: the server decides what it shows now.
      startRefresh(() => router.refresh());
    } else if (result.error.fieldErrors?.nickname?.[0] !== undefined) {
      setNicknameError(result.error.fieldErrors.nickname[0]);
    } else {
      setFailure(FAILURES[errorCode] ?? { title: "Nie udało się otworzyć partii", details: "Spróbuj ponownie." });
    }
  }

  return (
    <>
      {failure && (
        <Alert status={failure === FULL ? "warning" : "danger"} title={failure.title} role={failure === FULL ? "status" : undefined}>
          {failure.details}
        </Alert>
      )}
      {!signedIn && (
        <Field
          label="Twój nick"
          requirement="(opcjonalnie)"
          id="watch-nickname"
          hint="Zostaw puste, a będziesz oglądać anonimowo"
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
          {watching ? "Otwieranie…" : "Oglądaj partię"}
        </Button>
      </div>
    </>
  );
}
