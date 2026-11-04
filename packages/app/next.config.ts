import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// .env files live in the monorepo root, shared with the MikroORM CLI (packages/db).
// `next dev` has already called `loadEnvConfig` for the app directory (packages/app), and
// @next/env returns that cached result for any later call unless it is forced to reload; without
// `forceReload` the root `.env.local` is silently ignored in development.
loadEnvConfig(
  resolve(import.meta.dirname, "../.."),
  process.env.NODE_ENV !== "production",
  console,
  true,
);

// Builds on a small VPS (2 GB, one core) die when Next starts one worker per host CPU and type-checks inside
// the build: the Dockerfile sets these two variables when LOW_MEMORY=1 (README.md, "Wdrożenie na mikr.us").
// Types are then checked by a separate `tsc` run before `next build`, so they are never skipped.
const buildCpus = Number(process.env.NEXT_BUILD_CPUS);

// Browser features the app never uses are switched off for the page and every frame in it.
// `clipboard-write` (invite link copy) is left at its default, which allows the page itself.
const PERMISSIONS_POLICY = [
  "accelerometer",
  "bluetooth",
  "camera",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "payment",
  "serial",
  "usb",
]
  .map((feature) => `${feature}=()`)
  .join(", ");

const nextConfig: NextConfig = {
  experimental: Number.isInteger(buildCpus) && buildCpus > 0 ? { cpus: buildCpus } : undefined,
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "1" },
  // MikroORM v7 is not on Next.js' built-in external list (only the v6 packages are),
  // so keep it out of the server bundle and load it with Node.js `require`.
  serverExternalPackages: [
    "@mikro-orm/core",
    "@mikro-orm/sql",
    "@mikro-orm/postgresql",
    "kysely",
  ],
  headers: async () => [
    {
      // T-08: baseline for every response. No HSTS (hard to undo) and no CSP (needs a nonce for the
      // theme script) yet. Next applies matching rules in order and a later rule wins for the same
      // header, so the per-route rules below must stay AFTER this one (`next.config.test.ts`).
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
      ],
    },
    {
      // The verification and reset tokens are in the address: the pages must not leak them in `Referer`.
      source: "/verify-email",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
    {
      source: "/confirm-email-change",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
    {
      source: "/reset-password",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
  ],
};

export default nextConfig;
