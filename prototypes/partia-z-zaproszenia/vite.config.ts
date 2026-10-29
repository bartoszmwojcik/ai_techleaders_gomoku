import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The prototype is built into the folder Storybook serves as static files (packages/ui/.storybook/public),
// so it opens at /prototypes/partia-z-zaproszenia/index.html. The output is git-ignored; do not commit it.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  plugins: [tailwindcss()],
  build: {
    outDir: path.resolve(here, "../../packages/ui/.storybook/public/prototypes/partia-z-zaproszenia"),
    emptyOutDir: true,
  },
});
