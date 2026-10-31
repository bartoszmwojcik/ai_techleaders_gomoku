import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";

export default function HistoryLoading() {
  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">Historia partii</h1>
      <Panel title="Zakończone partie">
        <SkeletonRegion label="Ładowanie historii partii" className="gap-stack">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-target" />
          ))}
        </SkeletonRegion>
      </Panel>
    </main>
  );
}
