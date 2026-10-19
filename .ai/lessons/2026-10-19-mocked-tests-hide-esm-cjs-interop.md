# Unit tests with mocks didn't catch a broken `import()` of a CommonJS module

**Problem.** The installer had 100% coverage and passed every unit test, yet the first real `npm run setup` failed with `loadEnvConfig is not a function`.

**Context.** `@next/env` is a bundled CommonJS module. A native ESM `import("@next/env")` in Node returns only `default`, without named exports, while Vitest's interop does expose them, so the test of `defaultDeps.loadNextEnv()` passed. The step tests replaced `loadNextEnv` with a fake, so they never touched the real module.

**Rule.**
- A CommonJS package in `.mjs` scripts loads through `createRequire(import.meta.url)(…)`, which behaves the same in Node and in Vitest, or through `(await import(x)).default`.
- Coverage is not proof that it works: a new script (`scripts/*`) is also run for real, end to end, before it's done, and in CI where possible (the `setup` job).

Related: `.ai/specs/2026-10-19-npm-setup-installer.md`.
