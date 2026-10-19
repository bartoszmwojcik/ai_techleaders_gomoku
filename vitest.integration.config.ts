import { defineConfig } from "vitest/config";

// Integration tests: the production build of @gomoku/app running against an ephemeral
// PostgreSQL container, driven through a real browser (agent-browser). See tests/integration.
export default defineConfig({
  test: {
    name: "integration",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    environment: "node",
    // One shared browser session: run test files one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
