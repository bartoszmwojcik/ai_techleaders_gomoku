import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@gomoku/ui/globals.css";

export const metadata: Metadata = {
  title: { default: "Panel — Gomoku", template: "%s — Panel Gomoku" },
  robots: { index: false, follow: false },
};

export default function BackendLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
