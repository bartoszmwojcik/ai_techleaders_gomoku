import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./frontend.css";

export const metadata: Metadata = {
  title: "Gomoku",
  description: "Gomoku 1:1 online — swobodne zasady, plansza 15×15, zegar 10 minut na gracza.",
};

export default function FrontendLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <body className="min-h-svh bg-stone-900 text-stone-100 antialiased">{children}</body>
    </html>
  );
}
