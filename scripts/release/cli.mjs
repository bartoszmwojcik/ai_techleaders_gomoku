// Entry point of the release helpers (see main.mjs).
import { main } from "./main.mjs";

process.exitCode = main(process.argv.slice(2), { root: process.cwd(), log: console.log, error: console.error });
