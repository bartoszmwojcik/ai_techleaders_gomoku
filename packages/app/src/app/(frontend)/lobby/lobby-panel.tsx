"use client";

import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { EmptyState } from "@gomoku/ui/game/empty-state";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { LobbyList, LobbyRow } from "@gomoku/ui/game/lobby-list";
import { Panel } from "@gomoku/ui/game/panel";
import { SeekingStatus } from "@gomoku/ui/game/seeking-status";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";
import { TextLink } from "@gomoku/ui/game/text-link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { rateLimitedError } from "@/components/feedback/rate-limited-error";
import { GameSettingsPicker } from "@/components/games/game-settings-picker";
import { usePageVisibility } from "@/components/games/use-page-visibility";
import { apiCall } from "@/lib/api-client";
import plHome from "@/i18n/catalogs/pl/home";
import plLobby from "@/i18n/catalogs/pl/lobby";
import { textsOf, type TextsProps } from "@/i18n/client";
import { withNodes } from "@/i18n/rich";
import { sinceLabel, type LobbyData } from "@/lib/games/lobby";
import { DEFAULT_SETTINGS, settingsBody, settingsLabel, type GameSettingsChoice } from "@/lib/games/settings";

/** The lobby is read every 3 s while the tab is visible (#25 Q8), like a waiting game. */
export const LOBBY_POLL_INTERVAL_MS = 3000;
/** Failed reads in a row before the list gives way to the error state. */
export const LOBBY_FAILURES_BEFORE_ERROR = 2;
/** A read that takes longer is abandoned, so one hung request cannot stop the polling. */
export const LOBBY_READ_TIMEOUT_MS = 8000;

type Mine = LobbyData["me"];
type Rest = Pick<LobbyData, "currentGame" | "seekers">;
// Each part remembers when it reached this page on the monotonic clock of the browser; the server's
// relative times (`expiresInMs`, `sinceMs`) are counted down from that moment, never from the device clock.
type Stamped<T> = { value: T; at: number };

type Problem = "limit" | "signed-out" | "server" | "network" | "withdraw" | "taken" | "seeker-expired" | "pick-failed";

function problemOf(code: string): Problem {
  if (code === "RATE_LIMITED") return "limit";
  if (code === "UNAUTHORIZED") return "signed-out";
  if (code === "network") return "network";
  return "server";
}

// What a refused pick says (#26): the two 409s of the race and the rest.
function pickProblemOf(code: string): Problem {
  if (code === "LOBBY_SEEKER_TAKEN" || code === "CANNOT_PICK_SELF") return "taken";
  if (code === "LOBBY_SEEKER_EXPIRED") return "seeker-expired";
  if (code === "RATE_LIMITED" || code === "UNAUTHORIZED") return problemOf(code);
  return "pick-failed";
}

/** `/lobby` (E03-S01): the own "looking for a game" status and the read-only list of the others. */
type Props = TextsProps<"lobby"> & {
  initial: LobbyData;
  /** The `home` namespace (the settings and their lines); nothing in Polish. */
  homeTexts?: TextsProps<"home">;
};

export function LobbyPanel({ initial, homeTexts = {}, ...texts }: Props) {
  const t = textsOf<"lobby">(plLobby, texts);
  const home = textsOf<"home">(plHome, homeTexts);
  const router = useRouter();
  // When the server's answer reached this page. Only read once mounted (`now` is `null` before), so the
  // server and the first client render agree although this value differs between them.
  const [origin] = useState(() => performance.now());
  const [mine, setMineState] = useState<Stamped<Mine>>(() => ({ value: initial.me, at: origin }));
  const [rest, setRest] = useState<Stamped<Rest>>(() => ({
    value: { currentGame: initial.currentGame, seekers: initial.seekers },
    at: origin,
  }));
  // `null` until mounted: the server and the first client render both show the times as received.
  const [now, setNow] = useState<number | null>(null);
  const [failures, setFailures] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [busy, setBusy] = useState<"mark" | null>(null);
  // The seeker whose pick is in flight; the buttons of the others are locked meanwhile.
  const [picking, setPicking] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ kind: Problem; retryAfterSeconds?: number } | null>(null);
  const [expired, setExpired] = useState(false);
  const [settings, setSettings] = useState<GameSettingsChoice>(DEFAULT_SETTINGS);

  const reading = useRef(false);
  // Bumped by every answer to the player's own action; a read that began before it is stale.
  const version = useRef(0);
  const marking = useRef(false);
  const withdrawing = useRef(false);
  const pickingRef = useRef(false);
  // Whether the page already knows of a game; a game that appears later (somebody picked us) sends us there.
  const knowsGame = useRef(initial.currentGame !== null);
  // The own status as the latest answer left it. Set together with the state, so a read that follows an
  // action at once does not see the status from before it.
  const latestMine = useRef(mine);
  const setMine = useCallback((next: Stamped<Mine>) => {
    latestMine.current = next;
    setMineState(next);
  }, []);

  const read = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    const startedVersion = version.current;
    const result = await apiCall<LobbyData>("/api/lobby", {
      method: "GET",
      signal: AbortSignal.timeout(LOBBY_READ_TIMEOUT_MS),
    });
    reading.current = false;
    if (startedVersion !== version.current) return;
    setReloading(false);
    if (!result.ok) {
      if (result.error.code === "UNAUTHORIZED") setProblem({ kind: "signed-out" });
      else setFailures((count) => count + 1);
      return;
    }
    const at = performance.now();
    // Our status is gone although the player did nothing (an own action bumps `version` and discards this
    // read above): it ran out, and the countdown and the read can race, or the tab was frozen. Say so.
    if (latestMine.current.value && result.data.me === null) setExpired(true);
    setFailures(0);
    if (result.data.currentGame && !knowsGame.current) {
      // Somebody picked us (#26): the game exists, go there.
      knowsGame.current = true;
      router.push(`/games/${result.data.currentGame.gameId}`);
    }
    setNow(at);
    setMine({ value: result.data.me, at });
    setRest({ value: { currentGame: result.data.currentGame, seekers: result.data.seekers }, at });
  }, [setMine, router]);

  const hidden = usePageVisibility({ onReturn: () => void read() });

  // Reads on a timer while the tab is visible; the second counter drives the countdowns.
  useEffect(() => {
    if (hidden) return;
    const reader = setInterval(() => void read(), LOBBY_POLL_INTERVAL_MS);
    const ticker = setInterval(() => {
      const at = performance.now();
      setNow(at);
      // The own status ran out: the button returns at once and the server is asked for the truth.
      const current = latestMine.current;
      if (current.value && current.value.expiresInMs - Math.max(0, at - current.at) <= 0) {
        setExpired(true);
        void read();
      }
    }, 1000);
    return () => {
      clearInterval(reader);
      clearInterval(ticker);
    };
  }, [hidden, read]);

  const elapsed = (stamp: number) => (now === null ? 0 : Math.max(0, now - stamp));
  const myLeft = mine.value ? mine.value.expiresInMs - elapsed(mine.at) : 0;
  const seeking = mine.value !== null && myLeft > 0;
  const seekers = rest.value.seekers
    .map((seeker) => ({
      ...seeker,
      sinceMs: seeker.sinceMs + elapsed(rest.at),
      expiresInMs: seeker.expiresInMs - elapsed(rest.at),
    }))
    .filter((seeker) => seeker.expiresInMs > 0);
  const { currentGame } = rest.value;

  async function onMark() {
    if (marking.current) return;
    marking.current = true;
    setBusy("mark");
    setProblem(null);
    setExpired(false);
    const result = await apiCall<{ me: NonNullable<Mine> }>("/api/lobby/seeking", { method: "PUT", ...(settings.variant === "paper" ? { body: settingsBody(settings) } : {}) });
    marking.current = false;
    setBusy(null);
    version.current += 1;
    if (result.ok) {
      const at = performance.now();
      setNow(at);
      setMine({ value: { id: result.data.me.id, expiresInMs: result.data.me.expiresInMs }, at });
      void read();
      return;
    }
    const { code, data, retryAfterSeconds } = result.error;
    if (code === "ACTIVE_GAME_EXISTS" && typeof data?.gameId === "string") {
      // BR-13: the page switches to "you already have a game" with the way back.
      knowsGame.current = true;
      setRest(({ value }) => ({ value: { ...value, currentGame: { gameId: data.gameId as string, status: "active" } }, at: performance.now() }));
      return;
    }
    setProblem({ kind: problemOf(code), retryAfterSeconds });
  }

  async function onPick(seekerId: string) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(seekerId);
    setProblem(null);
    const result = await apiCall<{ gameId: string }>(`/api/lobby/seekers/${seekerId}/pick`, { method: "POST" });
    version.current += 1;
    if (result.ok) {
      // The page is left: the guard stays on, so nothing can be picked while the navigation runs.
      knowsGame.current = true;
      router.push(`/games/${result.data.gameId}`);
      return;
    }
    pickingRef.current = false;
    setPicking(null);
    const { code, data, retryAfterSeconds } = result.error;
    if (code === "ACTIVE_GAME_EXISTS" && typeof data?.gameId === "string") {
      knowsGame.current = true;
      setRest(({ value }) => ({ value: { ...value, currentGame: { gameId: data.gameId as string, status: "active" } }, at: performance.now() }));
      return;
    }
    setProblem({ kind: pickProblemOf(code), retryAfterSeconds });
    // The list is stale (the seeker is gone or someone is faster): show the truth at once.
    void read();
  }

  async function onWithdraw() {
    if (withdrawing.current) return;
    withdrawing.current = true;
    setProblem(null);
    const result = await apiCall<{ me: null }>("/api/lobby/seeking", { method: "DELETE" });
    withdrawing.current = false;
    version.current += 1;
    if (result.ok) {
      setMine({ value: null, at: performance.now() });
      void read();
      return;
    }
    setProblem({ kind: result.error.code === "UNAUTHORIZED" ? "signed-out" : "withdraw" });
  }

  function onRetry() {
    setReloading(true);
    void read();
  }

  const markButton = (variant: "primary" | "secondary") => (
    <Button variant={variant} loading={busy === "mark"} onClick={() => void onMark()}>
      {t("mark")}
    </Button>
  );

  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{t("heading")}</h1>
      {problem?.kind === "signed-out" && (
        <Alert status="warning" title={t("sessionExpired")} role="alert">
          {withNodes(t("signedOut", { link: "{link}" }), {
            link: <TextLink href="/login?next=%2Flobby">{t("loginAgain")}</TextLink>,
          })}
        </Alert>
      )}
      {currentGame ? (
        <>
          <Alert status="warning" title={t("activeTitle")}>
            {t("activeBody")}
          </Alert>
          <TextLink href={`/games/${currentGame.gameId}`} placement="standalone">
            {t("backToOwn")}
          </TextLink>
        </>
      ) : (
        <>
          {problem?.kind === "limit" && (
            <Alert status="danger" title={rateLimitedError(problem.retryAfterSeconds).title} role="alert">
              {rateLimitedError(problem.retryAfterSeconds).details}
            </Alert>
          )}
          {problem?.kind === "server" && (
            <Alert status="danger" title={t("markFailedTitle")} role="alert">
              {t("markFailedBody")}
            </Alert>
          )}
          {problem?.kind === "network" && (
            <Alert status="danger" title={t("networkTitle")} role="alert">
              {t("networkBody")}
            </Alert>
          )}
          {problem?.kind === "taken" && (
            <Alert status="warning" title={t("takenTitle")} role="alert">
              {t("takenBody")}
            </Alert>
          )}
          {problem?.kind === "seeker-expired" && (
            <Alert status="info" title={t("expiredTitle")} role="status">
              {t("seekerExpired")}
            </Alert>
          )}
          {problem?.kind === "pick-failed" && (
            <Alert status="danger" title={t("pickFailedTitle")} role="alert">
              {t("pickFailedBody")}
            </Alert>
          )}
          {problem?.kind === "withdraw" && (
            <Alert status="danger" title={t("withdrawFailedTitle")} role="alert">
              {t("withdrawFailedBody")}
            </Alert>
          )}
          {expired && !seeking && (
            <Alert status="info" title={t("expiredTitle")} role="status">
              {t("markAgain")}
            </Alert>
          )}
          {seeking ? (
            <div data-testid="lobby-seeking">
              <SeekingStatus
                title={t("seekingTitle")}
                expiresLabel={t("seekingExpires")}
                expiresInMs={myLeft}
                withdrawLabel={t("withdraw")}
                onWithdraw={() => void onWithdraw()}
              />
            </div>
          ) : (
            <div data-testid="lobby-mark" className="flex flex-col items-start gap-stack">
              <GameSettingsPicker value={settings} onChange={setSettings} disabled={busy === "mark"} {...homeTexts} />
              {markButton("primary")}
            </div>
          )}
          <Panel title={t("listTitle")}>
            {reloading ? (
              <SkeletonRegion label={t("loading")} className="gap-stack">
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} className="h-target" />
                ))}
              </SkeletonRegion>
            ) : failures >= LOBBY_FAILURES_BEFORE_ERROR ? (
              <ErrorState
                title={t("loadFailedTitle")}
                action={
                  <Button variant="secondary" onClick={onRetry}>
                    {t("retry")}
                  </Button>
                }
              >
                {t("loadFailedBody")}
              </ErrorState>
            ) : seekers.length === 0 ? (
              <EmptyState
                title={t("emptyTitle")}
                action={seeking ? undefined : markButton("secondary")}
              >
                {t(seeking ? "emptySeeking" : "emptyIdle")}
              </EmptyState>
            ) : (
              <LobbyList label={t("listTitle")}>
                {seekers.map((seeker) => (
                  <LobbyRow
                    key={seeker.id}
                    name={seeker.displayName}
                    since={t("rowSince", { settings: settingsLabel(seeker.variant, seeker.timeControlMs, home), since: sinceLabel(seeker.sinceMs, t) })}
                    expiresLabel={t("rowExpires")}
                    expiresInMs={seeker.expiresInMs}
                    selectLabel={t("play")}
                    selectAriaLabel={t("playWith", { name: seeker.displayName })}
                    selecting={picking === seeker.id}
                    selectDisabled={picking !== null && picking !== seeker.id}
                    onSelect={() => void onPick(seeker.id)}
                  />
                ))}
              </LobbyList>
            )}
          </Panel>
        </>
      )}
      <TextLink href="/" placement="standalone">
        {t("backHome")}
      </TextLink>
    </main>
  );
}
