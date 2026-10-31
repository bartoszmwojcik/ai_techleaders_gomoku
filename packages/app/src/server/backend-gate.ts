import { notFound } from "next/navigation";

/**
 * Interim gate of the admin panel (#152): until the administrator role (E08) exists, `/backend`
 * is reachable only outside production. Decided from the server's own `NODE_ENV`, never from
 * anything the request carries.
 */
export function isBackendEnabled(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production";
}

/**
 * Answers 404 in production. EVERY `page.tsx`, `route.ts` and server action under
 * `app/(backend)` must call this first: a layout does not wrap route handlers or actions and
 * is not re-run on client navigation, so hiding the link or gating the layout alone is not
 * enough (`backend-gate.test.ts` enforces the pattern).
 */
export function assertBackendEnabled(env: Record<string, string | undefined> = process.env): void {
  if (!isBackendEnabled(env)) notFound();
}
