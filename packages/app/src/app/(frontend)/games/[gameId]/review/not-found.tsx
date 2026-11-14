import { ErrorState } from "@gomoku/ui/game/error-state";
import { TextLink } from "@gomoku/ui/game/text-link";

import { getI18n } from "@/i18n/server";

// Rendered by `notFound()` in the page. One text for a game that is missing, one removed after the
// retention period (`db:cleanup`) and one that is not the visitor's: it never says which (N-05).
export default async function ReviewNotFound() {
  const { t } = await getI18n("review");
  return (
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col justify-center gap-stack px-panel py-section">
      <ErrorState
        title={t("notFoundTitle")}
        action={
          <TextLink href="/history" placement="standalone">
            {t("backToHistory")}
          </TextLink>
        }
      >
        {t("notFoundBody")}
      </ErrorState>
    </main>
  );
}
