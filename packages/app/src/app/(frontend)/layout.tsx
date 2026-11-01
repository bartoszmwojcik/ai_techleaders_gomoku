import {
  THEME_COOKIE,
  parseTheme,
  themeInitScript,
} from "@gomoku/core/theme/theme";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

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
        {/* In the flow, above every page: the switch never overlaps content, and the row has a fixed height. A page that
            marks its `main` with `data-theme-overlay` (the board, issue 181) lets the switch float over the corner below `sm`,
            so it shares the heading's row instead of owning a row. */}
        <div className="flex justify-end px-group pt-group group-has-[[data-theme-overlay]]/body:max-sm:absolute group-has-[[data-theme-overlay]]/body:max-sm:top-0 group-has-[[data-theme-overlay]]/body:max-sm:right-0 group-has-[[data-theme-overlay]]/body:max-sm:z-10">
          <ThemeToggle initialTheme={theme} />
        </div>
        {children}
      </body>
    </html>
  );
}
