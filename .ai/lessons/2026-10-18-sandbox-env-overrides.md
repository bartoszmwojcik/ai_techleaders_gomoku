# Środowisko sandboxa nadpisuje `.env` (`DATABASE_URL`, `NODE_ENV`)

**Problem.** (1) Test migracji, który miał trafić do tymczasowego PostgreSQL, wykonał się na bazie sandboxa `open-mercato`, a zostawiona tabela `mikro_orm_migrations` musiała zostać usunięta ręcznie. (2) `next build` padał na prerenderowaniu `/_global-error` (`Cannot read properties of null (reading 'useContext')`) — także w niezmienionym starterze.

**Kontekst.** Sandbox eksportuje `DATABASE_URL=postgres://…@127.0.0.1:5432/open-mercato` (własny PostgreSQL na porcie 5432) oraz `NODE_ENV=development`. Zmienne procesu mają pierwszeństwo przed plikami `.env*` (tak działa `@next/env`), a `next build` z `NODE_ENV=development` łączy niewłaściwe buildy Reacta.

**Reguła.**
- Przed jakąkolwiek operacją na bazie (migracje, testy, skrypty) sprawdź `env | grep -E '^(DATABASE|PG)'` i świadomie wybierz docelową bazę; testowe migracje uruchamiaj z jawnie podanym `DATABASE_URL`.
- Bazą deweloperską w sandboxie jest ta z `DATABASE_URL` — nie stawiaj drugiej instancji na porcie 5432.
- Skrypty `build`/`start` w `packages/app` ustawiają `NODE_ENV=production` — nie usuwaj tego.

Powiązane: `.ai/specs/implemented/2026-10-18-monorepo-architecture.md`.
