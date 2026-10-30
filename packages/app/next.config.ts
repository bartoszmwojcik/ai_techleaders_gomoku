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
      // The verification and reset tokens are in the address: the pages must not leak them in `Referer`.
      source: "/verify-email",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
    {
      source: "/reset-password",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
  ],
};

export default nextConfig;
