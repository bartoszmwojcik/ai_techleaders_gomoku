import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";

// p07.1: the shape of the game page while the server reads the game.
export default function GameLoading() {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-(--layout-width-dialog) flex-col justify-center gap-stack px-panel py-section">
      <SkeletonRegion label="Ładowanie partii" className="gap-stack">
        <Skeleton className="h-target" />
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="h-target" />
      </SkeletonRegion>
    </main>
  );
}
