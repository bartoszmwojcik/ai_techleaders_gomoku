import { GameGate } from "@/components/games/game-gate";

// Rendered by `notFound()` in the page: a game that is missing or not the visitor's (p07.2, p07.3).
export default function GameNotFound() {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <GameGate />
    </main>
  );
}
