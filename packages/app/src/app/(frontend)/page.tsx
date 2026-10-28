import { BOARD_SIZE } from "@gomoku/core";
import { Button } from "@gomoku/ui/game/button";
import { connection } from "next/server";

import { LogoutButton } from "@/components/auth/logout-button";
import { withRequestScope } from "@/server/container";
import { getCurrentUser } from "@/server/http/auth";

// Static preview position: a few stones near the centre of the board.
const PREVIEW_STONES = new Map<string, "black" | "white">([
  ["7:7", "black"],
  ["7:8", "white"],
  ["8:8", "black"],
  ["6:6", "white"],
  ["9:9", "black"],
  ["8:6", "white"],
]);

export default async function HomePage() {
  // Reads the session cookie, so the page is rendered per request.
  await connection();
  const user = await getCurrentUser();
  const hasActiveGame = user
    ? await withRequestScope(({ cradle }) => cradle.activeGameCheck.hasActiveGame(user.id))
    : false;

  const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    return { key: `${row}:${col}`, stone: PREVIEW_STONES.get(`${row}:${col}`) };
  });

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col items-center justify-center gap-section px-panel py-section md:flex-row">
      <section className="max-w-sm space-y-4 text-center md:text-left">
        <h1 className="text-title font-strong tracking-(--letter-spacing-title)">Gomoku</h1>
        <p className="text-lead text-text-secondary">
          Pięć w linii wygrywa. Zagraj ze znajomym albo znajdź przeciwnika w lobby.
        </p>
        <p className="text-meta text-text-muted">
          Swobodne zasady · plansza {BOARD_SIZE}×{BOARD_SIZE} · 10 minut na gracza
        </p>
        {user ? (
          <div className="flex flex-col items-center gap-stack md:items-start">
            <p className="m-0 text-body text-text-primary" data-testid="signed-in-as">
              Zalogowano jako <strong className="font-strong">{user.displayName}</strong>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-group md:justify-start">
              <Button asChild>
                <a href="/account">Konto</a>
              </Button>
              <LogoutButton hasActiveGame={hasActiveGame} />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-group md:justify-start">
            <Button asChild>
              <a href="/register">Załóż konto</a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/login">Zaloguj się</a>
            </Button>
          </div>
        )}
      </section>

      <div
        aria-hidden="true"
        data-testid="board"
        className="grid aspect-square w-full max-w-md rounded-base bg-board-surface p-(--board-padding) shadow-board"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
      >
        {cells.map(({ key, stone }) => (
          <div key={key} className="relative flex items-center justify-center">
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
    </main>
  );
}
