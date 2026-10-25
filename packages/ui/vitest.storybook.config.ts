import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Runs every story as a test (play functions and accessibility checks) in a real browser.
// Chrome comes from the system (channel "chrome"), so no Playwright browser download is needed.
// The theme under test is chosen with VITE_STORY_THEME (see scripts/test-stories.mjs).
export default defineConfig({
  plugins: [storybookTest({ configDir: ".storybook" }), tailwindcss()],
  // Pre-bundled up front: a dependency discovered mid-run makes Vite reload and fail the whole run.
  optimizeDeps: { include: ["class-variance-authority", "cn/config", "radix-ui", "lucide-react"] },
  test: {
    name: "storybook",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: "chrome" } }),
      instances: [{ browser: "chromium" }],
    },
  },
});
