"use client";

import { Button } from "@gomoku/ui/game/button";
import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

import plCommon from "@/i18n/catalogs/pl/common";
import { useT } from "@/i18n/context";

// p07.4: the database does not answer (or anything else broke while reading the game).
// `retry` (Next 16) re-fetches the server component; `reset` would only re-render the failed output.
export default function GameError({ retry }: { error: Error; retry: () => void }) {
  const t = useT("common", plCommon);
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <ErrorState
        title={t("connectionError.title")}
        action={
          <div className="flex flex-wrap items-center gap-group">
            <Button onClick={retry}>{t("connectionError.retry")}</Button>
            <TextLink href="/" placement="standalone">
              {t("connectionError.backHome")}
            </TextLink>
          </div>
        }
      >
        {t("connectionError.body")}
      </ErrorState>
    </main>
  );
}
