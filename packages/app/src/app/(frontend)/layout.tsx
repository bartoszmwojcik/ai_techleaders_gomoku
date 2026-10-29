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
      <body className="flex min-h-svh flex-col bg-surface-page text-text-primary antialiased">
        {/* In the flow, above every page: the switch never overlaps content, and the row has a fixed height. */}
        <div className="flex justify-end px-group pt-group">
          <ThemeToggle initialTheme={theme} />
        </div>
        {children}
      </body>
    </html>
  );
}
