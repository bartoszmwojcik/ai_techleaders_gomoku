// Entry point of the CI helpers (see main.mjs).
import { text } from "node:stream/consumers";

import { main } from "./main.mjs";

process.exitCode = await main(process.argv.slice(2), {
  readStdin: () => text(process.stdin),
  root: process.cwd(),
  log: console.log,
});
