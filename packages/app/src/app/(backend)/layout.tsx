import type { Metadata } from "next";
import type { ReactNode } from "react";

import { assertBackendEnabled } from "@/server/backend-gate";

import "@gomoku/ui/globals.css";

export const metadata: Metadata = {
  title: { default: "Panel — Gomoku", template: "%s — Panel Gomoku" },
  robots: { index: false, follow: false },
};

export default function BackendLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Interim production gate (issue 152, see backend-gate.ts); pages, route handlers and actions repeat it (a layout does not cover them).
  assertBackendEnabled();

  return (
    <html lang="pl">
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
