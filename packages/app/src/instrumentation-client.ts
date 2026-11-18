import { config } from "zod";

// Runs before the app hydrates. Zod 4 probes `new Function("")` on the first parse to pick its JIT parser;
// our Content Security Policy has no 'unsafe-eval', so that probe logs a script-src violation on every hard
// load. Jitless mode skips the probe and uses the interpreted parser, which zod would fall back to anyway.
config({ jitless: true });
