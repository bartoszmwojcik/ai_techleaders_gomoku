import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// .env files live in the monorepo root, shared with the MikroORM CLI (packages/db).
loadEnvConfig(resolve(import.meta.dirname, "../.."), process.env.NODE_ENV !== "production");

const nextConfig: NextConfig = {
  // MikroORM v7 is not on Next.js' built-in external list (only the v6 packages are),
  // so keep it out of the server bundle and load it with Node.js `require`.
  serverExternalPackages: [
    "@mikro-orm/core",
    "@mikro-orm/sql",
    "@mikro-orm/postgresql",
    "kysely",
  ],
};

export default nextConfig;
