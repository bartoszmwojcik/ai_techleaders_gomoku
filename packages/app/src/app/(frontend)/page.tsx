import { BOARD_SIZE } from "@gomoku/core";
import { Alert } from "@gomoku/ui/game/alert";
import { Button } from "@gomoku/ui/game/button";
import { TextLink } from "@gomoku/ui/game/text-link";
import { connection } from "next/server";

import { LogoutButton } from "@/components/auth/logout-button";
import { VerifyEmailNotice } from "@/components/auth/verify-email-banner";
import { CreateGameButton } from "@/components/games/create-game-button";
import { DismissibleNotice } from "@/components/games/dismissible-notice";
import { getCurrentUserWith } from "@/server/http/auth";
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

const GAME_PHASE_TEXT = { waiting: "Czeka na przeciwnika.", active: "W toku." } as const;
/** L27: a guest (creator or joiner) sees "Masz partię" for a waiting and an active game only. */
const GUEST_PHASE_TEXT = { waiting: "Czekasz na przeciwnika.", active: "Partia w toku." } as const;

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
  const hasActiveGame = currentGame?.status === "active";
  // Only the first `notice` counts; the only known one is the message after cancelling a game.
  const { notice } = await searchParams;
  const cancelled = (Array.isArray(notice) ? notice[0] : notice) === "cancelled";

  const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    return { key: `${row}:${col}`, stone: PREVIEW_STONES.get(`${row}:${col}`) };
  });

  return (
    <main className="mx-auto flex w-full flex-1 max-w-5xl flex-col items-center justify-center gap-section px-panel py-section">
      {cancelled && (
        <DismissibleNotice title="Zaproszenie anulowane" closeLabel="Zamknij">
          Zaproszenie zostało anulowane. Link jest już nieważny.
        </DismissibleNotice>
      )}
      {user && !user.emailVerifiedAt && (
        <VerifyEmailNotice userId={user.id} email={user.email} />
      )}
      <div className="flex w-full flex-col items-center justify-center gap-section md:flex-row">
        <section className="max-w-sm space-y-4 text-center md:text-left">
          <h1 className="text-title font-strong tracking-(--letter-spacing-title)">
            Gomoku
          </h1>
          <p className="text-lead text-text-secondary">
            Pięć w linii wygrywa. Zagraj ze znajomym albo znajdź przeciwnika w
            lobby.
          </p>
          <p className="text-meta text-text-muted">
            Swobodne zasady · plansza {BOARD_SIZE}×{BOARD_SIZE} · 10 minut na
            gracza
          </p>
          {user ? (
            <div className="flex flex-col items-center gap-stack md:items-start">
              <p
                className="m-0 text-body text-text-primary"
                data-testid="signed-in-as"
              >
                Zalogowano jako{" "}
                <strong className="font-strong">{user.displayName}</strong>
              </p>
              {currentGame && (
                <Alert status="info" title="Masz partię">
                  {GAME_PHASE_TEXT[currentGame.status]}{" "}
                  <TextLink href={`/games/${currentGame.gameId}`}>
                    Wróć do partii
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
              />
              <div className="flex flex-wrap items-center justify-center gap-group md:justify-start">
                <Button asChild variant="secondary">
                  <a href="/account">Konto</a>
                </Button>
                <LogoutButton hasActiveGame={hasActiveGame} />
                <TextLink href="/join" placement="standalone">
                  Masz kod?
                </TextLink>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-stack md:items-start">
              {guestGame && (
                <Alert status="info" title="Masz partię">
                  {GUEST_PHASE_TEXT[guestGame.status]}{" "}
                  <TextLink href={`/games/${guestGame.gameId}`}>Wróć do partii</TextLink>
                </Alert>
              )}
              <div className="flex flex-wrap justify-center gap-group md:justify-start">
                <Button asChild>
                  <a href="/register">Załóż konto</a>
                </Button>
                <Button asChild variant="secondary">
                  <a href="/login">Zaloguj się</a>
                </Button>
                <TextLink href="/join" placement="standalone">
                  Masz kod?
                </TextLink>
              </div>
              {/* L34: a secondary button (not a small link) in the action column; "Załóż konto" stays the main action. */}
              <Button asChild variant="secondary" className="w-full">
                <a href="/play">Zagraj ze znajomym bez konta</a>
              </Button>
            </div>
          )}
        </section>

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
