import type { Metadata } from "next";
import type { ReactNode } from "react";

import { requireAdmin } from "@/server/http/admin-gate";

import "@gomoku/ui/globals.css";

export const metadata: Metadata = {
  title: { default: "Panel — Gomoku", template: "%s — Panel Gomoku" },
  robots: { index: false, follow: false },
};

export default async function BackendLayout({ children }: Readonly<{ children: ReactNode }>) {
  // 404 for everybody but the installation administrator (E08-S02). Pages, route handlers and actions repeat it: a layout does not cover them.
  await requireAdmin();

  return (
    <html lang="pl">
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
