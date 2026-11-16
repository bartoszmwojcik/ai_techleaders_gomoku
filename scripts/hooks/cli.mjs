// Entry point of the PreToolUse hook (see main.mjs and guard-edits.mjs).
import { existsSync } from "node:fs";
import { text } from "node:stream/consumers";

import { main } from "./main.mjs";

process.exitCode = await main({
  readStdin: () => text(process.stdin),
  fileExists: existsSync,
  error: console.error,
});
