# Lessons

Indeks lekcji. Jedna linia na wpis: `- [Tytuł](lessons/YYYY-MM-DD-slug.md) — reguła w jednym zdaniu`.

- [MikroORM v7: checkConnection nie łączy](lessons/2026-10-18-mikro-orm-v7-lazy-connection.md) — dostępność bazy sprawdzaj zapytaniem `select 1`, a pakiety `@mikro-orm/*` + `kysely` trzymaj w `serverExternalPackages`.
- [Środowisko sandboxa nadpisuje .env](lessons/2026-10-18-sandbox-env-overrides.md) — przed operacjami na bazie sprawdź `DATABASE_URL` w env; `build`/`start` muszą mieć `NODE_ENV=production`.
- [Nieaktualny build w testach integracyjnych](lessons/2026-10-19-stale-next-build-in-integration-tests.md) — po zmianie gałęzi/zależności/kodu `npm run build` przed `test:integration`; przy 500 czytaj `tests/integration/server.log`.
- [Lockfile: pola `libc` i npm 11](lessons/2026-10-19-npm-lockfile-libc.md) — instaluj npm z Node 22 (jak CI); npm 11 pomija skrypty instalacyjne, a znikające `libc` to akceptowany szum.
- [MikroORM 7: `ensureDatabase` defaults to true](lessons/2026-10-19-mikro-orm-ensure-database-default.md) — `createOrmConfig` sets `ensureDatabase: false` (#9), and probes do too; the Migrator (migration CLI) still creates a missing DB; after URL experiments check `pg_database`.
- [Mocks hid the ESM/CJS interop](lessons/2026-10-19-mocked-tests-hide-esm-cjs-interop.md) — load CJS packages in `.mjs` through `createRequire`; run a new script end to end, not just to 100% coverage.
- [Docker przyjmuje połączenia przed PostgreSQL](lessons/2026-10-19-docker-proxy-accepts-before-postgres.md) — przejściowe błędy startu bazy (`Connection terminated…`, `57P0x`, `ECONN*`) to „czekaj”; stany startu testuj w pętli na świeżym kontenerze.
