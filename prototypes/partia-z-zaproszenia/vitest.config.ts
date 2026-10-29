import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Navigation tests of the prototype. Run from the repository root:
//   npx vitest run --config prototypes/partia-z-zaproszenia/vitest.config.ts
// They are not part of the product's unit-test projects (packages/*), so the 100% coverage threshold does not apply.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    css: false,
  },
});
