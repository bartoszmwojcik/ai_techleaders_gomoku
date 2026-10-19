// Entry point of `npm run setup` (see main.mjs).
import { main } from "./main.mjs";

process.exitCode = await main(process.argv.slice(2));
