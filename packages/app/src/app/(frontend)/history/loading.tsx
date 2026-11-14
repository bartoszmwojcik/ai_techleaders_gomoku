import { Panel } from "@gomoku/ui/game/panel";
import { Skeleton, SkeletonRegion } from "@gomoku/ui/game/skeleton";

import { getI18n } from "@/i18n/server";

export default async function HistoryLoading() {
  const { t } = await getI18n("history");
  return (
    <main className="mx-auto flex w-full flex-1 max-w-xl flex-col gap-stack px-panel py-section">
      <h1 className="m-0 text-section font-strong">{t("heading")}</h1>
      <Panel title={t("listTitle")}>
        <SkeletonRegion label={t("loading")} className="gap-stack">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-target" />
          ))}
        </SkeletonRegion>
      </Panel>
    </main>
  );
}
