import type { ReactNode } from "react";

import { I18nProvider } from "@/i18n/context";
import { getI18n, providerI18n } from "@/i18n/server";

/**
 * The game segment's layout (spec Q10): the `common` namespace for everything under it. Next renders `error.tsx` of
 * this segment above `page.tsx`, outside the page's provider, so the error boundary reads its texts from here. Nothing
 * is passed in Polish, so a Polish page carries no catalog.
 */
export default async function GameLayout({ children }: { children: ReactNode }) {
  return <I18nProvider {...providerI18n(await getI18n("common"))}>{children}</I18nProvider>;
}
