# MikroORM v7: `checkConnection()` nie łączy się z bazą

**Problem.** Healthcheck oparty na `orm.checkConnection()` zwracał `503 Connection not established`, choć PostgreSQL działał.

**Kontekst.** W MikroORM v7 `MikroORM.init()` nie otwiera połączenia: klient (Kysely + pula `pg`) powstaje leniwie przy pierwszym zapytaniu. `checkConnection()` sprawdza tylko wewnętrzną flagę `connected`, którą ustawia `orm.connect()` — samo zapytanie przez `em` jej nie ustawia. Do tego v7 zastąpił `knex` pakietem `@mikro-orm/sql` (Kysely), więc wbudowana lista `serverExternalPackages` w Next.js (`@mikro-orm/core`, `@mikro-orm/knex`) jest nieaktualna.

**Reguła.**
- Dostępność bazy sprawdzaj prawdziwym zapytaniem (`em.getConnection().execute("select 1")`), a nie `checkConnection()`/`isConnected()`.
- W `next.config.ts` trzymaj `@mikro-orm/core`, `@mikro-orm/sql`, `@mikro-orm/postgresql` i `kysely` w `serverExternalPackages`.
- Przy integracji biblioteki w nowej wersji głównej czytaj jej źródła / przewodnik migracji, zamiast polegać na API z pamięci.

Powiązane: `.ai/specs/implemented/2026-10-18-monorepo-architecture.md`.
