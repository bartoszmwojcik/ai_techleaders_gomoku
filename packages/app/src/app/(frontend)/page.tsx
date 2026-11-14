import { BOARD_SIZE } from "@gomoku/core";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { connection } from "next/server";

import { VerifyEmailNotice } from "@/components/auth/verify-email-banner";
import { CreateGameButton } from "@/components/games/create-game-button";
import { HomeRulesLine, HomeRulesProvider } from "@/components/games/home-rules";
import { DismissibleNotice } from "@/components/games/dismissible-notice";
import { clientI18n, getI18n } from "@/i18n/server";
import { getCurrentUserWith } from "@/server/http/auth";
import { isBotEnabled } from "@/server/http/bot-availability";
import { loadGuestCurrentGame } from "@/server/http/guest-game";

// Static preview position: a few stones near the centre of the board.
const PREVIEW_STONES = new Map<string, "black" | "white">([
  ["7:7", "black"],
  ["7:8", "white"],
  ["8:8", "black"],
  ["6:6", "white"],
  ["9:9", "black"],
  ["8:6", "white"],
]);

type HomePageProps = {
  searchParams: Promise<{ notice?: string | string[] }>;
};

// L27: a guest (creator or joiner) sees "Masz partię" for a waiting and an active game only (`page.guestPhase`).

export default async function HomePage({ searchParams }: HomePageProps) {
  // Reads the session cookie, so the page is rendered per request.
  await connection();
  // One request scope reads the session and the game state together.
  const session = await getCurrentUserWith(({ id }, { gameParticipation }) =>
    gameParticipation.currentGame(id),
  );
  const user = session?.user ?? null;
  const currentGame = session?.data ?? null;
  // A visitor may hold a game as a guest (E02-S08): found by the token in the cookie.
  const guestGame = user ? null : await loadGuestCurrentGame();
  // Only the first `notice` counts: the message after cancelling a game, or after deleting the
  // account (E01-S06; shown only without a session, which the deletion just ended).
  const { notice: noticeParam } = await searchParams;
  const notice = Array.isArray(noticeParam) ? noticeParam[0] : noticeParam;
  const cancelled = notice === "cancelled";
  const accountDeleted = notice === "account-deleted" && !user;

  const home = await getI18n("home");
  const { t } = home;
  const homeTexts = clientI18n(home);
  const authTexts = user && !user.emailVerifiedAt ? clientI18n(await getI18n("auth")) : {};

  const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    return { key: `${row}:${col}`, stone: PREVIEW_STONES.get(`${row}:${col}`) };
  });

  return (
    <main className="mx-auto flex w-full flex-1 max-w-5xl flex-col items-center justify-center gap-section px-panel py-section">
      {cancelled && (
        <DismissibleNotice title={t("page.cancelled.title")} closeLabel={t("page.close")}>
          {t("page.cancelled.body")}
        </DismissibleNotice>
      )}
      {accountDeleted && (
        <DismissibleNotice title={t("page.accountDeleted")} closeLabel={t("page.close")} />
      )}
      {user && !user.emailVerifiedAt && (
        <VerifyEmailNotice userId={user.id} email={user.email} {...authTexts} />
      )}
      <div className="flex w-full flex-col items-center justify-center gap-section md:flex-row">
        <HomeRulesProvider>
          <section className="max-w-sm space-y-4 text-center md:text-left">
            <h1 className="text-title font-strong tracking-(--letter-spacing-title)">
              Gomoku
            </h1>
            <p className="text-lead text-text-secondary">{t("page.intro")}</p>
            <HomeRulesLine {...homeTexts} />
            {user ? (
              <div className="flex flex-col gap-stack text-left">
                {currentGame && (
                  <Alert status="info" title={t("page.hasGame")}>
                    {t(`page.phase.${currentGame.status}`)}{" "}
                    <TextLink href={`/games/${currentGame.gameId}`}>
                      {t("shared.backToGame")}
                    </TextLink>
                  </Alert>
                )}
                <CreateGameButton
                  heldGame={
                    currentGame && {
                      gameId: currentGame.gameId,
                      status: currentGame.status,
                    }
                  }
                  botEnabled={await isBotEnabled()}
                  {...homeTexts}
                />
                {/* Two equal secondary buttons: a link to another page is still a link (role=link). */}
                <div className="grid grid-cols-2 gap-group">
                  <Button asChild variant="secondary">
                    <a href="/lobby">{t("page.lobby")}</a>
                  </Button>
                  <Button asChild variant="secondary">
                    <a href="/join">{t("shared.haveCode")}</a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-stack md:items-start">
                {guestGame && (
                  <Alert status="info" title={t("page.hasGame")}>
                    {t(`page.guestPhase.${guestGame.status}`)}{" "}
                    <TextLink href={`/games/${guestGame.gameId}`}>{t("shared.backToGame")}</TextLink>
                  </Alert>
                )}
                <div className="flex flex-wrap justify-center gap-group md:justify-start">
                  <Button asChild>
                    <a href="/register">{t("shared.register")}</a>
                  </Button>
                  <Button asChild variant="secondary">
                    <a href="/login">{t("shared.login")}</a>
                  </Button>
                  <TextLink href="/join" placement="standalone">
                    {t("shared.haveCode")}
                  </TextLink>
                </div>
                {/* L34: a secondary button (not a small link) in the action column; "Załóż konto" stays the main action. */}
                <Button asChild variant="secondary" className="w-full">
                  <a href="/play">{t("page.playWithoutAccount")}</a>
                </Button>
              </div>
            )}
          </section>
        </HomeRulesProvider>

        <div
          aria-hidden="true"
          data-testid="board"
          className="grid aspect-square w-full max-w-md rounded-base bg-board-surface p-(--board-padding) shadow-board"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {cells.map(({ key, stone }) => (
            <div
              key={key}
              className="relative flex items-center justify-center"
            >
              <span className="absolute inset-x-0 top-1/2 h-px bg-board-line" />
              <span className="absolute inset-y-0 left-1/2 w-px bg-board-line" />
              {stone && (
                <span
                  className={`relative z-10 size-(--piece-size) rounded-piece shadow-piece ${
                    stone === "black" ? "bg-piece-black" : "bg-piece-white"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
