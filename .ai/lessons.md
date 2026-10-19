# Lessons

Indeks lekcji. Jedna linia na wpis: `- [Tytuł](lessons/YYYY-MM-DD-slug.md) — reguła w jednym zdaniu`.

- [MikroORM v7: checkConnection nie łączy](lessons/2026-10-18-mikro-orm-v7-lazy-connection.md) — dostępność bazy sprawdzaj zapytaniem `select 1`, a pakiety `@mikro-orm/*` + `kysely` trzymaj w `serverExternalPackages`.
- [Środowisko sandboxa nadpisuje .env](lessons/2026-10-18-sandbox-env-overrides.md) — przed operacjami na bazie sprawdź `DATABASE_URL` w env; `build`/`start` muszą mieć `NODE_ENV=production`.
