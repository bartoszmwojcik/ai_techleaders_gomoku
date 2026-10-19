# MikroORM 7 creates a missing database by default (`ensureDatabase: true`)

**Problem.** A probe connecting to a URL with a database that doesn't exist reported "OK". MikroORM had just created that database (`nope`, `no_such_db_7f3a`) on the first connection.

**Context.** In MikroORM 7, `ensureDatabase` defaults to `true` (`@mikro-orm/core/utils/Configuration.js`). `createOrmConfig` in `packages/db/src/config.ts` doesn't override it. So the app, the CLI and the tests create the database from `DATABASE_URL` silently, which contradicts the `AGENTS.md` rule "nie używaj `ensureDatabase` w aplikacji". A typo in the database name gives a new, empty database instead of an error.

**Rule.**
- Any code that only checks the database (probes, healthchecks, tools) passes `ensureDatabase: false`, as `packages/db/src/cli/status.ts` does.
- Experiments with connection URLs run only against databases whose creation you can roll back; check `pg_database` afterwards and drop any databases you created.
- `createOrmConfig` (`packages/db/src/config.ts`) sets `ensureDatabase: false` (#9). Don't remove it; to create a database, use `compose.yaml`/Testcontainers or create it by hand.
- Caveat: the MikroORM `Migrator` (`npm run db:migration:*`) calls `ensureDatabase()` regardless of this option (`@mikro-orm/migrations/Migrator.js`), so the migration CLI will still create a missing database. Check `DATABASE_URL` before running migrations.

Related: `.ai/specs/2026-10-19-npm-setup-installer.md`.
