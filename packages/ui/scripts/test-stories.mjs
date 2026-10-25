// Runs the stories as tests once per theme (dark is the default, light is the second theme).
// Responsive layout is tested with narrow frames inside stories (320 px), not with the browser size.
import { spawnSync } from "node:child_process";

const THEMES = ["dark", "light"];
let failed = false;

for (const theme of THEMES) {
  console.log(`\n== Stories in the ${theme} theme ==`);
  const result = spawnSync("npx", ["vitest", "run", "--config", "vitest.storybook.config.ts"], {
    stdio: "inherit",
    env: { ...process.env, VITE_STORY_THEME: theme },
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
