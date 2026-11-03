import {
  THEME_COOKIE,
  parseTheme,
  themeInitScript,
} from "@gomoku/core/theme/theme";
import { TextLink } from "@gomoku/ui/game/text-link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { SessionMenu } from "@/components/auth/session-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";

import "./frontend.css";

export const metadata: Metadata = {
  title: "Gomoku",
  description:
    "Gomoku 1:1 online — swobodne zasady, plansza 15×15, zegar 10 minut na gracza.",
};

export default async function FrontendLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    // The init script may set data-theme before hydration, hence suppressHydrationWarning.
    <html lang="pl" data-theme={theme ?? undefined} suppressHydrationWarning>
      <head>
        {theme === null && (
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        )}
      </head>
      <body className="group/body flex min-h-svh flex-col bg-surface-page text-text-primary antialiased">
        {/* In the flow, above every page: the bar never overlaps content, and the row has a fixed height. A page that marks
            its `main` with `data-theme-overlay` (the board, issue 181, where "Postaw kamień" must stay in the first screen)
            lets the bar float below `sm`, so it shares the heading's row: without the "Gomoku" link and with a narrower menu. */}
        <header className="flex items-center justify-between gap-group px-group pt-group group-has-[[data-theme-overlay]]/body:max-sm:absolute group-has-[[data-theme-overlay]]/body:max-sm:inset-x-0 group-has-[[data-theme-overlay]]/body:max-sm:top-0 group-has-[[data-theme-overlay]]/body:max-sm:z-10">
          <div className="flex shrink-0 items-center gap-group">
            <TextLink
              href="/"
              placement="standalone"
              data-testid="home-link"
              className="font-strong text-text-primary no-underline hover:underline group-has-[[data-theme-overlay]]/body:max-sm:hidden"
            >
              Gomoku
            </TextLink>
            <ThemeToggle initialTheme={theme} />
          </div>
          <div className="flex min-w-0 justify-end group-has-[[data-theme-overlay]]/body:max-sm:max-w-28">
            <SessionMenu />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
