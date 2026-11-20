import { EmptyState } from "@gomoku/ui/game/empty-state";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { Metadata } from "next";

import { getI18n } from "@/i18n/server";

import FrontendLayout from "./(frontend)/layout";

/**
 * The 404 of an address that matches no route (`experimental.globalNotFound`, issue 328). Next skips every layout here,
 * so the page wraps itself in the player layout: the document, `frontend.css`, the theme and the top bar. The layout
 * reads cookies and the proxy's nonce, so the page renders per request and Next's scripts carry the nonce; Next's
 * default 404 was prerendered at build time, without one, and the Content Security Policy blocked its scripts.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n("common");
  return { title: t("notFound.metaTitle"), description: t("meta.description") };
}

export default async function GlobalNotFound() {
  const { t } = await getI18n("common");
  // Called, not rendered as an element: the layout is an async server component, and the result is the same document.
  return FrontendLayout({
    children: (
      <main
        data-testid="global-not-found"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-stack px-panel py-section"
      >
        <h1 className="m-0 text-section font-strong">{t("notFound.heading")}</h1>
        <EmptyState
          title={t("notFound.body")}
          action={
            <TextLink href="/" placement="standalone">
              {t("notFound.backHome")}
            </TextLink>
          }
        />
      </main>
    ),
  });
}
