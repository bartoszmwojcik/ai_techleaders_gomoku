// Entry point of the architecture model check (see main.mjs).
import { readCodeFacts } from "./code-facts.mjs";
import { loadModel } from "./likec4-model.mjs";
import { main } from "./main.mjs";

process.exitCode = await main(process.argv.slice(2), {
  root: process.cwd(),
  loadModel,
  readCodeFacts,
  log: console.log,
  error: console.error,
});
