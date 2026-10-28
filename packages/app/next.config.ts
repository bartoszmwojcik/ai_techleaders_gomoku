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

const nextConfig: NextConfig = {
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
      // The verification token is in the address: the page must not leak it in `Referer`.
      source: "/verify-email",
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    },
  ],
};

export default nextConfig;
